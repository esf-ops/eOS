# Quote Intake Lab — Phase 4B.4B.3 notes

**Date:** 2026-07-15  
**Status:** Implemented (workspace provenance labels; no Gemini request)

## Root cause

`QuoteIntakeLabApp` hard-coded the takeoff topbar chip as `LAB · simulated takeoff` whenever Takeoff Review was open. `IsolationBanner` only had a static takeoff variant that always claimed simulated + “attachment contents not read” + “no Gemini”. Warning helper copy also hard-coded `simulated run`.

Live Gemini successes therefore still looked simulated at the shell level even though the in-pane run summary was correct.

## Provenance resolution rules

Central helper: `src/takeoff/takeoffWorkspaceProvenance.mjs` → `resolveTakeoffWorkspaceMode`.

1. If an inspected run is selected → use `run.provider.mode` (including failed live).
2. Else → use the provider selector (`simulated` default / `live` when chosen).
3. Default → `simulated`.

`TakeoffReviewWorkspace` reports the resolved mode to the app shell via `onWorkspaceModeChange`.

## Exact labels

| Mode | Topbar chip | Isolation banner highlights |
|------|-------------|-----------------------------|
| Simulated | `LAB · simulated takeoff` | Simulated takeoff · attachment contents not read · No Gemini · production/pricing/IE/QL isolation |
| Live | `LAB · live Gemini takeoff` | Live Gemini takeoff · Isolated loopback only · Approved synthetic fixtures only · Attachment bytes sent only after acknowledgment + Run · No production / pricing / IE / QL |

## Historical-run behavior

Selecting simulated history shows simulated shell labels; selecting live (success or failed) shows live labels; returning to the newest live success restores live labels.

## Warning copy

Informational required-action text is now:  
`Informational — no action required for this lab takeoff run.`  
(never “simulated run”). Severity/approval semantics unchanged.

## Confirmation

No Gemini request was made. Production Takeoff / Brain routes untouched.
