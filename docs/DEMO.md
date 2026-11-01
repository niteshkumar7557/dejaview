# DejaView: the demo, page by page

How to run the live demo, what to show on each page and what to say, plus the list of known issues to
improve. For how the code works, see [`PLATFORM.md`](PLATFORM.md). Pitch deck:
https://claude.ai/artifact/MXjrZkCimXQwnbEzCSduRY (fill its `[__]` numbers from `examples/`).

---

## 1. Start everything (about 2 minutes)

```sh
open -a Docker                                   # Docker Desktop must be running
docker compose up -d                             # Postgres on :5432
set -a; . ./.env; set +a                         # LLM_BASE_URL=https://llm.kumarnitesh.in (no /v1), LLM_API_TOKEN
npm run migrate
DASHBOARD_URL=http://localhost:3100 npm run start -w @dejaview/api        # API on :3001
LLM_MODE=live CPYTHON_DIR=$PWD/data/cpython npm run start -w @dejaview/worker
npm run build -w @dejaview/web && npm run start -w @dejaview/web          # dashboard on :3100
```

- `apps/web/.env.local` (git-ignored) must say `NEXT_PUBLIC_USE_MOCKS=0` and
  `NEXT_PUBLIC_API_URL=http://localhost:3001`; rebuild the dashboard after changing it.
- `LLM_MODE=live` is safe even with the laptop busy: a thread we already ran (PEP 698, PEP 701) is answered
  from the recordings in `fixtures/llm/` in seconds, and is still saved to the audit trail.
- The CPython clone lives in `data/cpython` (git-ignored, ~400 MB, blobless). The worker clones it on first
  use if it is missing.
- Only one worker may run (a Postgres lock). If a worker was force-killed and a new one says "Another worker
  is already running", end the stale session:
  `docker compose exec -T postgres psql -U dejaview -d dejaview -c "select pg_terminate_backend(pid) from pg_locks where locktype='advisory'"`.

**Load the data** (if the database is empty): on the dashboard's **Ingest** page paste
`https://discuss.python.org/t/pep-698-a-typing-override-decorator/20839` (short name `pep-698`, PEP 698),
then `https://discuss.python.org/t/pep-701-syntactic-formalization-of-f-strings/22046` (`pep-701`, 701).
Then **Evaluation → Run evaluation** for each. PEP 698 finishes in about 2 minutes (code linking is the
slow step); PEP 701's code linking takes a long time (see backlog).

**PR check example** (for the PR checks page):
`curl -s -X POST localhost:3001/api/pr-check -H 'content-type: application/json' --data @examples/pr-check/input/pr.json`

---

## 2. The demo script (8 minutes)

### Problem (1 min), no screen
"Open-source projects decide things in long public threads. For Python's walrus operator, people proposed
`x as y`; it was rejected because `as` already means three other things. That reason is buried in a giant
thread, so newcomers propose it again. The organizers' test: give the system a PEP's discussion **without
the PEP**, and see whether it recovers the rejected ideas and why."

### Overview page (`/`), 30 s
- Four numbers at the top: **decisions recovered, rejected ideas, quotes verified, recall against the PEP**.
  Say: "Every number is from real runs: 19 decisions from 2 discussions, and **every one of the 63 quotes
  was found word for word in its post**." (These are the PEP 698 and PEP 701 totals. If `gh-101016` is also
  loaded, read the numbers off the page instead.)
- **Discussions** table: one row per PEP with its counts. **Rejected ideas** list: the most useful thing for
  a newcomer. **Latest PR checks**: what the bot said recently.

### Topic page (`/topics/pep-701`), 1 min
- The **strip** under the title: one bar per post of the 114-post thread. Grey = read, teal = quoted as
  evidence, tiny = filtered out before any model saw it. Say: "This is the funnel made visible: code threw
  out 13 posts, the 4B model sorted the rest, the 9B only extracted from what mattered."
- **Decisions** tab with filters (Accepted / Rejected / Open). **Timeline** tab: every post with its triage
  label and signal score; hover a decision to light up the posts it quotes.

### Decision card (click a rejected decision, e.g. PEP 698 "runtime enforcement"), 2 min, the key screen
- Title, **status pill**, date, model, confidence.
- **Why it was rejected**: each reason, and under it the **quote** with ✅ **Verified 1.00**, the author,
  date and post number. Click **Show in thread** or the post number → the exact post on
  discuss.python.org. Say: "Two clicks from claim to source. We don't trust the model: code checks every
  quote, and an unverified one is shown with a warning, never hidden."
- **Linked code**: `Lib/typing.py`, `typing.override`. Say: "Anchored by symbol, path and commit, not line
  numbers, and we follow git renames."
- **People**: who argued it (the same person across forum and GitHub is merged into one name).
- **Audit trail → N model calls**: opens a drawer with every prompt and answer, which model, how long.
- **Export MADR**: downloads the decision as a standard Architecture Decision Record file.

### PR checks page (`/pr-checks`), 1.5 min
- The bot's comment on a PR titled "Enforce @typing.override at runtime" that edits `Lib/typing.py`:
  the **accepted** PEP 698 decision (matched because both touch `Lib/typing.py`) and a **"previously
  rejected"** warning for runtime enforcement, with its reason and a link. Say: "This is DejaView's job in
  one picture: the PR hasn't been merged yet, and the bot already tells the author it was tried and why it
  was turned down." (The live GitHub version needs the CPython fork, see backlog.)

### Evaluation page (`/eval`), 1 min
- Recall per PEP and the side-by-side table: **the PEP says** (Rejected Ideas) | **DejaView found, from the
  discussion alone** | reasons agree. Say the honest numbers: **PEP 701: 2 of 3** rejected ideas recovered;
  **PEP 698: 1 of 4**, because three of its rejected ideas were barely argued in that 11-post thread. "The
  model never saw the PEP; we fetch it only afterwards to score ourselves."

### Ingest page (`/ingest`), 30 s
- Paste a discuss.python.org or GitHub link, or upload a file (JSON / Markdown / text). The progress panel
  shows each stage (fetch → clean → triage 4B → extract 9B → verify → consolidate 9B → link). Say: "On a
  4 GB laptop GPU a 100-post thread takes about 20 minutes, so we run them ahead of time; everything you saw
  is served from Postgres, so the demo works even if the laptop is off."

### Models and trade-offs (1 min)
"Two open models on our own laptop: Qwen3.5 4B sorts every post (fast), Qwen3.5 9B reasons over the posts
that matter and judges our evaluation. No closed APIs. CI never calls the model: every real answer is
recorded and replayed, and a test proves the committed examples are reproduced exactly."

---

## 3. Known issues and improvements (backlog for the next session)

Quality of the extraction
1. **Consolidation merges different ideas** into one decision (PEP 698: runtime enforcement + naming the
   parent class; PEP 701 `d4`: quote reuse + escaped braces). Make the consolidation prompt stricter ("only
   the same idea"), keep one idea per title. This also inflates PEP 701's recall (two matches, one decision).
2. **Reasons are often copied quotes**, not a reason in the model's own words, so the card shows the same
   text twice. Ask for a one-line reason and keep the quote as evidence.
3. Titles sometimes carry labels ("(rejected)", "Accepted proposals: …").
4. Run **PEP 695** (140 posts, ~25 min) with `LLM_MODE=record`, commit `examples/pep-695` and its fixtures.

Pipeline and backend
5. **Link job is slow on long threads** (PEP 701 took 30+ min): the reference finder treats domain names
   (`discuss.python.org`, `cdn.com`) as symbols and each lookup runs `git grep` (~2.5 s). Filter domain-like
   tokens in `packages/linker/src/references.ts` and cache lookups per symbol.
6. **Link job progress stays at 0%**: `handleLink` reports `0/n` on every decision; report `i/n`.
7. The PR bot only flags **accepted** decisions by code overlap; a **rejected** decision anchored to the same
   file is only found by words. Consider code overlap for rejected ones too.
8. The ingest form doesn't send a topic title, so uploads are titled by their short name.

Dashboard
9. The sidebar footer wraps ("Models: qwen3.5:4b, / qwen3.5:9b") at the new font size.
10. The local database has two identical PR checks (#101) from testing; clear `pr_checks` before the demo
    or re-send one.

Live GitHub demo (not code)
11. **CPython fork + Action**: fork `python/cpython`, add `apps/action/workflows/dejaview.yml` as
    `.github/workflows/dejaview.yml`, set secrets `DEJAVIEW_API_URL` and `DEJAVIEW_API_TOKEN`. The API must be
    reachable from GitHub: deploy (`fly.toml`, `Dockerfile`) or a tunnel to `localhost:3001`. Then open two
    demo PRs: one touching `Lib/typing.py` near `override`, one re-proposing runtime enforcement.
