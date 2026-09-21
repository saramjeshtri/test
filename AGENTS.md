<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.


# AGENTS.md

Guidance for AI coding agents working in this repository.

## Project

Busulla ("Elbasan City Intelligence") is a municipal dashboard. It fuses service requests from several messy formats (Excel, CSV, PDF, legacy text export) into one canonical dataset and shows it in a Command Center dashboard with a 3D/2D map. It was built for the Track D data-fusion demo. **All data in `fixtures/` is synthetic.** Never add real citizen data.

## Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript
- Tailwind-style utility classes for styling
- CesiumJS map with Google 3D tiles (`components/CityMap.tsx`)
- npm (`package-lock.json` is committed)

## Commands

```bash
npm install
npm run fusion:run   # generates fixtures/canonical-output/ (the dashboard fails without it)
npm run dev          # http://localhost:3000
```

Check `package.json` for typecheck, lint, and build scripts and run the ones that exist before finishing a task.

## Layout

- `app/layout.tsx`: root layout, fonts, theme init script
- `app/page.tsx`: home route
- `app/command-center/`: the dashboard. `page.tsx` (overview), `analytics/`, `agent/` (the chat agent), `requests/`
- `components/`: UI components, including `CityMap.tsx`
- `lib/commandCenter/aggregate.ts`: `loadCommandCenterData()` reads the canonical output on the server and builds the dashboard data
- `app/api/agent/route.ts` and `lib/agent/`: the agent. A loop (`agent.ts`) where a language model (`gemini.ts`, or the key-less `offline.ts`) calls read-only tools (`tools.ts`) over the canonical data; answers cite requests by short refs. `scripts/test-agent.ts` checks it without a key or a network. Optional env vars: `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL`.
- `scripts/run-fusion.ts`: runs the fusion pipeline over `fixtures/` and writes `fixtures/canonical-output/`
- `fixtures/`: synthetic source files, the budget CSV, and the generated `canonical-output/`

## Data pipeline

Source files -> header mapping (exact or fuzzy match, with a confidence score) -> normalization -> canonical records with `data_quality_flags`.

Canonical request fields: `request_id`, `citizen_name`, `zone_id`, `category`, `description`, `date_submitted`, `status`, `priority`, `cost_estimate_leke`, `department`, `source_system`, `source_row_ref`, `data_quality_flags`.

Budget rows: `zone_id`, `population`, `annual_budget_leke`, `spent_ytd_leke`, `source_row_ref`.

Zone ids are `area-1` to `area-6`. The UI shows them as "Zona 1" to "Zona 6".

Rules:

- Flags such as `department:unmapped` are expected when a source doesn't carry a field. Never invent values to clear a flag.
- Dashboard pages read the canonical output at request time. After changing the fusion engine or fixtures, rerun `npm run fusion:run` and check its sanity lines (unresolved zone_id and status should be 0).
- Every dashboard page throws a 500 if `fixtures/canonical-output/` is missing. That is the first thing to check when `/command-center` errors.

## Conventions

- **UI text is Albanian (Shqip).** Keep new strings in Albanian and consistent with existing labels. Code, comments, and identifiers stay in English.
- Money is in Lekë. Money fields are suffixed `_leke`.
- **Themes:** light and dark are controlled by the `data-theme` attribute on `<html>`, set by an inline script in `app/layout.tsx` before hydration. Use that mechanism for any theme-dependent styling and don't add a second one. Don't edit `THEME_INIT_SCRIPT` or remove `suppressHydrationWarning` unless asked.
- The dev-only console error "Encountered a script tag while rendering React component" comes from that theme script. It is harmless and not a bug to fix.
- The Cesium map must stay client-side. Dashboard data loading stays in server code under `lib/commandCenter/`.
- Keep diffs minimal and follow existing patterns. No unrelated refactors or reformatting.

## Environment

`.env.local` holds map keys and tokens. Never commit it, print its values, or hardcode keys. If a change needs a new environment variable, tell the user which one instead of guessing a value.

## Git and dependencies


- No force pushes, history rewrites, or destructive commands (`git reset --hard`, `git clean -fd`) without asking first. They delete untracked local work permanently.
- Don't change `package.json` or `package-lock.json` or add dependencies unless asked.
- Never run `npm audit fix --force`.
- Don't commit `fixtures/canonical-output/` unless it is already tracked. Check `.gitignore` and `git status`.

## Definition of done

- Typecheck and lint pass (whichever scripts exist)
- `/command-center` and its subpages (requests, analytics, agent) load with no errors in the terminal
- UI changes look right in both light and dark themes
- `git diff --stat` reviewed, with a short summary of what changed and why

## Before you say a task is done

- Verify, don't assume. Run the checks listed below and read the output. Don't claim something works because the code looks right.
- If a requirement is ambiguous or you're unsure about a file, a data field, or the intended behavior, ask instead of guessing.
- Never invent values, file paths, function names, or env variables. Read the code to confirm they exist.
- If you make a mistake or a check fails, say so plainly and fix it. Don't work around it silently.
- In your final summary, list what you verified and what you did not (for example, "checked dark mode, did not test 2D map view").
- If a change touches data, the theme script, or dependencies, stop and confirm with the user first.
<!-- END:nextjs-agent-rules -->
