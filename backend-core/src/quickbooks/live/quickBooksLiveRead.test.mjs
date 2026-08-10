/**
 * QuickBooks live read foundation — unit tests (fake transport only, no live Gateway).
 * Run: node backend-core/src/quickbooks/live/quickBooksLiveRead.test.mjs
 */

import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadQuickBooksGatewayConfig,
  assertQuickBooksLiveReadReady,
  isQuickBooksLiveReadEnabled,
  summarizeGatewayConfig,
} from "./quickBooksGatewayConfig.js";
import {
  assertReadOnlyQbXml,
  buildEstimateLinkedQuery,
  buildHostQuery,
  FORBIDDEN_QBXML_REQUEST_TAGS,
  parseQbXmlResponse,
  extractTxnLinkSummary,
  extractRetRecords,
} from "./quickBooksLiveQbxml.js";
import { createFakeGatewayTransport, buildTlsOptions } from "./quickBooksGatewayHttpTransport.js";
import {
  createQuickBooksLiveReadClient,
  findForbiddenWriteMethods,
  QUICKBOOKS_LIVE_READ_PUBLIC_METHODS,
} from "./quickBooksLiveReadClient.js";
import {
  compareLiveLinksToInferred,
  buildInferredLinksFromDiscoveryCompacts,
} from "./compareLiveLinksToInferred.js";
import { runQuickBooksLiveReadProbe, sanitizeLiveTxnArtifact } from "./quickBooksLiveProbe.js";
import * as livePackage from "./index.js";
import { parseProbeArgs } from "../../scripts/probeQuickBooksLiveRead.mjs";

const enabledEnv = {
  QB_LIVE_READ_ENABLED: "1",
  QB_GATEWAY_URL: "https://127.0.0.1:8166",
  QB_GATEWAY_USER: "probe_user",
  QB_GATEWAY_PASSWORD: "not-a-real-secret",
  QB_LIVE_PROBE_TXN_LIMIT: "5",
};

function sampleEstimateXml() {
  return `<?xml version="1.0"?>
<QBXML>
  <QBXMLMsgsRs>
    <EstimateQueryRs statusCode="0" statusSeverity="Info" statusMessage="Status OK">
      <EstimateRet>
        <TxnID>EST-1</TxnID>
        <RefNumber>24-1001</RefNumber>
        <TxnDate>2024-06-01</TxnDate>
        <CustomerRef><ListID>CUST-1</ListID><FullName>Secret Customer</FullName></CustomerRef>
        <Subtotal>1000.00</Subtotal>
        <SalesTaxTotal>0.00</SalesTaxTotal>
        <TotalAmount>1000.00</TotalAmount>
        <LinkedTxn>
          <TxnID>SO-1</TxnID>
          <TxnType>SalesOrder</TxnType>
        </LinkedTxn>
        <Memo>should not leak</Memo>
      </EstimateRet>
    </EstimateQueryRs>
  </QBXMLMsgsRs>
</QBXML>`;
}

function samplePaymentXml() {
  return `<?xml version="1.0"?>
<QBXML>
  <QBXMLMsgsRs>
    <ReceivePaymentQueryRs statusCode="0" statusSeverity="Info" statusMessage="Status OK">
      <ReceivePaymentRet>
        <TxnID>PAY-1</TxnID>
        <TxnDate>2024-06-15</TxnDate>
        <CustomerRef><ListID>CUST-1</ListID></CustomerRef>
        <TotalAmount>500.00</TotalAmount>
        <AppliedToTxnRet>
          <TxnID>INV-1</TxnID>
          <TxnType>Invoice</TxnType>
          <Amount>500.00</Amount>
        </AppliedToTxnRet>
      </ReceivePaymentRet>
    </ReceivePaymentQueryRs>
  </QBXMLMsgsRs>
</QBXML>`;
}

function sampleListXml(queryRs, retTag, ids) {
  const rets = ids
    .map((id) => `<${retTag}><ListID>${id}</ListID><Name>Hidden</Name><IsActive>true</IsActive></${retTag}>`)
    .join("");
  return `<?xml version="1.0"?><QBXML><QBXMLMsgsRs><${queryRs} statusCode="0" statusSeverity="Info" statusMessage="OK">${rets}</${queryRs}></QBXMLMsgsRs></QBXML>`;
}

function fakeTransportRouter() {
  return createFakeGatewayTransport(async (qbXml) => {
    if (qbXml.includes("EstimateAddRq")) throw new Error("should never send writes");
    if (qbXml.includes("HostQueryRq")) {
      return `<?xml version="1.0"?><QBXML><QBXMLMsgsRs><HostQueryRs statusCode="0" statusSeverity="Info" statusMessage="OK"><HostRet><ProductName>QuickBooks</ProductName></HostRet></HostQueryRs></QBXMLMsgsRs></QBXML>`;
    }
    if (qbXml.includes("EstimateQueryRq")) return sampleEstimateXml();
    if (qbXml.includes("SalesOrderQueryRq")) {
      return `<?xml version="1.0"?><QBXML><QBXMLMsgsRs><SalesOrderQueryRs statusCode="0" statusSeverity="Info" statusMessage="OK"><SalesOrderRet><TxnID>SO-1</TxnID><RefNumber>9</RefNumber><TxnDate>2024-06-02</TxnDate><CustomerRef><ListID>CUST-1</ListID></CustomerRef><TotalAmount>1000.00</TotalAmount><Memo>Estimate 24-1001:</Memo><LinkedTxn><TxnID>EST-1</TxnID><TxnType>Estimate</TxnType></LinkedTxn></SalesOrderRet></SalesOrderQueryRs></QBXMLMsgsRs></QBXML>`;
    }
    if (qbXml.includes("InvoiceQueryRq")) {
      return `<?xml version="1.0"?><QBXML><QBXMLMsgsRs><InvoiceQueryRs statusCode="0" statusSeverity="Info" statusMessage="OK"><InvoiceRet><TxnID>INV-1</TxnID><RefNumber>1</RefNumber><TxnDate>2024-06-10</TxnDate><CustomerRef><ListID>CUST-1</ListID></CustomerRef><Subtotal>1000.00</Subtotal><SalesTaxTotal>0.00</SalesTaxTotal><LinkedTxn><TxnID>EST-1</TxnID><TxnType>Estimate</TxnType></LinkedTxn></InvoiceRet></InvoiceQueryRs></QBXMLMsgsRs></QBXML>`;
    }
    if (qbXml.includes("ReceivePaymentQueryRq")) return samplePaymentXml();
    if (qbXml.includes("TemplateQueryRq")) return sampleListXml("TemplateQueryRs", "TemplateRet", ["T1", "T2"]);
    if (qbXml.includes("CustomerMsgQueryRq")) return sampleListXml("CustomerMsgQueryRs", "CustomerMsgRet", ["M1"]);
    if (qbXml.includes("PaymentMethodQueryRq"))
      return sampleListXml("PaymentMethodQueryRs", "PaymentMethodRet", ["PM1"]);
    if (qbXml.includes("SalesTaxCodeQueryRq"))
      return sampleListXml("SalesTaxCodeQueryRs", "SalesTaxCodeRet", ["STC1"]);
    if (qbXml.includes("ItemSalesTaxQueryRq"))
      return sampleListXml("ItemSalesTaxQueryRs", "ItemSalesTaxRet", ["IST1"]);
    throw new Error(`unexpected query: ${qbXml.slice(0, 80)}`);
  });
}

// ── config gate ──────────────────────────────────────────────────────────────
{
  assert.equal(isQuickBooksLiveReadEnabled({}), false);
  assert.equal(isQuickBooksLiveReadEnabled({ QB_LIVE_READ_ENABLED: "1" }), true);
  assert.throws(() => assertQuickBooksLiveReadReady(loadQuickBooksGatewayConfig({})), /disabled/i);

  const cfg = loadQuickBooksGatewayConfig(enabledEnv);
  const ready = assertQuickBooksLiveReadReady(cfg);
  assert.equal(ready.gatewayUrl, "https://127.0.0.1:8166");
  const summary = summarizeGatewayConfig(ready);
  assert.equal(summary.passwordConfigured, true);
  assert.equal(JSON.stringify(summary).includes("not-a-real-secret"), false);
  console.log("ok: config gate + no password in summary");
}

// ── read-only QBXML guard ────────────────────────────────────────────────────
{
  assert.throws(() => assertReadOnlyQbXml("<EstimateAddRq></EstimateAddRq>"), /Refusing|Forbidden/i);
  assert.throws(() => assertReadOnlyQbXml("<InvoiceAddRq></InvoiceAddRq>"), /Refusing|Forbidden/i);
  assert.throws(() => assertReadOnlyQbXml("<TxnDelRq></TxnDelRq>"), /Refusing|Forbidden/i);
  const ok = buildEstimateLinkedQuery({ qbXmlVersion: "16.0", maxReturned: 10, fromTxnDate: "2024-01-01" });
  assert.match(ok, /IncludeLinkedTxns>true/);
  assert.match(ok, /MaxReturned>10/);
  assert.doesNotThrow(() => assertReadOnlyQbXml(ok));
  assert.doesNotThrow(() => assertReadOnlyQbXml(buildHostQuery("16.0")));
  assert.ok(FORBIDDEN_QBXML_REQUEST_TAGS.includes("EstimateAddRq"));
  console.log("ok: QBXML read-only guard");
}

// ── parse linked + applied ───────────────────────────────────────────────────
{
  const parsed = parseQbXmlResponse(sampleEstimateXml());
  const { records } = extractRetRecords(parsed, "EstimateQueryRs", "EstimateRet");
  assert.equal(records.length, 1);
  const summary = extractTxnLinkSummary(records[0], "Estimate");
  assert.equal(summary.qb_txn_id, "EST-1");
  assert.equal(summary.ref_number, "24-1001");
  assert.equal(summary.total_amount, 1000);
  assert.equal(summary.linked_txns[0].qb_txn_id, "SO-1");
  assert.equal(summary.qb_customer_list_id, "CUST-1");

  const payParsed = parseQbXmlResponse(samplePaymentXml());
  const pay = extractRetRecords(payParsed, "ReceivePaymentQueryRs", "ReceivePaymentRet").records[0];
  const paySummary = extractTxnLinkSummary(pay, "ReceivePayment");
  assert.equal(paySummary.applied_to_txns[0].qb_txn_id, "INV-1");
  assert.equal(paySummary.applied_to_txns[0].amount, 500);
  console.log("ok: parse LinkedTxn + AppliedToTxnRet");
}

// ── client public API has no write methods ───────────────────────────────────
{
  const client = createQuickBooksLiveReadClient(loadQuickBooksGatewayConfig(enabledEnv), {
    transport: fakeTransportRouter(),
  });
  assert.deepEqual(findForbiddenWriteMethods(client), []);
  for (const name of QUICKBOOKS_LIVE_READ_PUBLIC_METHODS) {
    assert.equal(typeof client[name], "function", name);
  }
  assert.equal("EstimateAdd" in client, false);
  assert.equal("executeWrite" in client, false);
  assert.deepEqual(findForbiddenWriteMethods(livePackage), []);

  const estimates = await client.queryEstimatesWithLinks({ maxReturned: 5 });
  assert.equal(estimates.recordCount, 1);
  assert.equal(estimates.records[0].linked_txns[0].txn_type, "SalesOrder");

  await assert.rejects(
    () => client.executeReadOnlyQbXml(`<?xml version="1.0"?><?qbxml version="16.0"?><QBXML><QBXMLMsgsRq onError="stopOnError"><EstimateAddRq></EstimateAddRq></QBXMLMsgsRq></QBXML>`),
    /Refusing|Forbidden|allowlist/i
  );
  console.log("ok: live client read-only API");
}

// ── compare live vs inferred ─────────────────────────────────────────────────
{
  const inferred = buildInferredLinksFromDiscoveryCompacts({
    salesOrders: [{ txnId: "SO-1", linkedEstimateTxnId: "EST-1", estimateRefs: ["24-1001"] }],
    invoices: [{ txnId: "INV-1", linkedEstimateTxnId: "EST-1", estimateRefs: ["24-1001"] }],
  });
  assert.equal(inferred.length, 1);

  const comparison = compareLiveLinksToInferred({
    inferredLinks: inferred,
    liveRecords: [
      {
        txnType: "Estimate",
        qb_txn_id: "EST-1",
        ref_number: "24-1001",
        linked_txns: [{ qb_txn_id: "SO-1", txn_type: "SalesOrder" }],
      },
      {
        txnType: "Estimate",
        qb_txn_id: "EST-2",
        ref_number: "24-9999",
        linked_txns: [{ qb_txn_id: "SO-9", txn_type: "SalesOrder" }],
      },
      {
        txnType: "SalesOrder",
        qb_txn_id: "SO-1",
        linked_txns: [{ qb_txn_id: "EST-OTHER", txn_type: "Estimate" }],
      },
      {
        txnType: "Invoice",
        qb_txn_id: "INV-ORPHAN",
        linked_txns: [],
      },
    ],
  });

  assert.ok(comparison.counts.inferred_link_confirmed >= 1);
  assert.ok(comparison.counts.authoritative_link_not_previously_inferred >= 1);
  assert.ok(comparison.counts.inferred_link_contradicted >= 1);
  assert.ok(comparison.counts.no_authoritative_link_found >= 1);
  console.log("ok: live vs inferred comparison outcomes");
}

// ── probe writes sanitized artifacts ─────────────────────────────────────────
{
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "qb-live-probe-"));
  const client = createQuickBooksLiveReadClient(loadQuickBooksGatewayConfig(enabledEnv), {
    transport: fakeTransportRouter(),
  });
  const inferred = [
    {
      estimateTxnId: "EST-1",
      estimateRefNumber: "24-1001",
      salesOrderTxnIds: ["SO-1"],
      invoiceTxnIds: ["INV-1"],
    },
  ];
  const result = await runQuickBooksLiveReadProbe({
    client,
    config: loadQuickBooksGatewayConfig(enabledEnv),
    outputDir: outDir,
    inferredLinks: inferred,
  });

  for (const name of [
    "connection-summary.json",
    "estimate-links.json",
    "sales-order-links.json",
    "invoice-links.json",
    "payment-applications.json",
    "reference-lists-summary.json",
  ]) {
    const raw = await fs.readFile(path.join(outDir, name), "utf8");
    assert.equal(raw.includes("not-a-real-secret"), false);
    assert.equal(raw.includes("Secret Customer"), false);
    assert.equal(/should not leak/i.test(raw), false);
    JSON.parse(raw);
  }

  const est = JSON.parse(await fs.readFile(path.join(outDir, "estimate-links.json"), "utf8"));
  assert.equal(est.records[0].qb_txn_id, "EST-1");
  assert.equal(est.records[0].linked_txns[0].qb_txn_id, "SO-1");
  assert.ok(!("FullName" in (est.records[0] || {})));

  const pay = JSON.parse(await fs.readFile(path.join(outDir, "payment-applications.json"), "utf8"));
  assert.equal(pay.records[0].applied_to_txns[0].qb_txn_id, "INV-1");

  const refs = JSON.parse(await fs.readFile(path.join(outDir, "reference-lists-summary.json"), "utf8"));
  assert.deepEqual(refs.templates.listIds, ["T1", "T2"]);

  assert.ok(result.artifacts.includes("live-vs-inferred-comparison.json"));
  console.log("ok: probe sanitized artifacts");
}

// ── sanitize helper strips memo text ─────────────────────────────────────────
{
  const sanitized = sanitizeLiveTxnArtifact({
    txnType: "Estimate",
    qb_txn_id: "X",
    linked_txns: [],
    applied_to_txns: [],
    memo_estimate_refs: ["24-1"],
    secret: "nope",
  });
  assert.equal(sanitized.qb_txn_id, "X");
  assert.equal("secret" in sanitized, false);
  console.log("ok: sanitizeLiveTxnArtifact");
}

// ── tls options + parseArgs ──────────────────────────────────────────────────
{
  assert.deepEqual(buildTlsOptions(null).rejectUnauthorized, true);
  assert.equal(buildTlsOptions("insecure").rejectUnauthorized, false);
  const a = parseProbeArgs(["--out", "/tmp/x", "--inferred-links", "/tmp/y.json"]);
  assert.equal(a.outDir, "/tmp/x");
  assert.equal(a.inferredLinksPath, "/tmp/y.json");
  console.log("ok: tls + parseArgs");
}

// ── source scan: no write method implementations ─────────────────────────────
{
  const dir = path.dirname(fileURLToPath(import.meta.url));
  for (const f of [
    "quickBooksLiveReadClient.js",
    "quickBooksGatewayHttpTransport.js",
    "quickBooksLiveQbxml.js",
    "quickBooksLiveProbe.js",
  ]) {
    const src = await fs.readFile(path.join(dir, f), "utf8");
    assert.equal(/function\s+(EstimateAdd|InvoiceAdd|SalesOrderAdd|ReceivePaymentAdd)\b/.test(src), false, f);
    assert.equal(/buildBoundedQueryRq\(\{\s*requestTag:\s*"(EstimateAdd|InvoiceAdd)/.test(src), false, f);
  }
  console.log("ok: source has no write implementations");
}

// ── PowerShell live-read-smoke.ps1 static safety + protocol parity ────────────
{
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const ps1Path = path.join(repoRoot, "quickbooks-sdk-connector", "live-read-smoke.ps1");
  const ps1 = await fs.readFile(ps1Path, "utf8");

  assert.match(ps1, /READ-ONLY DIAGNOSTIC - NO QUICKBOOKS WRITES/);
  assert.match(ps1, /LOCALHOST-ONLY/);
  assert.match(ps1, /https:\/\/127\.0\.0\.1:8166/);
  assert.match(ps1, /C:\\ThryveIntegration\\slabOS-live-read-smoke\.json/);
  assert.match(ps1, /Read-Host.*-AsSecureString/s);
  assert.match(ps1, /Content-Type.*application\/x-qbxml|ContentType "application\/x-qbxml"/);
  assert.match(ps1, /application\/x-qbxml, text\/xml, application\/xml, text\/plain, \*\/*/);
  // Keep-alive semantic parity: Node uses Connection: close; PS 5.1 uses -DisableKeepAlive.
  assert.match(ps1, /-DisableKeepAlive/);
  assert.equal(/Connection\s*=\s*"close"/i.test(ps1), false, "PS 5.1 must not set Connection header");
  assert.match(ps1, /Basic /);
  assert.match(ps1, /IncludeLinkedTxns>true</);
  assert.match(ps1, /MaxReturned>1</);
  assert.match(ps1, /IncludeLineItems>false</);
  assert.match(ps1, /OwnerID>0</);
  assert.match(ps1, /EstimateQueryRq/);
  assert.match(ps1, /Assert-ReadOnlyQbXml/);
  assert.match(ps1, /AddRq/);
  assert.match(ps1, /ModRq/);
  assert.match(ps1, /TxnDelRq/);
  assert.match(ps1, /ListDelRq/);

  // PowerShell 5.1 without BOM mis-parses UTF-8; file must be pure ASCII (bytes 0x00-0x7F).
  const ps1Bytes = await fs.readFile(ps1Path);
  assert.equal(ps1Bytes[0] === 0xef && ps1Bytes[1] === 0xbb && ps1Bytes[2] === 0xbf, false, "ps1 must not have UTF-8 BOM");
  const nonAsciiOffsets = [];
  for (let i = 0; i < ps1Bytes.length; i += 1) {
    if (ps1Bytes[i] > 0x7f) nonAsciiOffsets.push(i);
  }
  assert.equal(
    nonAsciiOffsets.length,
    0,
    `ps1 must be ASCII-only; non-ASCII bytes at offsets: ${nonAsciiOffsets.slice(0, 20).join(", ")}`
  );
  // Must not embed write request payloads / write helpers
  assert.equal(/EstimateAddRq[\s>]/.test(ps1), false);
  assert.equal(/InvoiceAddRq[\s>]/.test(ps1), false);
  assert.equal(/SalesOrderAddRq[\s>]/.test(ps1), false);
  assert.equal(/ReceivePaymentAddRq[\s>]/.test(ps1), false);
  assert.equal(/function\s+Invoke-GatewayQbXml(Add|Write|Mod)/i.test(ps1), false);
  assert.equal(/Send-RawQbXml|Invoke-RawQbXml|Execute-ArbitraryQbXml/i.test(ps1), false);
  assert.match(ps1, /no arbitrary-QBXML escape hatch/i);

  // Exactly one query construction path: EstimateQueryRq only allowlist
  assert.match(ps1, /permits only EstimateQueryRq/);

  // Protocol parity: Node builder with MaxReturned=1 must share the same envelope tokens
  const nodeXml = buildEstimateLinkedQuery({
    qbXmlVersion: "16.0",
    maxReturned: 1,
    fromTxnDate: "2024-01-01",
  });
  for (const token of [
    '<?xml version="1.0" encoding="utf-8"?>',
    "<QBXML><QBXMLMsgsRq onError=\"stopOnError\">",
    "<MaxReturned>1</MaxReturned>",
    "<IncludeLineItems>false</IncludeLineItems>",
    "<IncludeLinkedTxns>true</IncludeLinkedTxns>",
    "<OwnerID>0</OwnerID>",
    "</EstimateQueryRq>",
    "</QBXMLMsgsRs></QBXML>".replace("MsgsRs", "MsgsRq"), // closing msgs request tag
  ]) {
    assert.equal(nodeXml.includes(token), true, `node xml missing ${token}`);
  }
  // Closing envelope token as actually emitted by Node wrapQbXmlRequest:
  assert.equal(nodeXml.includes("</QBXMLMsgsRq></QBXML>"), true);

  // PS1 source constructs the same literals (version interpolated via $QbXmlVersion).
  assert.match(ps1, /<\?xml version="1\.0" encoding="utf-8"\?>/);
  assert.match(ps1, /<\?qbxml version="/);
  assert.match(ps1, /\$QbXmlVersion/);
  assert.match(ps1, /<QBXML><QBXMLMsgsRq onError="stopOnError">/);
  assert.match(ps1, /"<MaxReturned>1<\/MaxReturned>"/);
  assert.match(ps1, /"<IncludeLineItems>false<\/IncludeLineItems>"/);
  assert.match(ps1, /"<IncludeLinkedTxns>true<\/IncludeLinkedTxns>"/);
  assert.match(ps1, /"<OwnerID>0<\/OwnerID>"/);
  assert.match(ps1, /<\/EstimateQueryRq>/);
  assert.match(ps1, /<\/QBXMLMsgsRq><\/QBXML>/);
  assert.match(ps1, /ContentType "application\/x-qbxml"/);
  assert.match(ps1, /Accept\s*=\s*"application\/x-qbxml, text\/xml, application\/xml, text\/plain, \*\/\*"/);
  // Keep-alive: Node axios Connection: close <-> PowerShell 5.1 -DisableKeepAlive
  const nodeTransportPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "quickBooksGatewayHttpTransport.js"
  );
  const nodeTransport = await fs.readFile(nodeTransportPath, "utf8");
  assert.match(nodeTransport, /Connection:\s*"close"/);
  assert.match(ps1, /-DisableKeepAlive/);
  assert.equal(/Connection\s*=\s*"close"/i.test(ps1), false);

  // Transport failure diagnostics: httpStatus=0 must surface caught $failError
  // (not leave the pre-filled "Gateway HTTP status 0"), with Basic auth redacted.
  assert.match(ps1, /\$httpStatus\s*-eq\s*0/);
  assert.match(ps1, /\$sanitized\.error\s*=\s*\$failError/);
  assert.match(ps1, /auth header redacted/i);
  assert.match(ps1, /\(\?i\)basic\\s\+/);

  console.log("ok: PowerShell live-read-smoke.ps1 static safety + protocol parity");
}

// ── PowerShell live-sdk-linked-smoke.ps1 (COM RequestProcessor) ───────────────
{
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
  const ps1Path = path.join(repoRoot, "quickbooks-sdk-connector", "live-sdk-linked-smoke.ps1");
  const ps1 = await fs.readFile(ps1Path, "utf8");
  const ps1Bytes = await fs.readFile(ps1Path);

  assert.match(ps1, /READ-ONLY DIAGNOSTIC - NO QUICKBOOKS WRITES/);
  assert.match(ps1, /QBXMLRP2\.RequestProcessor/);
  assert.match(ps1, /EliteOS QuickBooks SDK Connector/);
  assert.match(ps1, /\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890\}/);
  assert.match(ps1, /OpenConnection2/);
  assert.match(ps1, /BeginSession/);
  assert.match(ps1, /ProcessRequest/);
  assert.match(ps1, /EndSession/);
  assert.match(ps1, /CloseConnection/);
  assert.match(ps1, /ReleaseComObject/);
  assert.match(ps1, /qbFileOpenDoNotCare|OpenModeDontCare\s*=\s*2/);
  assert.match(ps1, /\$OpenModeDontCare\s*=\s*2/);
  assert.match(ps1, /\$OpenConnectionTypeLocalQbd\s*=\s*1/);
  assert.match(ps1, /C:\\ThryveIntegration\\slabOS-sdk-linked-smoke\.json/);
  assert.match(ps1, /EstimateQueryRq/);
  assert.match(ps1, /MaxReturned>1</);
  assert.match(ps1, /IncludeLineItems>false</);
  assert.match(ps1, /IncludeLinkedTxns>true</);
  assert.match(ps1, /OwnerID>0</);
  assert.match(ps1, /\$QbXmlVersion\s*=\s*"13\.0"/);
  assert.match(ps1, /onError="continueOnError"/);
  assert.match(ps1, /Assert-ReadOnlyQbXml/);
  assert.match(ps1, /AddRq/);
  assert.match(ps1, /ModRq/);
  assert.match(ps1, /TxnDelRq/);
  assert.match(ps1, /ListDelRq/);
  assert.match(ps1, /permits only EstimateQueryRq/);
  assert.match(ps1, /no arbitrary-QBXML escape hatch/i);
  assert.match(ps1, /finally/);

  // No CData Gateway / credentials path in this script
  assert.equal(/8166|QB_GATEWAY|Invoke-WebRequest|Basic Auth/i.test(ps1), false);
  assert.equal(/Read-Host.*password/i.test(ps1), false);
  assert.match(ps1, /No CData Gateway/i);

  // Must not embed write request payloads / write helpers
  assert.equal(/EstimateAddRq[\s>]/.test(ps1), false);
  assert.equal(/InvoiceAddRq[\s>]/.test(ps1), false);
  assert.equal(/SalesOrderAddRq[\s>]/.test(ps1), false);
  assert.equal(/ReceivePaymentAddRq[\s>]/.test(ps1), false);
  assert.equal(/Send-RawQbXml|Invoke-RawQbXml|Execute-ArbitraryQbXml/i.test(ps1), false);
  assert.equal(/qbFileOpenSingleUser|OpenModeSingleUser/i.test(ps1), false);
  assert.match(ps1, /Multi-User Mode OK/);
  assert.match(ps1, /do not force single-user/i);

  // PowerShell 5.1: pure ASCII, no BOM
  assert.equal(ps1Bytes[0] === 0xef && ps1Bytes[1] === 0xbb && ps1Bytes[2] === 0xbf, false, "sdk smoke ps1 must not have UTF-8 BOM");
  const nonAsciiOffsets = [];
  for (let i = 0; i < ps1Bytes.length; i += 1) {
    if (ps1Bytes[i] > 0x7f) nonAsciiOffsets.push(i);
  }
  assert.equal(
    nonAsciiOffsets.length,
    0,
    `sdk smoke ps1 must be ASCII-only; non-ASCII bytes at offsets: ${nonAsciiOffsets.slice(0, 20).join(", ")}`
  );

  // Identity parity with .NET connector defaults
  const settingsPath = path.join(repoRoot, "quickbooks-sdk-connector", "Configuration", "ConnectorSettings.cs");
  const settings = await fs.readFile(settingsPath, "utf8");
  assert.match(settings, /EliteOS QuickBooks SDK Connector/);
  assert.match(settings, /\{A1B2C3D4-E5F6-7890-ABCD-EF1234567890\}/);
  assert.match(settings, /"13\.0"/);

  console.log("ok: PowerShell live-sdk-linked-smoke.ps1 static safety + COM identity");
}

console.log("All QuickBooks live read tests passed.");
