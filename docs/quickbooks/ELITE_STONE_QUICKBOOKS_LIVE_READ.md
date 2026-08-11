# QuickBooks Live Read Foundation (Phase 2)

**Status:** Read-only Gateway transport + bounded probe  
**Non-goals:** No QuickBooks writes, no Sales Dashboard production changes, no commercial CData driver install in this repo.

## Architecture

Transport boundary under `backend-core/src/quickbooks/live/`:

| Module | Role |
|--------|------|
| `quickBooksGatewayConfig.js` | Env-only credentials; refuse unless `QB_LIVE_READ_ENABLED=1` |
| `quickBooksGatewayHttpTransport.js` | HTTP POST QBXML to CData QuickBooks Desktop Gateway |
| `quickBooksLiveQbxml.js` | Read-only QBXML builders + parsers (`IncludeLinkedTxns`, AppliedToTxn) |
| `quickBooksLiveReadClient.js` | Public query API only (frozen) |
| `quickBooksLiveProbe.js` | Bounded probe → sanitized `debug/quickbooks/live-read-probe/` |
| `compareLiveLinksToInferred.js` | Pure compare live links vs July memo-inferred links |

Reuses `estimateSalesTruth` helpers and intelligence `extractLinkedTxnRefs` / money parsers. Does **not** create a parallel accounting subsystem.

## Transport status (important)

**Raw QBXML HTTP POST to the CData Remote Connector / Desktop Gateway root endpoint was not validated on the production QuickBooks VM.** Observed behavior: HTTP **200** with an **empty body**, so that path must **not** be treated as a production transport without a supported CData client/protocol (driver or documented Gateway API).

**Sales Dashboard QuickBooks Financial Truth — Beta** (`backend-core/src/sales/quickbooksFinancialTruth/`) exposes a fail-soft provider contract and UI strip. It stays **disabled** until:

1. A licensed/supported CData QuickBooks client is installed in the runtime that will query QB, and
2. That runtime has an **approved stable egress IP** allowlisted to Gateway port 8166 (do not open firewall to Any). Vercel-hosted `backend-core` does **not** provide stable egress.

Phase 2 Node + `live-read-smoke.ps1` Gateway code remains for reference. Prefer Desktop SDK COM smoke for VM-side linked-txn checks:

`quickbooks-sdk-connector/live-sdk-linked-smoke.ps1` → `QBXMLRP2.RequestProcessor`.

Do **not** extend the raw CData HTTP approach until a supported client/protocol is confirmed.

## Dependency model

**Already in this repo (no purchase/install required for Node):**

- `axios` — HTTP client  
- `fast-xml-parser` — QBXML response parse  

**Required on the QuickBooks host (ops, not npm):**

- CData **QuickBooks Desktop Gateway** / Remote Connector running and reachable  
- A Gateway user with **read** access (temporary smoke account or future `slabos_ro`)  

**Not required / not installed by this phase:**

- CData JDBC / ODBC / ADO.NET QuickBooks **driver** packages  
- Any new npm dependency  

This probe speaks the Gateway’s **HTTP + Basic Auth + QBXML** protocol directly (same family as the Gateway’s embedded web server used by CData drivers).

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `QB_LIVE_READ_ENABLED` | yes (`1`) | Hard gate — refuse all connections otherwise |
| `QB_GATEWAY_URL` | yes | e.g. `https://qb-host:8166` or `http://127.0.0.1:8166` |
| `QB_GATEWAY_USER` | yes | Gateway user (not a QB company-file login name in source) |
| `QB_GATEWAY_PASSWORD` | yes | Gateway password — never logged |
| `QB_GATEWAY_SSL_SERVER_CERT` | if TLS | PEM file path, inline PEM, or `insecure` (local smoke only) |
| `QB_LIVE_QBXML_VERSION` | no | default `16.0` |
| `QB_LIVE_PROBE_TXN_LIMIT` | no | default `10` (max 25) |
| `QB_LIVE_PROBE_LIST_LIMIT` | no | default `100` for reference lists |
| `QB_LIVE_PROBE_FROM_TXN_DATE` | no | default ~90 days ago |
| `QB_LIVE_REQUEST_TIMEOUT_MS` | no | default `120000` |

Never commit credentials. Never expose them to frontend code.

## Probe command

```bash
QB_LIVE_READ_ENABLED=1 \
QB_GATEWAY_URL=https://YOUR_QB_HOST:8166 \
QB_GATEWAY_USER=YOUR_GATEWAY_USER \
QB_GATEWAY_PASSWORD=YOUR_GATEWAY_PASSWORD \
QB_GATEWAY_SSL_SERVER_CERT=/path/to/gateway.pem \
  npm run qb:probe:live-read -- --out debug/quickbooks/live-read-probe
```

Optional inferred-links JSON for comparison:

```bash
npm run qb:probe:live-read -- \
  --out debug/quickbooks/live-read-probe \
  --inferred-links /path/to/inferred-links.json
```

`inferred-links.json` shape: array of
`{ estimateTxnId, estimateRefNumber, salesOrderTxnIds[], invoiceTxnIds[] }`.

## Artifacts (gitignored)

Under `debug/quickbooks/live-read-probe/`:

- `connection-summary.json`
- `estimate-links.json`
- `sales-order-links.json`
- `invoice-links.json`
- `payment-applications.json`
- `reference-lists-summary.json`
- `live-vs-inferred-comparison.json`

Artifacts keep opaque ListID/TxnID/amounts/link types only — no customer names, memos, or passwords.

## Safety

Public client methods are query/ping/describe/executeReadOnlyQbXml only.  
QBXML allowlist rejects `EstimateAdd` / `InvoiceAdd` / `SalesOrderAdd` / `ReceivePaymentAdd` / `TxnDel` / list add-mod tags before send.

## Windows VM smoke (no Node)

### Preferred: direct Desktop SDK COM (validated path)

On the QuickBooks production VM (PowerShell 5.1, no Git/Node required), copy:

`quickbooks-sdk-connector/live-sdk-linked-smoke.ps1`

QuickBooks Desktop must be running with the company file open (Multi-User Mode is OK). Then:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\live-sdk-linked-smoke.ps1
```

Uses ProgID `QBXMLRP2.RequestProcessor`, app name `EliteOS QuickBooks SDK Connector`, `OpenConnection2` + `BeginSession` with `qbFileOpenDoNotCare`, sends **exactly one** read-only `EstimateQueryRq` (`MaxReturned=1`, `IncludeLinkedTxns=true`, last ~90 days), and writes sanitized JSON to `C:\ThryveIntegration\slabOS-sdk-linked-smoke.json`.

Optional env overrides (same as the .NET connector): `QB_APP_NAME`, `QB_APP_ID`, `QBXML_VERSION` (default `13.0`), `QB_COMPANY_FILE` (empty = currently open).

### Legacy: CData Gateway HTTP smoke (not production-validated)

`quickbooks-sdk-connector/live-read-smoke.ps1` still mirrors the Node Gateway HTTP+QBXML client for localhost experiments. **Do not use it as production transport** until a supported CData client/protocol is confirmed (raw root POST returned HTTP 200 with an empty body on the production VM).

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\live-read-smoke.ps1
```

Defaults to `https://127.0.0.1:8166`, prompts for Gateway username/password (SecureString). TLS certificate bypass is **localhost-only** and must not be reused for remote/production networking.
