# slabOS AI Studio

Specialized AI tool catalog for stone and countertop fabrication.

## Architecture boundary

```text
Employee → slabOS AI Studio → AI orchestration → Governed slabOS actions → eliteOS Brain → Supabase / quotes / knowledge
```

`app-slab-ai` owns UX, tool registry, prompt assembly, streaming, and presentation of evidence.
Brain owns permissions (`requireAuth` + `requireHeadAccess("slab_ai")`), organization scope, quote/knowledge reads, and durable history.

The Next.js server may hold the AI provider key. It must **not** become an alternate business backend.

## Run locally

```bash
cd app-slab-ai
cp .env.example .env.local
# For local without Supabase session:
#   SLAB_AI_DEV_AUTH_BYPASS=1
#   AI_MOCK_MODE=1
npm install
npm run dev                  # http://localhost:5192
```

Mock AI (`AI_MOCK_MODE`) and mock auth (`SLAB_AI_DEV_AUTH_BYPASS`) are separate.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js on port 5192 |
| `npm run build` | Production build |
| `npm test` | Registry, auth/trust, citations, mock, evals |
| `npm run eval` | Eval fixtures only |

## Phase 2–3 trust layer

- Production generate/history/feedback/knowledge/quotes require Brain `slab_ai` context.
- Knowledge Hub: admin/executive only for upload/approve; AI users consume approved sources via citations.
- Durable history/feedback + knowledge hub: apply `eliteos_slab_ai_v1.sql` then `eliteos_slab_ai_knowledge_hub_v1.sql`.
- Private Storage bucket: `eliteos-slab-ai-knowledge` (create in Supabase dashboard, public=false).
- Governed read-only actions: `retrieveQuote`, `searchQuotes`.
- Shared `EliteosTopbar` via client adapter (no component fork).
- See `FEATURE_DECISIONS.md` §367–§369.
