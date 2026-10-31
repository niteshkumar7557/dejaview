# Ansh: Code linking and PR bot

You own the **connection to code**: finding which CPython files and symbols each decision is about, keeping
those links alive when files move, and the GitHub bot that warns a new PR. This is the live-demo moment.

Read first: `docs/team/README.md`, `design.md` §5.4 (code linking + rename resilience), §5.5 (PR bot),
§5.7 ("already rejected?"), §10 (demo script). Contract: `packages/shared/src/domain.ts` (`ThreadPost`,
`ExtractedDecision`, `CodeAnchor`, `PrCheckRequest`) and `packages/shared/src/api.ts` (`DecisionSummary`,
`PrCheckResponse`).

## You own

`packages/linker/` · `apps/action/` · `examples/pr-check/` · the demo fork of CPython on GitHub. Don't edit
other people's folders; ask them.

## Who depends on you

- **Mudit's worker** calls `linkDecision()`; **Mudit's API** calls `matchPr()` and `renderPrComment()`.
- **Nitesh** shows your anchors (path, symbol, rename history) on the decision card.

You depend on Mudit's `fixtures/threads/*.json` and Abhijeet's `examples/pep-*/output/decisions.json`. Until
they land, build the reference parser and the rename logic with your own small test data.

## Public API of `@dejaview/linker`

```ts
findReferences(post: ThreadPost): Reference[]          // gh-/bpo-/PR/commit/path/symbol mentions
linkDecision(decision: ExtractedDecision, posts: ThreadPost[], ctx: {
  repoDir: string;                 // CPython clone (CPYTHON_DIR)
  repo: string;                    // "python/cpython"
  githubToken?: string;
}): Promise<CodeAnchor[]>
relocateAnchor(anchor: CodeAnchor, repoDir: string): Promise<CodeAnchor>
matchPr(req: PrCheckRequest, candidates: DecisionSummary[]): DecisionSummary[]
renderPrComment(matches: DecisionSummary[], similarRejected: DecisionSummary[], dashboardUrl: string): string
```

## Tasks (in order)

### Final sprint status

- [x] **Implementation:** `renderPrComment()` now combines matched and full-text-search rejected decisions,
  deduplicates them by ID, and counts the rendered accepted and rejected collections.
- [x] **Regression coverage:** the linker PR-comment suite passes (17/17 tests), including the new case
  and its snapshot.
- [x] **Automated testing:** full `npm run typecheck` passed; full `npm test` passed (339 passed, 54
  skipped across 40 files). The linker PR-comment suite also passed (17/17 tests).
- [ ] **Live GitHub demo:** fork setup, secrets, real decision records, demo PRs, and real-output fixtures
  have not been verified; the browser is signed out, upstream writes are denied, and deployment credentials
  are unavailable in this environment.

- [ ] **1. Reference parser** (no network): `gh-12345`, `bpo-12345`, `python/cpython#12345`, PR/issue URLs,
  commit SHAs, paths like `Lib/typing.py` / `Objects/typevarobject.c`, backticked symbols like
  `` `typing.override` `` / `` `PyErr_SetString` ``. Many unit tests.
- [ ] **2. CPython clone helper.** `git clone --filter=blob:none https://github.com/python/cpython` into
  `CPYTHON_DIR` (full history, file contents fetched on demand). Path exists check; symbol definition search
  with `git grep` (`def name`, `class name`, C function definitions).
- [ ] **3. GitHub lookups.** PR number → changed files + merge commit (REST API, optional `GITHUB_TOKEN`).
  Tests use saved API responses, no network.
- [ ] **4. `linkDecision`.** Look in the decision's evidence posts first (then their direct replies) for
  references; PR refs give the strongest links (`pr_ref`), then paths, then symbols. One `CodeAnchor` per
  file/symbol with the post it came from. Never store line numbers.
- [ ] **5. Rename resilience** (`relocateAnchor`). If `currentPath` is gone at HEAD: follow
  `git log --follow --name-status` from `originalCommit`, else search for the symbol's definition. Set
  `relocatedBy`. Test with a temporary git repo that renames a file.
- [ ] **6. `matchPr` + `renderPrComment`.** Match PR files (and `previousPath` for renames) and symbols to
  anchors (`currentPath`/`originalPath`/`symbol`). Templated Markdown (no LLM) from `design.md` §5.5, with a
  hidden marker `<!-- dejaview -->` so the Action can update its own comment, plus the "similar rejected"
  section. Snapshot tests.
- [ ] **7. GitHub Action** (`apps/action`). On `pull_request` in the demo fork: list changed files (with
  renames) via the GitHub API, read function/class names from diff hunk headers, `POST /api/pr-check` with
  `DEJAVIEW_API_URL` + `DEJAVIEW_API_TOKEN` secrets, then create or update one comment using the marker.
  Simplest setup: the fork's workflow checks out this repo and runs the action script with `npx tsx`.
- [ ] **8. Demo fork + demo PRs.** Fork `python/cpython`, disable its own workflows, add ours. Prepare two PRs:
  one touching a file linked to a decision, one whose description re-proposes a rejected idea. Save the
  request/response as `examples/pr-check/input/pr.json` and `examples/pr-check/output/comment.md`.

## Definition of done

Real anchors for the dev PEPs' decisions; rename relocation proven by a test; the bot comments on a real PR in
the fork; unit and snapshot tests green.

## In the pitch / Q&A you explain

How decisions are linked to code (three link methods and their strength), why anchors use symbol + path +
commit instead of line numbers, what happens when a file is renamed, how the PR bot works end to end, why the
comment is templated rather than LLM-written.
