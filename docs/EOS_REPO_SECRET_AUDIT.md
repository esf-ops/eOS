# eOS repository secret audit (handoff)

Audits verify **committed** paths only. Files listed in `.gitignore` remain on disk for local development but **must never** be force-added (`git add -f`) or pasted into GitHub Issues/PRs.

## Search patterns exercised

| Pattern / topic | Finding in tracked source |
|-----------------|---------------------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Only placeholders in `*.example`, variable **names** in `backend-core/src/server.js` and docs. |
| `MORAWARE_PASSWORD` / `MORAWARE_USERNAME` | Names in README / docs / `.env.example` only — no literals. |
| `EOS_CRON_SECRET` | Read from `process.env` in server — no literals. |
| `eyJ…` JWT-shaped strings | If present inside **committed** bundles under `dist/`, remove `dist/` from Git and rely on `.gitignore` — **Vite rebuilds strip old artifacts.** |
| `sb_secret`, `sb_publishable` | No project keys embedded in application source. |
| `password` literals | Occur in `node_modules` (upstream docs) — expected; excluded from audits by ignoring `node_modules`. |
| Moraware SOAP templates | `src/morawareClient.js` uses `${password}` interpolation from env — not hard-coded credentials. |

## Local-only files that **must stay ignored**

Workspace checks may show real values in:

- `.env` (repo root — service role, Moraware, etc.)
- `app-brain-health/.env.local`
- `app-executive/.env.local`

These paths are `.gitignore`d. Before the first push to GitHub:

1. Run `git status` — ensure `.env*` do not appear as “new file” staged.
2. Run `git check-ignore -v .env app-executive/.env.local` — confirm ignored.
3. If `dist/` was ever committed, run `git rm -r --cached app-executive/dist app-brain-health/dist 2>/dev/null` once, then commit the removal.

## If a secret was ever committed to history

Rotate keys in Supabase / Moraware, then use Git history rewriting or `git filter-repo` — outside the scope of this doc; escalate if needed.
