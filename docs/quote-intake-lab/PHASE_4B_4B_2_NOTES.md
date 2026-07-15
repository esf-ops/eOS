# Quote Intake Lab — Phase 4B.4B.2 notes

**Date:** 2026-07-15
**Status:** Implemented (browser `Buffer is not defined` fix; no paid Gemini call)

## Root cause

Browser live takeoff failed with `TAKEOFF_FAILURE: Buffer is not defined` **before** `POST /takeoff`.

Exact browser-reachable sites:

1. `TakeoffService._runLiveAdapter` — previously `Buffer.isBuffer` / `Buffer.from` on attachment bytes (first throw on the live path).
2. `LiveGeminiTakeoffAdapter.run` — previously `Buffer.isBuffer` / `Buffer.from` and `contentBytes.toString("base64")` (would also fail in the browser).

SHA-256 verification succeeded because `sha256.mjs` uses Web Crypto in the browser. Encoding never ran: the Node `Buffer` global is not available in the Vite browser bundle.

**Conclusion:** The failed browser attempt did **not** reach `POST /takeoff`.

## Fix

- Added `src/takeoff/base64.mjs` with `toUint8Array` / `bytesToBase64` (chunked `btoa` or pure alphabet; no Buffer polyfill).
- Wired adapter + service to those helpers.
- Failed runs now persist `null` measured totals (not zeros); UI shows `—` and states that no measured result was produced; prior successful overlay SF is retained; retry appends a new immutable run.

## Round-trip proof (automated)

Synthetic PDF (`0833ca1af…`) encode with `globalThis.Buffer` removed → Node decode → identical length, SHA-256, and `%PDF` magic. Large (>chunk) payload covered similarly.

## Production isolation

No edits under `app-ai-takeoff/**`, `backend-core/src/takeoff/**`, or `backend-core/src/server.js`. Allowlist / ack / hash / token gates unchanged. No `live-takeoff-smoke` or paid request during this fix.
