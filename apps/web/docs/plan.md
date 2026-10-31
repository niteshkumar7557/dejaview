# DejaView Web: Dashboard on Dummy Data, Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Team rule (CLAUDE.md):** AI agents never commit. Every "Hand over" step means: run typecheck + tests, then output a commit message and PR description for Nitesh. Only edit files inside `apps/web/` (and `docs/team/nitesh.md`).

**Goal:** Build every screen of the DejaView dashboard in `apps/web`, rendered from a typed dummy dataset, with GSAP motion where motion carries meaning, so the UI is demo-ready before Mudit's API exists.

**Architecture:** Next.js App Router with server components that read through one `DataSource` interface. A mock source (default now) serves a dataset typed with `@dejaview/shared`; an HTTP source with the same interface switches on later via env. Client components only where there is interaction (thread strip, drawer, ingest polling, phone menu); GSAP runs only inside `useGSAP` in those.

**Tech Stack:** Next.js 16.4 (App Router, Turbopack), React 19.3, TypeScript, GSAP 3.15 + `@gsap/react` 2.1, `react-markdown` (PR comment preview), Vitest 5 (root runner), IBM Plex Sans/Mono via `next/font/google`. Plain CSS with custom properties (one `tokens.css`, CSS modules per component). No Tailwind, no UI kit.

**Spec:** `design.md` §5.3, §5.6, §5.8, §10 · `docs/team/nitesh.md` · contract `packages/shared/src/api.ts` · art direction `apps/web/.taste-skill/direction.json` (reprint: `node ~/.claude/skills/design-taste-frontend/scripts/draw.mjs --show`, run from `apps/web`) and `~/.claude/skills/design-taste-frontend/references/app-screens.md`.

## Design decisions (made before building)

- **Style:** `framed-sheet` (seed 1078740707). Chosen because maintainers read long evidence quotes in long sessions; a white sheet in a tinted frame reads like a case file ("case law for your codebase"). `achromatic-ledger` was the alternative and is built for money screens.
- **The move (keep intact):** sidebar + 48px top bar share one tinted frame `#f9fbfc` with no rule between them; the page is a white sheet inset 8px from the window's right and bottom, 16px radius, 1px `#e8eaec` edge, no shadow. Active tab = 2px underline in ink.
- **Face:** IBM Plex Mono for references only (post numbers `#142`, `PEP 701`, `gh-104131`, SHAs, file paths, symbols). Developers read these as the product's own marks. Everything else IBM Plex Sans.
- **Signature element: the thread strip.** A full-width SVG strip of the whole discussion: one tick per post in thread order, height = signal score, pale grey when filtered out, ink when the model read it, accent `#1b6c80` when it is evidence for a decision. Hovering or focusing a decision lights its evidence ticks. It shows the funnel (312 posts, 41 read) and traceability at a glance, and no other product has it.
- **Mark:** an SVG monogram: two overlapping speech-bubble outlines in the accent (a debate seen twice), with the wordmark "DejaView". Scope line under it: `python/cpython · discuss.python.org`.
- **Motion (GSAP, feedback only; the skill forbids decorative page entrances on app screens):** thread-strip highlight, evidence jump-and-flash, audit drawer, phone menu sheet, ingest stage progress. Hover/press on controls is plain CSS.

### Each screen's one question, primary action, biggest block

| Route | Question | Primary action | Biggest block |
|---|---|---|---|
| `/` Overview | Which recovered decisions can a maintainer trust? | Ingest a discussion | Topics table (PEP, decisions, rejected, verified share, recall) |
| `/topics/[slug]` | What was decided in this discussion, and what was rejected? | Run evaluation | Decisions table, under the thread strip |
| `/decisions/[id]` | Why was this decided, and can I check it? | Export MADR | Reasons with their quotes |
| `/decisions` | Has this idea been discussed before? | (search) | Results table |
| `/ingest` | Is my discussion being processed, and where is it now? | Start | Stage list with progress |
| `/eval` | How much of each PEP's Rejected Ideas did we recover from the discussion alone? | Run evaluation | Side-by-side table *PEP says / DejaView found* |
| `/pr-checks` | Which pull requests touched settled decisions? | — (freshness stamp) | Checks list + comment preview |

## Global Constraints

- Only files under `apps/web/` (plus `docs/team/nitesh.md`) are created or modified. Dependencies are added with `npm install <pkg> -w @dejaview/web` (this updates the root lockfile, which the team rules allow).
- Package name `@dejaview/web`; `"private": true`; scripts `dev` (`next dev -p 3100`), `build`, `start`, `typecheck` (`next typegen && tsc --noEmit -p .`).
- `tsconfig.json` extends `../../tsconfig.base.json` and overrides: `"module": "ESNext"`, `"moduleResolution": "Bundler"`, `"jsx": "preserve"`, `"lib": ["dom", "dom.iterable", "ES2022"]`, `"types": ["node"]`, `"plugins": [{ "name": "next" }]`, `"paths": { "@/*": ["./src/*"] }`, include `next-env.d.ts`, `src/**/*.ts`, `src/**/*.tsx`, `.next/types/**/*.ts`.
- `next.config.ts`: `transpilePackages: ["@dejaview/shared"]`; `typescript: { ignoreBuildErrors: true }` with the comment "types are checked by `npm run typecheck` (tsc) in CI; Next's built-in checker may not support TypeScript 7".
- Next 16: page props `params` and `searchParams` are **Promises** (`const { slug } = await params`).
- Tests are `*.test.ts` (pure TypeScript, no JSX) run by the root `npm test`. Import with relative paths in tests (the `@/` alias is not configured in the root Vitest).
- Env: `NEXT_PUBLIC_USE_MOCKS` (anything but `"0"` = mock source, default mock), `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).
- Tokens exactly as the sheet: `--ground #f9fbfc; --surface #ffffff; --raised #f4f6f8; --active #ebedee; --border #e8eaec; --rule #f0f1f2; --control #cdced1; --text #131416; --muted #5d5f60; --accent #1b6c80; --positive #1e7b4f; --negative #c4242a; --warning #92400e; --chart-1 #1b6c80; --pill-positive-bg #dcfae5; --pill-positive-ink #04250e; --pill-negative-bg #ffedea; --pill-negative-ink #831c1e; --pill-warning-bg #fffbeb; --pill-warning-ink #92400e; --pill-neutral-bg #ebedee; --pill-neutral-ink #353736; --radius-card 8px; --radius-control 6px; --radius-sheet 16px; --sheet-inset 8px; --row-height 48px; --sidebar-width 228px; --gap 24px; --pad 24px; --control-height 32px; --fs-title 22px; --fs-section 16px; --fs-kpi 28px; --fs-body 14px; --fs-small 12px`. Add `--faint #6b6b6b` (placeholders, 4.5:1).
- Status pills: accepted = positive pair, rejected = negative pair, withdrawn = neutral pair, open = warning pair. Text is the word ("Rejected"), sentence case, 12px/500, 20px tall, `white-space: nowrap; flex: none`.
- Verification mark: an inline 12px SVG check (verified, `--positive`) or 12px SVG triangle (unverified, `--warning`) + the word "Verified" / "Unverified" + the score in mono (`1.00`, `0.62`). No emoji anywhere.
- House rules (checked by `lint.mjs --app` / `inspect.mjs --app`): no gradients, glows, glass, shadows at rest (only the drawer and menus float), no icons in tinted squares, no sparklines, no uppercase tracked labels, no zebra rows, numbers right-aligned in tabular figures, one h1 per screen at 22px/600, nothing ≥ 48px, max 4 hues, accent only on data + the active underline, primary button near-black `#1d1f20` with white label, 32px controls.
- Motion constants (`src/lib/motion.ts`): `DUR_FAST = 0.18`, `DUR = 0.28`, `EASE = "power2.out"`; every GSAP effect is wrapped in `gsap.matchMedia()` with a `(prefers-reduced-motion: reduce)` branch that sets end states instantly.
- Grid arithmetic (write as a comment in `shell.module.css`): sheet at 1440 = 1440 − 228 − 8 = 1204; content = 1204 − 2×24 = 1156. Two-thirds row `2fr 1fr` gap 24 → 754.7 + 24 + 377.3 = 1156. Right rail `1fr 384px` gap 24 → 748 + 24 + 384 = 1156.
- Sample data uses fictional handles (never real people's names on invented quotes). Decision titles are sample content to be replaced by Abhijeet's real outputs.

## Review Focus

1. **A decision with no verified quote** (all evidence unverified, confidence low): the card still renders every quote with the Unverified mark and a one-line notice "No quote could be matched to its post; treat as unconfirmed." Pinned by Task 3 (dataset contains one) and Task 8 (MADR says "unverified").
2. **Unknown slug or id** (`/topics/pep-9999`, `/decisions/999`): the frame stays, `notFound()` renders a 404 sentence with a link to Overview. Pinned by Task 2 (sources return `null`).
3. **Search with no results:** the results block keeps its frame and header and shows one sentence spanning it ("No decisions match "zzz"."). Pinned by Task 2.
4. **An anchor whose file is gone at HEAD** (`currentPath: null`): shows the original path with "Not found at HEAD" in grey; MADR uses `originalPath`. Pinned by Task 3 (dataset contains one) and Task 8.
5. **API unreachable in HTTP mode:** the failing block shows "Couldn't load decisions. Retry" inside its frame; nothing crashes the layout. Pinned by Task 2 (`ApiRequestError` on 5xx, `null` on 404).

---

## File Structure

```
apps/web/
  package.json · tsconfig.json · next.config.ts · .gitignore (.next, .taste-skill/inspect, next-env.d.ts)
  docs/plan.md                      this plan
  src/app/
    layout.tsx                      fonts, tokens, <Shell>
    globals.css · tokens.css
    page.tsx                        Overview
    not-found.tsx
    decisions/page.tsx              search
    decisions/[id]/page.tsx         decision card
    topics/[slug]/page.tsx          topic (tabs via ?tab=decisions|timeline)
    ingest/page.tsx · eval/page.tsx · pr-checks/page.tsx
  src/lib/
    format.ts (+ .test.ts)          number/date/ref formatting
    api-paths.ts (+ .test.ts)       URL building for every route
    data-source.ts                  DataSource interface + DecisionQuery
    http-source.ts (+ .test.ts)     DataSource over fetch
    mock-source.ts (+ .test.ts)     DataSource over the dataset
    source.ts                       getSource() picks by env
    mock-job.ts (+ .test.ts)        simulated ingest job timeline
    madr.ts (+ .test.ts)            DecisionCard → MADR Markdown
    motion.ts                       GSAP registration, constants, reduced-motion helper
  src/mocks/
    dataset.ts                      hand-written rows (topics, decisions, quotes, anchors, evals, PR checks)
    threads.ts                      seeded generator for full post lists
    views.ts (+ views.test.ts)      derives every contract view from the rows
  src/components/
    shell/ (Shell, Sidebar, TopBar, PhoneMenu, Mark)    shell.module.css
    ui/ (PageTitle, StatusPill, VerifiedMark, Ref, KpiStrip, EmptyState, Tabs, Button)
    thread-strip/ (geometry.ts + geometry.test.ts, ThreadStrip.tsx, HighlightContext.tsx)
    decision/ (ReasonList, EvidenceQuote, AnchorList, PeopleList, AuditDrawer, MadrButton)
    tables/ (TopicsTable, DecisionsTable)
    ingest/ (IngestForm, JobProgress)
    eval/ (RecallBars, GroundTruthTable)
    pr/ (PrCheckList, CommentPreview)
```

---

### Task 1: Scaffold the app with tokens and fonts

**Files:**
- Create: `apps/web/package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/tokens.css`, `src/app/page.tsx` (temporary: an h1 "Overview")

**Interfaces:**
- Produces: workspace `@dejaview/web`; CSS custom properties from Global Constraints; CSS vars `--font-sans`, `--font-mono` from `next/font/google` (`IBM_Plex_Sans` weights 400/500/600, `IBM_Plex_Mono` 400/500, `display: "swap"`).

- [ ] **Step 1:** Create the files by hand (do not run `create-next-app`; it would write outside conventions). Install: `npm install next@16.4.3 react@19.3.1 react-dom@19.3.1 gsap@3.15.0 @gsap/react@2.1.2 react-markdown -w @dejaview/web` and `npm install -D @types/react @types/react-dom -w @dejaview/web`.
- [ ] **Step 2:** `globals.css`: reset, `body { background: var(--ground); color: var(--text); font: 400 var(--fs-body)/20px var(--font-sans); }`, `.num { font-variant-numeric: tabular-nums; }`, `.mono { font-family: var(--font-mono); }`, visible focus ring `2px solid var(--accent)` offset 2px.
- [ ] **Step 3: Verify.** From the repo root: `npm run typecheck` → exits 0 (includes `@dejaview/web`); `npm test` → 13 passed; `npm run build -w @dejaview/web` → "Compiled successfully"; `npm run dev -w @dejaview/web` → `http://localhost:3100` shows "Overview" in IBM Plex Sans on `#f9fbfc`.
- [ ] **Step 4: Hand over** commit message "Scaffold Next.js web app with design tokens and fonts".

### Task 2: Formatting, URL building and the data sources

**Files:**
- Create: `src/lib/format.ts`, `api-paths.ts`, `data-source.ts`, `http-source.ts`, `source.ts` and tests `format.test.ts`, `api-paths.test.ts`, `http-source.test.ts`

**Interfaces:**
- Consumes: contract types from `@dejaview/shared`.
- Produces:
  ```ts
  // format.ts
  formatPercent(ratio: number | null, digits?: number): string   // 0.8182 → "82%", (0.8182,1) → "81.8%", null → "—"
  formatCount(n: number): string                                  // 1204 → "1,204", 0 → "0"
  formatDate(iso: string | null): string                          // "2023-02-14T09:12:00Z" → "2023-02-14", null → "—"
  formatScore(score: number): string                              // 1 → "1.00", 0.615 → "0.62"
  ofTotal(part: number, total: number): string                    // (9, 11) → "9 of 11"
  shortSha(sha: string | null): string                            // 7 chars, null → "—"
  // data-source.ts
  interface DecisionQuery { q?: string; status?: DecisionStatus; topic?: string; verified?: boolean }
  interface DataSource {
    listTopics(): Promise<TopicSummary[]>; getTopic(slug: string): Promise<TopicDetail | null>;
    getTimeline(slug: string): Promise<TimelinePost[] | null>; searchDecisions(q: DecisionQuery): Promise<DecisionSummary[]>;
    getDecision(id: number): Promise<DecisionCard | null>; getLlmCalls(id: number): Promise<LlmCallView[]>;
    listEvalRuns(): Promise<EvalRunView[]>; listPrChecks(): Promise<PrCheckView[]>;
    getJob(id: number): Promise<JobView | null>; startIngest(req: IngestRequest): Promise<IngestResponse>;
  }
  // api-paths.ts: one function per route, e.g.
  decisionsPath(q: DecisionQuery): string   // {q:"as name",status:"rejected",verified:true} → "/api/decisions?q=as+name&status=rejected&verified=true"; {} → "/api/decisions"
  topicPath(slug), timelinePath(slug), decisionPath(id), llmCallsPath(id), jobPath(id), "/api/topics", "/api/eval", "/api/pr-checks", "/api/ingest"
  // http-source.ts
  class ApiRequestError extends Error { status: number }
  createHttpSource(baseUrl: string, fetchImpl?: typeof fetch): DataSource
  // source.ts
  getSource(): DataSource   // mock unless process.env.NEXT_PUBLIC_USE_MOCKS === "0"
  ```

- [ ] **Step 1: Write the failing tests.** `format.test.ts`: every example in the comments above. `api-paths.test.ts`: the two `decisionsPath` cases, plus `topicPath("pep 701")` → `"/api/topics/pep%20701"`. `http-source.test.ts` with a fake fetch: `getTopic` on 200 returns the parsed body and requested `http://api.test/api/topics/pep-701`; on 404 returns `null`; on 500 rejects with `ApiRequestError` whose `status === 500`; `startIngest` sends `POST` with JSON body and `content-type: application/json`.
- [ ] **Step 2:** Run `npx vitest run apps/web/src/lib` → FAIL (modules missing).
- [ ] **Step 3:** Implement. Paths use `URLSearchParams` (drop `undefined`; booleans as `"true"`). `getSource()` imports the mock source lazily from Task 3; until Task 3 lands, keep the mock branch throwing "mock source not built yet" (replaced in Task 3 Step 3).
- [ ] **Step 4:** Run the tests → PASS. `npm run typecheck` → 0.
- [ ] **Step 5: Hand over** "Add formatting helpers, API paths and data sources".

### Task 3: The dummy dataset and derived views

**Files:**
- Create: `src/mocks/dataset.ts`, `src/mocks/threads.ts`, `src/mocks/views.ts`, `src/mocks/views.test.ts`, `src/lib/mock-source.ts`, `src/lib/mock-source.test.ts`, `src/lib/mock-job.ts`, `src/lib/mock-job.test.ts`; Modify `src/lib/source.ts`

**Interfaces:**
- Produces:
  ```ts
  // dataset.ts: rows only, no totals typed in
  interface MockTopic { slug; title; pepNumber; sources: SourceView[]; postCount: number; seed: number }
  interface MockDecision { id; topicSlug; title; kind; status; summary; confidence; decidedAt; model;
    reasons: { id; text; evidence: { id; postNumber: number; quote: string; verified: boolean; matchScore: number }[] }[];
    anchors: CodeAnchor[] }
  interface MockEvidencePost { topicSlug; postNumber; author; createdAt; body }   // hand-written posts that hold quotes
  export const topics, decisions, evidencePosts, evalRuns (EvalResult + topicSlug + createdAt), prChecks (PrCheckView[]), llmCalls (Record<decisionId, LlmCallView[]>)
  // threads.ts
  buildThread(topic: MockTopic, evidence: MockEvidencePost[], decisions: MockDecision[]): TimelinePost[]
  // deterministic (mulberry32(topic.seed)); postCount posts; evidence posts placed at their postNumber with
  // their body and decisionIds; others: author from a pool of 12 fictional handles, body from a per-topic pool
  // of ~20 sentences, ~38% skipped (body "+1", "Thanks!", or a quote-only reply), labels from TRIAGE_LABELS
  // weighted noise 0.45 / support 0.2 / question 0.12 / proposal 0.08 / alternative 0.07 / objection 0.06 / decision 0.02,
  // signalScore = skipped ? null : rng in [0.05, 0.6], evidence posts score in [0.7, 1]
  // views.ts
  toTopicSummary(slug): TopicSummary; toTopicDetail(slug): TopicDetail | null; toDecisionSummary(d): DecisionSummary;
  toDecisionCard(id): DecisionCard | null; timeline(slug): TimelinePost[] | null
  // mock-source.ts
  createMockSource(): DataSource
  // mock-job.ts
  MOCK_STAGES = [["ingest",4000],["clean",2000],["triage",9000],["extract",12000],["verify",2000],["consolidate",5000],["link",4000]] as const
  mockJobAt(elapsedMs: number, id?: number): JobView   // 0 → status "running", stage "ingest", progress 0; total 38000ms → "done", progress 1
  ```
- Content to write (sample, fictional handles): **PEP 698** `typing.override` (postCount 64, 4 decisions), **PEP 701** f-string grammar (postCount 212, 7 decisions), **PEP 695** type parameter syntax (postCount 318, 9 decisions). 20 decisions in total; at least 12 rejected, 4 accepted, 2 withdrawn, 2 open; each decision 1–3 reasons, each reason 1–2 quotes ≤ 40 words. Include: one decision whose quotes are all unverified with confidence "low"; one anchor with `currentPath: null`; one anchor relocated (`relocatedBy: "git-follow"`, `originalPath` ≠ `currentPath`). Eval runs for all three PEPs: ground truth 3 / 6 / 8 items. PR checks: 3 (one matching 2 decisions, one "similar rejected", one with no match). LLM calls: 3 per decision (triage `qwen3.5:4b`, extract and consolidate `qwen3.5:9b`).

- [ ] **Step 1: Write the failing tests** (`views.test.ts`): for every topic, `decisionCount` equals the number of its decisions, `rejectedCount` equals those with status `rejected`; every evidence `postNumber` exists in that topic's `timeline()` and that post's `decisionIds` contains the decision; `timeline("pep-701")!.length === 212`; `buildThread` is deterministic (two calls deep-equal); `verifiedEvidence <= totalEvidence` for every summary; `toDecisionCard(999)` is `null`; exactly one card has every evidence `verified === false`; at least one anchor has `currentPath === null`. `mock-source.test.ts`: `searchDecisions({ q: "zzz" })` → `[]`; `searchDecisions({ status: "rejected" })` all rejected; `searchDecisions({ q: "BACKSLASH" })` matches case-insensitively on title and reasons; `getTopic("pep-9999")` → `null`. `mock-job.test.ts`: the two `mockJobAt` cases above, plus `mockJobAt(5000).stage === "clean"` and progress strictly increases across 0, 10000, 20000, 30000.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; switch `getSource()`'s mock branch to `createMockSource()`. In the mock source, `startIngest` stores `Date.now()` per job id; `getJob(id)` returns `mockJobAt(Date.now() - start, id)`.
- [ ] **Step 4:** Run → PASS; `npm run typecheck` → 0.
- [ ] **Step 5: Hand over** "Add typed dummy dataset and mock data source".

### Task 4: Shell, primitives and motion helpers

**Files:**
- Create: `src/lib/motion.ts`, `src/components/shell/{Shell,Sidebar,TopBar,PhoneMenu,Mark}.tsx`, `shell.module.css`, `src/components/ui/{PageTitle,StatusPill,VerifiedMark,Ref,KpiStrip,EmptyState,Tabs,Button}.tsx` + `ui.module.css`; Modify `src/app/layout.tsx`; Create `src/app/not-found.tsx`

**Interfaces:**
- Produces:
  ```ts
  // motion.ts ("use client" consumers only)
  export { gsap }; registerMotion(): void   // gsap.registerPlugin(useGSAP, ScrollToPlugin) once
  DUR_FAST, DUR, EASE; withMotion(scope, full: () => void, reduced: () => void): () => void  // gsap.matchMedia wrapper, returns revert
  // ui
  <PageTitle title: string; subline?: ReactNode; crumbs?: {href,label}[]; actions?: ReactNode />  // h1 22/600
  <StatusPill status: DecisionStatus />   <VerifiedMark verified: boolean; score: number />
  <Ref kind: "post"|"pep"|"gh"|"sha"|"path"|"symbol"; value: string; href?: string />  // mono
  <KpiStrip items: { label: string; value: string; sub?: string }[] />   // one container split by 1px dividers
  <EmptyState sentence: string />  <Tabs items: {href,label,active}[] />  <Button variant: "primary"|"secondary"|"text"; href? | onClick? />
  ```
- Shell: sidebar 228px (Mark + "DejaView", scope line, nav: Overview `/`, Decisions `/decisions`, PR checks `/pr-checks`, Evaluation `/eval`, Ingest `/ingest`; active = grey pill `--active` radius 8, inset 8px; 16px outline icons at 1.5px stroke, grey). Top bar 48px: centred search 548×32 (form GET `/decisions`, `name="q"`, placeholder "Search decisions", hint "/" key focuses it), right: a "Mock data" neutral pill when the mock source is active. Sheet per Global Constraints. Under 1100px the frame folds: 48px top bar (menu button, page name, one action slot) on the frame tint; `PhoneMenu` is a full-screen sheet sliding in from the left (`x: "-100%" → 0`, `DUR`, `EASE`; reduced → instant), Escape closes, focus returns to the menu button.

- [ ] **Step 1:** Build the shell empty; look at it at 1440 and 390 in the browser (sheet edge visible, no rule between sidebar and top bar).
- [ ] **Step 2:** Build the primitives; temporary `page.tsx` renders one of each.
- [ ] **Step 3: Verify.** `npm run typecheck` → 0; `node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs --app apps/web/src` → no FAIL; phone menu opens/closes by keyboard (Tab to button, Enter, Escape).
- [ ] **Step 4: Hand over** "Add app shell, UI primitives and motion helpers".

### Task 5: The thread strip (signature element)

**Files:**
- Create: `src/components/thread-strip/geometry.ts`, `geometry.test.ts`, `ThreadStrip.tsx`, `HighlightContext.tsx`, `thread-strip.module.css`

**Interfaces:**
- Consumes: `TimelinePost[]`.
- Produces:
  ```ts
  type TickKind = "skipped" | "read" | "evidence"
  interface Tick { postId: number; x: number; h: number; kind: TickKind; decisionIds: number[] }
  stripGeometry(posts: TimelinePost[], width: number, height: number): Tick[]
  //   x = (i + 0.5) * width / n; skipped → h = 4; read/evidence → h = max(6, round(signalScore * height)), null score → 6;
  //   kind = skipped ? "skipped" : decisionIds.length ? "evidence" : "read"
  stripCounts(posts): { total: number; read: number; evidence: number }
  <HighlightProvider>; useHighlight(): { decisionId: number | null; setDecisionId(id: number | null): void }
  <ThreadStrip posts: TimelinePost[]; height?: number (default 56); compact?: boolean />
  ```
- Rendering: SVG, ticks 2px wide (1px under 400 posts per 1000px), baseline 1px `--border`; colours skipped `--active`, read `--muted`, evidence `--chart-1`. Caption row above in 12px grey: "312 posts · 198 read by the model · 23 cited as evidence" built from `stripCounts`. Each evidence tick is a link to `?tab=timeline#post-{id}`; tooltip (plain box) "#142 · author · 2023-02-14".
- Motion: when `decisionId` changes, ticks of that decision tween `scaleY` 1 → 1.35 (transform-origin bottom) and opacity 1, all other non-skipped ticks tween opacity to 0.35 (`DUR_FAST`, `EASE`); clearing reverses. Reduced motion: set instantly.

- [ ] **Step 1: Write the failing test** `geometry.test.ts`: 4 posts at width 400, height 50 → x = [50, 150, 250, 350]; skipped post h = 4; score 1 → h 50; score null (not skipped) → 6; a post with `decisionIds: [3]` → kind "evidence"; `stripCounts` on that set.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement geometry, then the component. **Step 4:** Run → PASS; typecheck 0.
- [ ] **Step 5: Hand over** "Add thread strip with evidence highlighting".

### Task 6: Overview `/`

**Files:** Create `src/app/page.tsx` (replace temp), `src/components/tables/TopicsTable.tsx`, `tables.module.css`

- Title row: h1 "Overview"; subline is the **finding**, computed: the topic with the most unverified quotes → "PEP 701: 2 decisions rest on quotes we couldn't match to their post." (if none: "Every recovered decision is backed by a verified quote."). Primary: Button "Ingest a discussion" → `/ingest`.
- KpiStrip (4 cells, all computed from `listTopics()` + `searchDecisions({})`): "Decisions recovered" (sum), "Rejected ideas" (sum), "Quotes verified" (`formatPercent(verified/total)`, sub `ofTotal(verified,total) quotes`), "Recall vs PEP" (mean of evaluated topics' `lastRecall`, sub "3 PEPs evaluated").
- Two-column row `2fr 1fr`: TopicsTable (columns: Discussion [PEP ref + title], Decisions, Rejected, Verified, Recall; numbers right-aligned; row → `/topics/[slug]`) and "Latest PR checks" (3 rows: PR #, title, matched count, link to `/pr-checks`).
- [ ] Build; verify at 1440 that every block shows its header and first rows above 900px; typecheck 0. **Hand over** "Add overview screen".

### Task 7: Topic `/topics/[slug]`

**Files:** Create `src/app/topics/[slug]/page.tsx`, `src/components/tables/DecisionsTable.tsx`, `src/components/thread-strip/Timeline.tsx`

- `notFound()` when `getTopic` → null. Title: h1 = topic title; crumbs Overview › PEP 701; subline "312 posts from 2 sources · read by qwen3.5:4b, decided by qwen3.5:9b"; primary "Run evaluation" (mock: links to `/eval#pep-701`).
- ThreadStrip full width (wrapped in `HighlightProvider` with the table).
- Tabs `?tab=decisions` (default) | `?tab=timeline`.
- Decisions tab: DecisionsTable (Status pill, Decision title → `/decisions/[id]`, Reasons count, Quotes `verified/total` with VerifiedMark when any unverified, Code: first anchor path in mono or "—"); row hover/focus calls `setDecisionId` (strip lights up).
- Timeline tab: every post in order; skipped posts collapsed into runs ("14 posts filtered: thanks, +1, quotes" as one grey row, expandable); read posts show `#n`, author, date, triage label (neutral pill), score, body (3 lines clamped); evidence posts show links to their decisions. Anchor `id="post-{n}"`. On load with a hash, GSAP `scrollTo` the post (offset 64) and flash its background `--raised` → transparent over 0.8s (reduced: no scroll animation, no flash).
- [ ] Build; open `/topics/pep-9999` → 404 sentence inside the frame; typecheck 0. **Hand over** "Add topic screen with thread strip and timeline".

### Task 8: Decision `/decisions/[id]` and MADR export

**Files:** Create `src/app/decisions/[id]/page.tsx`, `src/components/decision/{ReasonList,EvidenceQuote,AnchorList,PeopleList,AuditDrawer,MadrButton}.tsx`, `decision.module.css`, `src/lib/madr.ts`, `src/lib/madr.test.ts`

**Interfaces:**
- Produces: `renderMadr(card: DecisionCard, dashboardUrl: string): string` and `madrFileName(card): string` (`"pep-701-d12-backslashes-in-expressions.md"`: topic slug, `d{id}`, title slugified to ≤ 6 words).
- MADR layout (exact):
  ```
  # {title}

  * Status: {status}
  * Decided: {formatDate(decidedAt)}
  * Source: {topic.title}{pepNumber ? ` (PEP ${pepNumber})` : ""}
  * Recovered by: DejaView ({model})

  ## Context and Problem Statement

  {summary}

  ## Decision Outcome

  {Status word}: {title}.

  ### Reasons

  * {reason.text}
    * "{quote}" ({author}, {formatDate(createdAt)}, {verified ? "verified" : "unverified"}) {postUrl ?? ""}

  ## Links

  * Code: `{currentPath ?? originalPath}`{symbol ? ` ({symbol})` : ""}, linked by {linkMethod}{currentPath === null ? ", not found at HEAD" : ""}
  * DejaView: {dashboardUrl}/decisions/{id}
  ```
- Page: crumbs Overview › PEP 701 › Decision; h1 = title; StatusPill beside it; subline "Rejected · decided 2023-02-14 · recovered by qwen3.5:9b"; primary "Export MADR" (downloads `renderMadr` as `madrFileName`). Main column (`1fr 384px` grid): Summary paragraph; low-confidence notice when every quote is unverified (Review Focus 1); ReasonList → each reason 16/600, its EvidenceQuote blocks (quote in 16px ink with a 3px left bar in `--rule`, then author · date · Ref post link · VerifiedMark · "Show in thread" → `/topics/[slug]?tab=timeline#post-n`). Compact ThreadStrip with this decision preselected. Right rail: Linked code (AnchorList: path Ref, symbol Ref, link method, "Renamed from …" when relocated, "Not found at HEAD" grey when `currentPath` null), People (initial + pale tint per person, hues ≥ 60° apart), Audit ("3 model calls" → AuditDrawer).
- AuditDrawer: right-side panel 480px, the one floating surface (shadow `0 12px 28px rgba(0,0,0,.12)`), lists each LLM call (stage, model, duration, prompt and response in `<pre>`). GSAP open `x: 100% → 0` + backdrop opacity 0 → 0.32 (`DUR`, `EASE`), close reverses; focus moves into the drawer, Escape closes, focus returns. Reduced: instant.

- [ ] **Step 1: Write the failing test** `madr.test.ts`: on the low-confidence sample card the output contains `"* Status: rejected"`, `", unverified)"`, `"not found at HEAD"` when its anchor has `currentPath: null`, ends with `/decisions/{id}`; `madrFileName` for title "Allow backslashes inside f-string expressions" in pep-701 id 12 → `"pep-701-d12-allow-backslashes-inside-f-string-expressions.md"`; a full snapshot (`toMatchSnapshot()`) of one accepted card.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `madr.ts`, then the page and components. **Step 4:** Run → PASS; typecheck 0; `/decisions/999` → 404 in frame.
- [ ] **Step 5: Hand over** "Add decision screen, audit drawer and MADR export".

### Task 9: Decisions search `/decisions`

**Files:** Create `src/app/decisions/page.tsx`

- Title "Decisions"; subline "{n} decisions across {m} discussions". Filter row (32px controls): search field (prefilled from `q`), Status select (All / Accepted / Rejected / Withdrawn / Open), Discussion select, "Verified only" checkbox; GET form, so it works without script. Count right-aligned ("12 decisions"). DecisionsTable reused with a Discussion column. Empty: `EmptyState` "No decisions match “{q}”." spanning the table (Review Focus 3).
- [ ] Build; `/decisions?q=zzz` shows the sentence inside the frame; typecheck 0. **Hand over** "Add decision search screen".

### Task 10: Ingest `/ingest`

**Files:** Create `src/app/ingest/page.tsx`, `src/components/ingest/{IngestForm,JobProgress}.tsx`, `ingest.module.css`

- Title "Ingest a discussion"; subline "Paste a discuss.python.org thread or a GitHub issue or PR. The laptop model is slow; a 300-post thread takes several minutes." Form: URL (label above, 40px field), Topic slug, PEP number (optional), primary "Start". The field limit "discuss.python.org or github.com links" sits under the URL field with `aria-describedby`.
- JobProgress (client): polls `getJob` every 1000ms until `done`/`failed`; one row per `MOCK_STAGES` stage (name in words: "Fetching posts", "Cleaning", "Triage with qwen3.5:4b", "Extraction with qwen3.5:9b", "Verifying quotes", "Merging duplicates", "Linking to code"); done rows show a check, the current row a 6px track whose fill tweens to the true progress (`DUR`), pending rows grey. When done: "View PEP 698 decisions" link. Failed: error sentence inside the block with "Retry".
- [ ] Build; start a job in mock mode and watch it reach done in about 38s; typecheck 0. **Hand over** "Add ingest screen with live job progress".

### Task 11: Evaluation `/eval`

**Files:** Create `src/app/eval/page.tsx`, `src/components/eval/{RecallBars,GroundTruthTable}.tsx`

- Title "Evaluation"; subline "We give the model each PEP's discussion without the PEP, then compare with the PEP's Rejected Ideas section." Primary "Run evaluation" (mock: disabled with the reason in its title text).
- RecallBars (one row per PEP, `Charts.bullet` rule from app-screens §6.1): label `PEP 701`, a bar at the true recall in `--chart-1`, value `ofTotal(matched, total)` + `formatPercent(recall)`, reason agreement in grey. Anchor `id="pep-{n}"`.
- GroundTruthTable per PEP: columns *PEP says* (ground-truth title + 2-line text) | *DejaView found* (matched decision title → link, or "Not recovered" in grey) | Reasons agree (Yes / Partly / No / —). Below it: "{extraIdeas} more rejected ideas found in the discussion that the PEP does not list", linking to the topic.
- [ ] Build; numbers equal the dataset (3 PEPs); typecheck 0. **Hand over** "Add evaluation scorecard".

### Task 12: PR checks `/pr-checks`

**Files:** Create `src/app/pr-checks/page.tsx`, `src/components/pr/{PrCheckList,CommentPreview}.tsx`

- Title "PR checks"; subline freshness stamp "Last check 2026-10-31 23:40". List/detail: left list (PR #, title, repo, "2 decisions" / "Similar rejected idea" / "No precedent"), selected row uses `--active` fill; right pane renders `commentMarkdown` with `react-markdown` (headings 16/600, quotes like EvidenceQuote). Selection via `?pr=` so it works without script. Phone: one region at a time.
- [ ] Build; typecheck 0. **Hand over** "Add PR checks screen".

### Task 13: Design gate, critique and polish

**Files:** Modify any file under `apps/web/src/` as the critique requires; Modify `docs/team/nitesh.md` (tick finished tasks)

- [ ] **Step 1:** `npm run build -w @dejaview/web && npm run start -w @dejaview/web` (production build, port 3100).
- [ ] **Step 2:** From `apps/web`: `node ~/.claude/skills/design-taste-frontend/scripts/lint.mjs --app src` and `node ~/.claude/skills/design-taste-frontend/scripts/inspect.mjs --app http://localhost:3100/` and again for `/topics/pep-701`, `/decisions/{low-confidence id}`, `/eval`, `/ingest`, `/pr-checks`, `/decisions?q=zzz`. Expected: 0 FAIL on every screen at 1440, 768, 390.
- [ ] **Step 3:** Open every screenshot in `.taste-skill/inspect/`; answer the seven questions of app-screens §2.7 in writing (append to this plan under "Critique log"); fix the worst three; re-run. At most three rounds.
- [ ] **Step 4:** Reduced motion: with `prefers-reduced-motion: reduce` emulated, strip highlight, drawer, menu and evidence jump still work with no travel.
- [ ] **Step 5:** Root `npm run typecheck` → 0, `npm test` → all pass. Tick tasks 1–10 of `docs/team/nitesh.md` that are done.
- [ ] **Step 6: Hand over** "Polish dashboard after design review" with the PR description listing sample data to replace (Task 3 content) and the critique scores.

## Critique log

Final gate (production build, 1440 / 768 / 390): lint 0 FAIL; inspector 0 FAIL on all 11 screens checked
(`/`, topic, timeline, decision ×2, search, empty search, ingest, eval, PR checks, not-found).

Answers to app-screens §2.7:

1. **Biggest block answers the question.** Overview: the finding line + discussions table; topic: strip then
   decisions; decision: reasons with quotes; eval: recall bars then side-by-side tables. Yes on every screen.
2. **Shared edges, no dead strips.** Rows of cards end level; the timeline got a right rail and ingest/not-found
   got real content after the inspector flagged voids.
3. **Colour only on data.** Teal only on evidence ticks, recall bars, progress and the active underline; status
   pills use the pale pairs; one near-black primary per screen.
4. **Numbers add up.** Every count is derived from rows (tests in `mocks/views.test.ts`, `lib/overview.test.ts`,
   `lib/eval.test.ts`); verified quotes are checked to appear verbatim in their post.
5. **Zeros and dashes.** Missing recall/duration/code print a grey dash; real zeros print as 0.
6. **Legends match marks.** The strip legend swatches are the tick marks; no caption explains colours.
7. **Phone.** Sidebar folds into a menu sheet; tables become label/value rows with right-aligned figures; rails
   move under the main column; PR checks show one region at a time.

Warnings kept, with reasons:
- `unused-canvas` on the timeline: post bodies keep a 75-character reading measure beside the rail.
- `no-data-hue` on decision pages: the strip lights only that decision's 1–3 evidence ticks (2.5× wide), a tiny
  pixel share by design; the screen's main data is the quotes.
- `hero-void` on PR checks: the gap under a short bot comment in the detail pane.
- `em-dash` (lint, global count): every dash is a missing-value mark in data, never prose.

Fixed during the gate: phone numbers left-aligned, phone text under 13px, odd KPI cell, duplicate heading id
(`audit-title`) between the audit card and the drawer, GSAP warnings on empty targets, and `withMotion`
replaying stale animations when the motion preference changed (now one-shot, tested in `lib/motion.test.ts`).
