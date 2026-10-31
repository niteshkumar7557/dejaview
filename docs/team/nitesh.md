# Nitesh: Frontend and pitch

You own **what the judges see**: the Next.js dashboard that makes every decision explorable and verifiable,
the MADR export, and the pitch. "Live demo and usability" is a scored category.

Read first: `docs/team/README.md`, `design.md` §2 (one-line idea), §5.3 (verified evidence), §5.8
(dashboard + MADR), §5.6 (scorecard), §10 (demo script). Contract: `packages/shared/src/api.ts` (every
response type you render).

## You own

`apps/web/` · `examples/README.md` · pitch slides. Don't edit other people's folders; ask them.

## Who you depend on

- **Mudit's API.** Until it exists, build against **mock JSON typed with the contract**.
- **Abhijeet's real outputs** in `examples/pep-*/output/` become your best mock data once they land.
- **Ansh's anchors and PR comments**, shown on the decision card and the PR checks page.

## Tasks (in order)

- [x] **1. Scaffold** `apps/web` (`@dejaview/web`): Next.js App Router + TypeScript, `tsconfig.json` extending
  `../../tsconfig.base.json` (plus Next's settings), `transpilePackages: ["@dejaview/shared"]` in
  `next.config`, scripts `dev`, `build`, `typecheck`. Make sure root `npm run typecheck` and `npm test` still pass.
- [x] **2. API client + mocks.** `src/lib/api.ts`: one typed function per route in `api.ts`, base URL from
  `NEXT_PUBLIC_API_URL`; `NEXT_PUBLIC_USE_MOCKS=1` serves typed mocks from `src/mocks/` instead. Unit-test the
  URL/query building.
- [x] **3. Decision card** (`/decisions/[id]`), the most important screen: status badge (accepted / rejected /
  withdrawn / open), summary, reasons, each with evidence quotes showing ✅ verified / ⚠️ unverified, author, date
  and a link to the exact post; linked code (path, symbol, "renamed from …"); people; model used; a drawer
  with the LLM audit trail (`/llm-calls`).
- [x] **4. Topic page** (`/topics/[slug]`): decision list with filters (status, verified only), and a
  **timeline** tab showing every post with its triage label and signal score, greyed out when skipped, and
  which decisions cite it.
- [x] **5. Home / search** (`/`): topics with counts and last recall; full-text decision search with filters.
- [ ] **6. Ingest page** (`/ingest`): paste a URL ✅ done; **file upload still to do** (needs a multipart ingest route in `packages/shared/src/api.ts`, ask Mudit) — then poll `/api/jobs/:id` and show
  stage-by-stage progress (the LLM is slow, so progress must be visible).
- [x] **7. Eval scorecard** (`/eval`): per PEP, recall and reason agreement, and a side-by-side table
  *PEP says* | *DejaView found* | ✅/❌.
- [x] **8. PR checks** (`/pr-checks`): the bot's comments rendered as Markdown.
- [x] **9. MADR export** (`src/lib/madr.ts`): render a `DecisionCard` as a MADR Markdown file (context,
  considered options, decision outcome, reasons, links to sources) with a download button; snapshot test.
- [x] **10. Polish**: responsive, readable, fast; empty and loading states; works when the LLM laptop is off
  (everything comes from the API/DB).
- [ ] **11. Pitch.** Slides following `design.md` §10 (8 min), Q&A prep, `examples/README.md` (what each
  example is and the command that produced it). Rehearse with the team before 8:30 AM.

## Definition of done

Every page works on real API data; the demo path (topic → decision card → evidence link → PR check → eval)
runs smoothly; tests for the API client and MADR renderer; slides ready.

## In the pitch / Q&A you explain

The user flow, how a maintainer verifies a decision in two clicks, why unverified evidence is shown rather
than hidden, the MADR export, and the overall architecture (`docs/team/README.md` diagram).

## Handoff: where the frontend stands (read this first in a new session)

**Done and merged:** every screen on sample data (PR #3), plan and critique log in `apps/web/docs/plan.md`.
Pitch deck (13 slides, speaker notes per presenter): https://claude.ai/artifact/MXjrZkCimXQwnbEzCSduRY.
Fill its `[__]` placeholders (pipeline share, results table) from the real eval runs before 8:30 AM.

**In progress: connect the dashboard to Mudit's API.** Branch `nitesh/connect-api` (from `main` at `986fc63`).

What we know about the API (`apps/api`):
- Listens on **port 3001** (`PORT` env), CORS open. Run it: `docker compose up -d` → `cp .env.example .env`
  (set `DATABASE_URL`) → `npm run migrate` → `npm run start -w @dejaview/api` (worker:
  `npm run start -w @dejaview/worker`). Docker is installed and running on this laptop.
- There is no seed data: decisions only appear after an ingest job runs through the worker, which needs
  Abhijeet's pipeline. Until then expect empty lists, so the empty states get exercised.
- Routes match `packages/shared/src/api.ts`. Extras the web app can now use: `POST /api/eval/:slug`
  → 202 `{ jobId, topicSlug }`; `POST /api/ingest` accepts multipart with a `file` field plus
  `topicSlug`, `topicTitle`, `pepNumber`.
- Non-integer ids return 400 (the web app validates ids first). `GET /api/topics/:slug/timeline` for an
  unknown slug may return `[]` instead of 404; the topic page checks `getTopic` first, so that is fine.

Next steps, in order:
1. `apps/web/src/lib/source.ts`: default `NEXT_PUBLIC_API_URL` to `http://localhost:3001` (it says 4000).
   Add `apps/web/.env.local` (git-ignored) with `NEXT_PUBLIC_USE_MOCKS=0` and the URL. `NEXT_PUBLIC_*` is
   baked in at build time, so rebuild after changing it.
2. Smoke-test every route against the running API and compare the real JSON with the contract types
   (shapes come from `db/src/topics.ts`, `decisions.ts`, `timeline.ts`, `evalRuns.ts`, `prChecks.ts`,
   `llmCalls.ts`). Fix mismatches on our side, or send Mudit a message if the API breaks the contract.
3. "Run evaluation": add `startEval(slug)` to `DataSource` (mock + HTTP), a client button that starts
   it and reuses the ingest job polling, and stop disabling it in HTTP mode.
4. File upload on `/ingest`: add a `startIngestUpload(form: FormData)` to `DataSource` (multipart POST),
   a file input on the form, and tests. That closes task 6 above.
5. Keep sample-data mode as the demo fallback (`NEXT_PUBLIC_USE_MOCKS` unset = mocks).

Deferred minors from the final review (fix if time allows): the strip's `<svg role="img">` hides its
links from screen readers (use `role="group"`); the drawer can vanish if reopened within 280 ms; ingest
polling never stops when `getJob` returns null; `aria-live` on the whole progress block is too chatty;
decisions with 0 quotes count as fully verified; topic and decision pages fetch twice (wrap in
React `cache()`); several eval runs per PEP would repeat sections; the audit drawer throws on an empty
`stage`; the mock dataset ships in the client bundle even in HTTP mode.

Team asks still open: Mudit, add `decisionId` to `EvalMatch` and `decidedAt` to `DecisionSummary`;
Ansh, wrap code names in backticks in PR comments.
