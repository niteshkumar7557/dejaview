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

## Handoff (read this first in a new session) — 1 Nov 2026, ~04:30 IST

**Nitesh now owns every part of the project** (the rest of the team handed over; see `docs/PLATFORM.md` §13).

Where things stand:
- **Everything in `docs/PLATFORM.md` §5 is built and merged**, including the AI pipeline (PRs #15, #19), the
  end-to-end fixes (#20: code links for PEP 695-style definitions, the "already rejected?" check) and the
  design pass (type scale, spacing, thread-strip scaling). Status table: `PLATFORM.md` §12.
- **Real results:** PEP 698 (3 decisions, 5/5 quotes verified, recall 1/4) and PEP 701 (16 decisions, 52/52
  verified, recall 2/3) in `examples/`, reproduced exactly in CI from `fixtures/llm/`. A real PR-check
  example in `examples/pr-check/`.
- **How to run and present the demo, page by page, and the improvements backlog: `docs/DEMO.md`.**
- Local stack used for the demo: Docker Postgres (PEP 698 + 701 loaded), API :3001, worker
  (`LLM_MODE=live`), dashboard :3100, CPython clone in `data/cpython`.

Next session: start with the backlog in `docs/DEMO.md` §3 (consolidation over-merging and quote-like reasons
first), then PEP 695, then the CPython fork for the live PR-bot demo. Pitch deck:
https://claude.ai/artifact/MXjrZkCimXQwnbEzCSduRY (fill its `[__]` numbers from `examples/`).
