# Slabsmith partner API v1 (Elite-controlled)

Thryve (or other integrators) get inventory + images through **Brain**, not VPN + MS SQL.

```text
Slabsmith → Windows connector → eliteOS cache
                                      ↓
                         Partner API (token) → Thryve
```

## Enablement (Brain env)

| Variable | Purpose |
|----------|---------|
| `SLABSMITH_PARTNER_API_ENABLED` | `1` to mount usable routes (otherwise 404) |
| `SLABSMITH_PARTNER_API_TOKEN` | Partner bearer token — **must not** equal `SLABSMITH_SYNC_TOKEN` |
| `SLABSMITH_PARTNER_ORGANIZATION_ID` | Optional; falls back to `SLABSMITH_SYNC_ORGANIZATION_ID` / `SLABOS_ORGANIZATION_ID` |
| `SLABSMITH_PARTNER_WRITE_ENABLED` | `1` only after write-request SQL is applied **and** boss approves write intake (still no SQL apply until Windows worker ships) |

## Auth

```http
Authorization: Bearer <SLABSMITH_PARTNER_API_TOKEN>
```

or

```http
X-EliteOS-Slabsmith-Partner-Token: <token>
```

## Routes

Base: `/api/integrations/slabsmith/partner/v1`

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Read/write gate status |
| GET | `/inventory` | Paginated Slabsmith-cache rows + images (`limit`, `offset`, `inventory_id`, `external_slab_id`, `updated_since`, `active`) |
| GET | `/inventory/:key` | By `external_slab_id` or `inventory_id` |
| POST | `/write-requests` | Allowlisted field patches → queue (403 until write gate on) |
| GET | `/write-requests/:id` | Status of one write request |

## Write allowlist (intake only)

`status`, `rack`, `lot`, `finish`, `price_group`, `notes`

Accepted rows land in `slabsmith_partner_write_requests` with `apply_status=queued_pending_worker`. **No Slabsmith SQL mutation** until an Elite-owned Windows apply worker is built and separately enabled.

SQL draft: `backend-core/supabase/eliteos_slabsmith_partner_write_requests_v1.sql`.

## Prerequisites

1. Windows connector ingesting XML + images into eliteOS (existing path).
2. Partner env vars on production Brain.
3. For write intake: apply SQL + set `SLABSMITH_PARTNER_WRITE_ENABLED=1`.
4. For true Slabsmith writeback: Windows apply worker (not shipped in v1).

## What this replaces

Thryve’s ask for VPN + direct MS SQL API. They integrate against this contract; Elite keeps credentials, allowlists, and kill switches.
