# Moraware login mechanics — human verification checklist

**Purpose:** Decide whether `fetchReportFeedArtifacts` can use **server-side HTTP only** (no headless browser).  
**When:** Phase B, before any fetch code or credential tables.  
**Account:** Use a dedicated Moraware Admin user for report feeds — not API/SDK creds unless you confirm they share the same login.

**Setup:** Private/incognito window → DevTools → **Network** (Preserve log) → disable cache.

**Do not commit:** passwords, cookie values, SID, session headers, or export bodies with customer PII. Record findings in private notes; repo gets **yes/no + mechanism names only**.

---

## 1. Login request

- [ ] Note login page URL (path only, e.g. `/sys/login`).
- [ ] Login is a plain **HTML form POST** (not JS-only / OAuth-only).
- [ ] List **field names** only: username, password, any hidden fields (CSRF token name if present).
- [ ] Successful login returns **Set-Cookie** (record **cookie names only**, not values).
- [ ] Post-login redirect lands on an authenticated page (not back on login).

**Blocker if:** CAPTCHA, MFA, device verification, or login completes only after client-side JS with no simple POST replay.

---

## 2. Session shape

- [ ] Identify which cookie(s) are **required** on the next authenticated request (names only).
- [ ] Cookies are **HttpOnly** (expected) — note if anything non-standard is required (custom headers, `X-*` tokens).
- [ ] Missing/expired session returns **login HTML or clear redirect to login** — not silent empty 200.

---

## 3. HTML report (view 219)

Open while logged in:

`/sys/report/?view=219`

- [ ] **200** with report HTML (not login page).
- [ ] Page contains `/sys/job/<id>` and `/sys/account/<id>` links.
- [ ] **Single GET** with session cookie is enough (no prior POST, no token scraped from another page).
- [ ] Date range matches the **saved view** in Moraware Admin (YTD/current year intent) — downloader will **not** change date pickers in v1.

---

## 4. CSV export (view 219)

While logged in, open:

`/sys/report/?view=219&spreadsheet=1&exportType=AllPages&table=Report`

- [ ] **200** with CSV body (not login HTML, not HTML error page).
- [ ] Response looks like spreadsheet export (note `Content-Type` / `Content-Disposition` **type only**).
- [ ] First row headers include expected contract columns (Account Name, Job Name, Job Status, …).
- [ ] **Same session cookie(s)** as HTML path — no extra export-specific token or second login.

---

## 5. Server-side feasibility signals

- [ ] **No** headless-only steps between login and both URLs (no click-to-export, no iframe, no WebSocket).
- [ ] CSV + HTML can run **back-to-back** in one session (login once per run is enough).
- [ ] Rough session idle TTL noted (minutes/hours) — must cover one fetch run.
- [ ] Auth failure is **detectable** without parsing customer rows (login form in body, redirect to login, or explicit error page).
- [ ] No IP allowlist or bot blocking observed for scripted User-Agent (optional: note if strict UA required).

---

## 6. Credential separation

- [ ] Confirm whether report-feed Admin login is **same or different** from existing Moraware API/SDK credentials.
- [ ] If different permissions/sessions: plan **separate org-scoped report-feed credentials** (backend-only).

---

## Decision

| Outcome | Criteria |
|---------|----------|
| **Proceed — server-side HTTP** | Form POST login works; named cookies suffice for both GETs; no MFA/CAPTCHA/JS-only gate; failures are unambiguous. |
| **Stop — document blockers** | Any blocker above; do **not** implement headless browser without separate threat-model approval. |

**Record in private notes:** cookie **names**, form field **names**, login URL path, blockers, session TTL estimate.  
**Optional one-line for handoff/chat:** “Server-side feasible: yes/no because …”

See also: [`moraware-report-feeds.md` § Governed download design](./moraware-report-feeds.md#governed-download-design-phase-a--docs-only)
