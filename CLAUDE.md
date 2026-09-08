# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Source of truth

Read before making architectural changes:

- `docs/eliteos/SYSTEM_BLUEPRINT.md` — intent, architecture, business logic, integrations, security
- `docs/eliteos/FEATURE_DECISIONS.md` — decision log; add an entry here when architecture, data flow, pricing logic, integrations, security posture, or SaaS assumptions change in a meaningful way
- `docs/eliteos/eliteOS-master-head-map.md` — canonical head inventory and roadmap
- `docs/eliteos/CURRENT_SYSTEM_MAP.md` — current system state

## Project rules (binding)

This repo's `.cursor/rules/*.mdc` files are the project's rule set and apply here too, not just in Cursor:

- `eliteos-architecture.mdc`
- `eliteos-production-authority.mdc`
- `quote-platform.mdc`
- `security-audit.mdc`
- `macos-cli-credentials.mdc`

Read the relevant one before touching production auth, quoting/pricing logic, or security-sensitive code.

## Product identity

- User-facing name is **eliteOS** (not "eOS") in new strings, docs, and UI copy. `eos` / `eOS` / `EOS_*` remain as legacy internal/technical identifiers until intentionally renamed.
- Design principle: build for Elite / Eric today, architect for ~1,000 fabricators tomorrow — multi-tenant SaaS awareness, org boundaries, configurable settings over hardcoded shop logic.

## Commands

- Install: `npm install` at repo root, plus inside each `app-*` head you're working on
- Run the API: `npm run eos:server`
- Run a head: `cd app-<name> && npm run dev`
- Verify before shipping: `npm run eos:check:local` (type-checks the server, production-builds both primary heads)
- Individual head builds: `npm run eos:build:<head>` / `npm run eos:build:all-heads`

## Hygiene

- Never commit `.env`, `.env.local`, or `debug/` dumps — copy from the `.example` files instead
- `debug/` and `dist/` are gitignored; keep it that way
- New tenant-owned tables should carry `organization_id`; avoid hardcoded fabricator-specific IDs or branch names in logic
