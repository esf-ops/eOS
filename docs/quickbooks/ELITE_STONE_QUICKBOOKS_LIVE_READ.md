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

On the QuickBooks production VM (PowerShell 5.1, no Git/Node required), copy only:

`quickbooks-sdk-connector/live-read-smoke.ps1`

Then run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\live-read-smoke.ps1
```

Defaults to `https://127.0.0.1:8166`, prompts for Gateway username/password (SecureString), sends **exactly one** read-only `EstimateQueryRq` (`MaxReturned=1`, `IncludeLinkedTxns=true`) using the **same** HTTP headers/Basic Auth/QBXML envelope as the Node transport, and writes sanitized JSON to `C:\ThryveIntegration\slabOS-live-read-smoke.json`.

TLS certificate bypass is **localhost-only** and must not be reused for remote/production networking.
