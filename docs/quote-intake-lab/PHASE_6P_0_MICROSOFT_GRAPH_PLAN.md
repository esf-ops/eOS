# Phase 6P.0 — Microsoft Graph Deployment Plan

**Date:** 2026-07-15
**Status:** Design only — **no Graph calls in this phase**
**Related:** [`PHASE_6P_0_LIVE_PROMOTION_ARCHITECTURE.md`](./PHASE_6P_0_LIVE_PROMOTION_ARCHITECTURE.md) · [`PHASE_6P_0_DATA_AND_SECURITY_BOUNDARY.md`](./PHASE_6P_0_DATA_AND_SECURITY_BOUNDARY.md)

---

## 1. Goal

Server-only Microsoft Graph connector to read the shared mailbox:

`quotes@elitestonefabrication.com`

using Application permissions scoped by Exchange RBAC to **that mailbox only**.

---

## 2. Existing setup (operator-provided; no secrets in repo)

| Item | Status |
|------|--------|
| Shared Exchange mailbox | `quotes@elitestonefabrication.com` |
| Human mailbox access | Verified |
| Entra app | `eliteOS Quote Intake Lab` (single-tenant) |
| OAuth | Client-credential secret created (**never print/copy values into docs, logs, or browser**) |
| Exchange service principal | Registered |
| Application RBAC | `Application Mail.Read` |
| RBAC resource scope | Only quotes mailbox (`InScope=True`); Hunter `InScope=False` |
| `Mail.Send` | **Not granted** |
| Product connector | **Not implemented** |

---

## 3. Permission contract (pilot)

| Allowed | Forbidden |
|---------|-----------|
| `Mail.Read` (application) against quotes mailbox only | `Mail.Send` |
| Read messages / attachments | Move, delete, mark-read |
| | Set categories / rules / forwarding |
| | User or mailbox enumeration beyond fixed mailbox |
| | Generic Graph proxy from browser |
| | Accepting arbitrary mailbox IDs from clients |

---

## 4. Credential placement

| Concern | Decision |
|---------|----------|
| Where credentials live | Server env only on `backend-core` (or dedicated worker): `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET` (later certificate) |
| Browser | **Never** — no `VITE_*` Graph secrets |
| Token return to client | **Never** |
| Mailbox identity | Fixed in server config: `QUOTE_INTAKE_MAILBOX=quotes@elitestonefabrication.com` — not client-supplied |
| Rotation | Standard secret rotation; support dual-secret overlap window when implemented |
| Certificate later | Prefer client assertion cert over long-lived secret after pilot |

---

## 5. Token acquisition & caching

1. Client-credentials grant against Entra token endpoint (tenant fixed).
2. Cache access token in-memory (or shared cache if multi-instance) until `expires_on - skew`.
3. On `401`, invalidate cache and retry once.
4. Never log token, refresh material, or full auth headers.
5. Token module lives next to Graph client — not in frontend packages.

---

## 6. Initial sync model

**Pilot recommendation: manual Sync button / controlled worker trigger.**

| Stage | Mode |
|-------|------|
| 6P.4 first proof | Manual Sync from Estimator Queue (pilot users) |
| After stability | Scheduled polling |
| Later | Graph webhooks + subscription renewal |

Automatic Takeoff may still run **after** a manually triggered sync when Path A gates pass.

---

## 7. Read path design

```
Sync trigger (authenticated pilot)
  → acquire token
  → list new messages in quotes mailbox (delta or since cursor)
  → for each candidate:
       load message metadata
       load attachment metadata
       if PDF candidate: download bytes server-side only
       HTML body → sanitize → plain text for classification
       persist intake source message + attachments (hashed)
  → advance sync cursor
```

### Identifiers

| ID | Use |
|----|-----|
| Graph message id (immutable preferred) | Primary sync identity |
| `internetMessageId` | Cross-system dedupe (SMTP Message-ID) |
| `conversationId` | **Context only** — never sole dedupe key |
| Attachment id + content bytes SHA-256 | Attachment dedupe / takeoff idempotency |

### Limits (initial proposals — tune in implementation)

| Limit | Suggested pilot default |
|-------|-------------------------|
| Messages per sync | Low tens (e.g. 25) |
| Max attachment size | Align with Takeoff 50 MB ceiling |
| Max pages | Align with existing Takeoff pdf page policy when present |
| Concurrent Graph downloads | Small (e.g. 2) |
| Body retention | Store sanitized plain text + bounded HTML excerpt; avoid unbounded MIME blobs in logs |

---

## 8. HTML → safe plain text

- Prefer Graph `uniqueBody` / text parts when available.
- If HTML only: strip scripts/styles, decode entities, collapse whitespace.
- Classification uses **text/metadata only** — **attachment bytes are not sent to email classification**.
- Plan PDF bytes go **only** to the Takeoff pipeline when automation decides.

---

## 9. Error sanitization

| Graph / auth error | Operator-visible | Log |
|--------------------|------------------|-----|
| Auth failure | “Mailbox auth failed” | Correlation id; no token |
| RBAC forbidden | “Mailbox out of scope or forbidden” | Status code only |
| Throttle 429 | Retry-after honored; surface busy | Retry-After seconds |
| Attachment fetch fail | Per-message failure reason on case | No filenames/bytes |

**Never log:** subjects, bodies, addresses, attachment names/bytes, tokens, secrets, or full Graph resource IDs in production logs (use hashed / truncated correlation keys).

---

## 10. Dedupe with Graph

1. Immutable Graph message id unique per org.
2. Else `internetMessageId` unique per org.
3. Else normalized content-hash fallback of sender+date+subject-hash+attachment hashes (careful; document algorithm).
4. Attachment SHA-256 prevents duplicate automatic Takeoff for same intake/revision.

Re-sync must be a no-op for already-imported identities.

---

## 11. Forwarding modes

| Mode | Pilot |
|------|-------|
| Normal forward, PDF directly attached | **Supported** |
| Forward as attachment / nested `.eml` | **Deferred** — quarantine/manual review if encountered |
| Images with PDF | Store images; do not auto-submit images as plans unless explicitly supported later |

---

## 12. Kill switches (Graph-related)

| Switch | Pilot default |
|--------|---------------|
| `QUOTE_INTAKE_GRAPH_ENABLED` | off until configured |
| `QUOTE_INTAKE_MAILBOX_SYNC_ENABLED` | off / manual only |
| Emergency “stop ingestion” | Disables new sync without affecting Takeoff users |

---

## 13. What Graph must never do in pilot

- Send, reply, forward, or create messages
- Move/delete/mark-read
- Change inbox rules or categories
- Read Hunter or any non-scoped mailbox
- Expose a browser Graph proxy
- Accept mailbox identity from the client

---

## 14. Implementation slice placement

- **6P.4:** Manual preview/import behind flags; synthetic forwards only; no automatic Takeoff
- Worker code under server packages only
- Fixture/sim Graph client for tests (no live Network in CI by default)

---

## 15. Open questions

1. Delta query vs simple `receivedDateTime` cursor for first sync.
2. Whether to store ciphertext-at-rest attachment blobs in Storage vs ephemeral re-fetch (prefer Storage with org scoping).
3. Multi-instance token cache on Vercel (likely per-instance memory OK for pilot).
4. Subscription lifecycle ownership for later webhook phase.
