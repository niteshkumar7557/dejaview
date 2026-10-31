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
- [x] **6. Ingest page** (`/ingest`): paste a URL or upload a file (multipart), then poll `/api/jobs/:id` and show
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

**Connected to Mudit's API** (branch `nitesh/connect-api`, PR open). Every route was smoke-tested against
the running API with a seeded local DB; shapes match the contract.

Run it live: `docker compose up -d` → `cp .env.example .env` → `npm run migrate` →
`npm run start -w @dejaview/api` (port 3001) and `npm run start -w @dejaview/worker`. `apps/web/.env.local`
(git-ignored) holds `NEXT_PUBLIC_USE_MOCKS=0` and `NEXT_PUBLIC_API_URL=http://localhost:3001`; it is baked in
at build time, so rebuild (`npm run build -w @dejaview/web`) after changing it. Unset = sample data (demo fallback).

What changed to fit the real API:
- Progress rows map the worker's own stage names (`fetching`, `storing`, `queued`, `linking`, `done`) by job
  type (`stageIndex` in `src/lib/ingest.ts`); the bar shows progress across the whole chain.
- The worker runs ingest → extract → link as **separate jobs** and the API only returns the ingest job id.
  When the ingest job ends the panel says "Thread stored" and that extraction continues in the worker. If the
  API adds `nextJobId` to `JobView`, `useJob` (`src/lib/use-job.ts`) follows it automatically.
- "Run evaluation" (`RunEval`) posts `/api/eval/:slug`, follows the job, refreshes the scorecard.
- The API's `verified=true` means "at least one verified quote"; the web filters to "every quote verified"
  (and a decision with 0 quotes is not verified).
- Eval matches carry pipeline keys (`d1`), not DB ids, so live mode no longer guesses links from keys.
- PR checks have no stored title yet; the list falls back to `repo#number`.

Still open: Abhijeet's pipeline isn't merged, so extract/eval jobs fail in the worker (the UI shows the error).
Pitch deck placeholders still need the real eval numbers.

Deferred minors from the final review: all fixed (thread-strip links readable by screen readers, audit
drawer reopen race and empty-stage crash, double fetches deduped with React `cache()`, one eval section per
PEP, sample dataset loaded lazily so the live dashboard does not ship it).

Team asks still open: Mudit, add `decisionId` to `EvalMatch`, `decidedAt` to `DecisionSummary`,
`nextJobId` to `JobView`, store the PR title in `pr_checks`, pass a real dashboard URL (not
`NEXT_PUBLIC_API_URL`) to the PR comment; Ansh, show rejected decisions that `matchPr` returns in
`renderPrComment` (today they vanish from the comment).
