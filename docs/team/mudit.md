# Mudit: Data, API and worker

![The data side of DejaView](mudit-flow.png)

You own the **backbone**: getting discussions in, storing everything in Postgres with raw SQL, running the
slow pipeline jobs in the background, serving the API, and deploying. You are the only part that touches the
database.

Read first: `docs/team/README.md`, `design.md` §4 (architecture), §5.1 (ingest), §7 (data model), §8 (API),
§13 (risks). Contract: `packages/shared/src/domain.ts` (`Thread`, `ThreadPost`, `LlmCallStore`) and
`packages/shared/src/api.ts` (every API response).

## You own

`db/` · `apps/api/` · `apps/worker/` · `packages/ingest/` · `fixtures/threads/` · `docker-compose.yml` ·
`.env.example` · deployment config. Don't edit other people's folders; ask them.

## Who depends on you

- **Abhijeet and Ansh** need real threads in `fixtures/threads/` **first**: this is your #1 job.
- **Nitesh** needs the API (he builds on mocks until it's ready).
- **Ansh's GitHub Action** calls your `POST /api/pr-check`.

## Tasks (in order)

- [x] **1. Discourse ingest + fixtures (target 10:30 PM).** `packages/ingest` (`@dejaview/ingest`):
  - `fetchDiscourseThread(url): Promise<Thread>` using the public JSON API: `GET /t/{id}.json` gives the
    first posts and `post_stream.stream` (all post ids); fetch the rest with
    `GET /t/{id}/posts.json?post_ids[]=…` in batches of ~20. Use `cooked` HTML as `body` (`format: "html"`),
    the post number as `id`/`externalId`, `like_count` (from `actions_summary`) as `likes`,
    `reply_to_post_number` as `replyToId`, and build the permalink `https://discuss.python.org/t/{slug}/{id}/{post_number}`.
  - CLI: `npm run fetch-thread -w @dejaview/ingest -- <url> --slug pep-698 --pep 698` → writes
    `fixtures/threads/pep-698.json`.
  - Fetch the dev PEP threads (PEP 698 first) and **merge that PR quickly** so others can pull it.
  - Tests: parse a saved Discourse JSON response (no network in tests).
- [x] **2. Database.** `db/migrations/*.sql` from `design.md` §7, a tiny migration runner (`db/migrate.ts`
  with `pg`, records applied files in a `schema_migrations` table), root script `"migrate"` (CI already calls
  `npm run migrate --if-present` with `DATABASE_URL` set to a Postgres 16 service). `docker-compose.yml` for
  local Postgres. Check constraints must match the contract enums (`DECISION_STATUSES`, `TRIAGE_LABELS`).
- [x] **3. Data access.** Plain functions with parameterized SQL (`pool.query('… $1', [x])`, never string
  concatenation): save thread/posts, save `ExtractionResult` (decisions, reasons, evidence, post annotations),
  save `CodeAnchor[]`, save eval runs, PR checks. Keep the `decisions.search` tsvector updated (title + summary + reasons).
- [x] **4. Worker** (`apps/worker`). Loop that claims jobs with `SELECT … FOR UPDATE SKIP LOCKED`, updates
  `stage`/`progress`, records errors. Job chain: `ingest` → `extract` (calls Abhijeet's
  `runExtraction(thread, deps)`) → `link` (calls Ansh's `linkDecision(...)`) → optional `eval` (calls
  `evaluatePep(...)`). Implement `LlmCallStore` on the `llm_calls` table and pass it to the pipeline.
- [x] **5. API** (`apps/api`, Express). Every route in `packages/shared/src/api.ts`, returning exactly those
  types. CORS for the web app. `POST /api/pr-check` requires `Authorization: Bearer $DEJAVIEW_API_TOKEN`; it
  loads candidate decisions + anchors, calls Ansh's `matchPr()` and `renderPrComment()`, runs the
  "similar rejected" full-text query (`ts_rank` over `decisions.search`, status = rejected), stores a row in
  `pr_checks`. `GET /api/health` reports DB and LLM reachability.
  Tests: supertest against the CI Postgres (`DATABASE_URL`).
- [x] **6. More ingest sources.** GitHub issue/PR (REST API; optional `GITHUB_TOKEN`; markdown bodies,
  strip nothing; the pipeline cleans) and file upload adapters (JSON array of posts, Markdown, plain text).
- [ ] **7. Deploy** (Railway or similar): Postgres + API + worker + web, env vars set there, never in the repo.
  The GitHub Action needs a public HTTPS URL for the API.
- [ ] **8. (P2, only if time)** Contributor identity across platforms (`design.md` §5.9).

## Definition of done

Real threads in `fixtures/threads/`; `npm run migrate` works in CI; the worker turns an ingested thread into
decisions + anchors in the DB; every API route returns the contract shapes; tests for ingest parsing,
SQL functions and routes; deployed URL shared with the team.

## In the pitch / Q&A you explain

How a thread gets in (Discourse API), the data model, why a Postgres job table instead of Redis, why raw SQL,
how the LLM audit trail (`llm_calls`) makes every decision traceable, how the PR check endpoint works.

---

# How I actually did it — the whole process, step by step

This part is written for a human reading the repo for the first time. Plain words, no shortcuts.
It covers the work that is **done and tested** so far: the ingest package and the three real thread fixtures.

## The rules I was working under

1. **I only touched my own folders.** `packages/ingest/`, `fixtures/threads/`, and `docs/team/mudit.md`.
   I did not touch `packages/pipeline/` (Abhijeet), `packages/linker/` (Ansh), `apps/web/` (Nitesh) or
   `packages/shared/` (shared contract). If I needed something from them, I would have asked, not edited.
2. **I worked on a branch, never on `main`.** The branch is `mudit/ingest`.
3. **I did not commit, push or open a PR — because nobody had reviewed the diff yet.** Under the rule in
   `CLAUDE.md`, an AI agent may commit and push **after a human has reviewed the change and said go
   ahead**. Until then it shows the diff and hands over the commit message and the PR description, which
   is what I did here.
4. **Everything gets a real test.** No stubs. Tests must run with no network, so I saved real API answers
   and replay them.
5. **I never read the PEP text while ingesting.** Only the eval module is allowed to fetch the PEP, and
   that is Abhijeet's job. My code only touches the *discussion*.

## Step 0 — Read the rules before touching anything

Before writing code I read, in this order:

- `CLAUDE.md` — the house rules (branch naming, the human-review gate before an agent commits, the two
  required lines in every commit message, "read `design.md` first").
- `docs/team/README.md` — who owns which folder.
- `docs/team/mudit.md` — my own task list.
- `design.md` — the product design. The parts that matter to me are §4 (architecture), §5.1 (ingest),
  §7 (data model), §8 (API) and §13 (risks).
- `packages/shared/src/domain.ts` and `packages/shared/src/api.ts` — the **contract**. These are the exact
  shapes my code has to produce. `Thread` is what ingest must return. `ThreadPost` is what one post looks like.

**Why this order matters:** the contract is written by someone else. If I invent my own shape, Abhijeet's
pipeline and Nitesh's UI break. So the contract decides, not me.

## Step 1 — Make the branch, install the dependencies, check the starting point

```bash
git checkout -b mudit/ingest     # we were on main
npm install                      # node_modules was not there at all
```

Then I checked the starting point before changing anything:

```bash
npm test          # 13 tests passed (the conventions checker)
npm run typecheck # green
```

**Why:** if the tests were already broken, I would not have known later whether *I* broke them.
A green baseline is the only honest starting point.

## Step 2 — Find out what the APIs *really* return (do not guess)

This was the most important step. `design.md` describes the Discourse API roughly. "Roughly" is not good
enough — if I guess wrong, the code looks fine and returns nothing at run time.

So I made real calls with `curl` / `node fetch` and printed the shape of the answers. Here is what I found:

**Discourse (`discuss.python.org`)**

| Question | Answer |
|---|---|
| What does `/t/{id}.json` give? | The topic id, slug, title, `posts_count`, and `post_stream` with the **first ~20 posts** and `stream` (the id of **every** post). |
| How do I get the rest? | `GET /t/{id}/posts.json?post_ids[]=…`, in batches of 20. |
| **Trap:** which ids does that endpoint want? | The **global post ids from `stream`** (like `73686`). If you pass *post numbers* (like `3`) it does **not** error — it quietly returns `posts: []`. An empty list with no error is the worst kind of bug. |
| Where are the likes? | There is **no `like_count` field**. Likes live in `actions_summary`, an array of `{id, name, count}`, and the "like" action has `id === 2`. |
| Where is the permalink? | `post_url` is a **path** (`/t/slug/22046/22`). I must put the origin in front of it. |
| Can `stream` and `posts_count` disagree? | Yes. `stream` can be longer, because deleted posts stay in the list. A batch can then come back with fewer posts than we asked for. My code has to survive that. |

**GitHub (`api.github.com`)**

| Endpoint | Fields I use |
|---|---|
| `GET /repos/{o}/{r}/issues/{n}` | `user.login`, `body`, `created_at`, `html_url` |
| `GET /repos/{o}/{r}/issues/{n}/comments` | `id`, `user.login`, `body`, `created_at`, `html_url` |
| `GET /repos/{o}/{r}/pulls/{n}` | `user.login`, `body`, `html_url`, `title` |
| `GET /repos/{o}/{r}/pulls/{n}/files` | `filename`, `previous_filename` (only when the file was renamed) |
| `GET /repos/{o}/{r}/pulls/{n}/comments` | `id`, `body`, `user.login`, `created_at`, `html_url`, `in_reply_to_id` |

Two more things I checked: a PR's `body` can be **`null`** (PR #1 in cpython is), so every reader has to
handle a missing body. And the **unauthenticated rate limit is only 60 requests per hour** — with a
`GITHUB_TOKEN` it is 5000. The token is optional and read from the environment, never from the repo.

**Why:** every one of those traps would have looked like "the tool found nothing" during the demo. An hour
of probing saved a very confusing evening.

## Step 3 — Create the workspace

```
packages/ingest/
  package.json     name: @dejaview/ingest, scripts: typecheck and fetch-thread
  tsconfig.json    extends ../../tsconfig.base.json, includes src/**/*.ts
```

The name matters: the team agreed that every workspace is called `@dejaview/<folder>`. The root
`package.json` already globs `packages/*`, so npm linked the new workspace by itself — no edit needed.
I ran `npm install` again after creating it so the symlink `node_modules/@dejaview/ingest` appears.

## Step 4 — Write the files, in this order

### `src/url.ts` — work out *what* the user pasted

The ingest box accepts a URL and we must know which site it belongs to. So two small parsers:

- `parseDiscourseUrl()` — understands all three shapes a topic link comes in:
  `/t/22046` · `/t/slug/22046` · `/t/slug/22046/22`. It also throws away the query string, the `#fragment`
  and a trailing `.json`.
- `parseGithubUrl()` — understands `/owner/repo/issues/123` and `/owner/repo/pull/123`, and refuses other
  hosts so a GitLab link does not get treated as GitHub.

Both return `null` when they do not recognise the URL, and the caller then tries the next reader.

### `src/http.ts` — one single door to the internet

Every network call in the whole package goes through `getJson()`. It does three things and nothing else:

1. Adds `User-Agent` and `Accept: application/json`.
2. Adds `Authorization: Bearer …` when a GitHub token was given.
3. Turns anything that is not a successful JSON answer into a clear error:
   `GET <url> failed with HTTP 500`.

The important trick: **the `fetch` function can be injected.** The caller passes `fetchImpl`, and the tests
pass a fake one. That is why all 38 tests run in about 120 milliseconds and never touch the network.

### `src/discourse.ts` — the forum reader

```ts
fetchDiscourseThread(url, options) → Promise<Thread>
```

What it does, in order:

1. Parse the URL to get the topic id and the forum origin.
2. `GET {origin}/t/{id}.json` → title, slug, first page of posts, and the full list of post ids.
3. Work out which ids we do **not** have yet, and fetch them in batches of 20 from
   `/t/{id}/posts.json?post_ids[]=…`.
4. Put the posts in one map keyed by post number. This kills duplicates for free (the same post can be
   reached twice) and keeps deleted posts from leaving holes.
5. Sort by post number, so the timeline is in reading order.
6. Convert each post into the contract's `ThreadPost`.

The field mapping, one row at a time:

| Discourse field | `ThreadPost` field | Note |
|---|---|---|
| `post_number` | `id` and `externalId` | The number a human sees in the URL. Stable inside a topic. |
| `username` | `author` | Falls back to `name`, then `"unknown"`. |
| `created_at` | `createdAt` | `null` when the forum does not say. |
| `post_url` | `url` | Full link: origin + path. Falls back to building it by hand. |
| `cooked` | `body` | The HTML exactly as the forum served it. `format: "html"`. |
| `actions_summary` where `id === 2` | `likes` | Left out entirely when the count is 0. |
| `reply_to_post_number` | `replyToId` | Which post this one answers. |

**Why keep the raw HTML?** Because cleaning text is Abhijeet's job (the pipeline strips quote blocks and
turns HTML into text). If I clean it here, the pipeline's rules would have to change. My job is to fetch
faithfully; his job is to read.

### `src/github.ts` — issues and pull requests

`fetchGithubThread(url, options) → Promise<Thread>`

1. Parse the URL into owner, repo, number, and whether it is a PR.
2. Fetch the issue (or PR) and turn its body into the **first post**, written by the issue author.
3. Fetch the issue comments. On a PR, also fetch the **review comments** (the ones with a diff attached).
4. Put them in order by creation time.
5. Make sure every post has its own number inside the thread.

`fetchGithubPullFiles(url)` is a second, separate function that returns the files a PR touches. I kept it
separate on purpose: the linker needs it, but fetching it for every ingest would waste GitHub's rate limit.

**Why is the first post the issue body?** Because that is how people read a GitHub issue: the question
first, then the answers. It also gives the pipeline a natural "proposal" post to start from.

### `src/upload.ts` — the organizers' file, whose format nobody knows yet

The brief says the dataset format is unknown, so I read three shapes and pick with one rule
(`threadFromUpload`):

| Format | How I read it |
|---|---|
| **JSON** | An array of `{author, created_at, body}`, or an object with a `posts` array. I also accept the other spellings teams use: `user` / `username` / `name` for the author, `createdAt` / `date` / `timestamp` for the date, `text` / `content` for the body. |
| **Markdown** | Posts are separated by a line of `---`. The first line of a post may be the author, written as `Author: x`, `**x**`, `*x*` or `@x`. If it is, it is taken out and used as the author. Otherwise the author is `"unknown"`. |
| **Plain text** | The same separator and the same author rule. |

If the file name says `.json` we use the JSON reader. If the file name says nothing useful, we look at the
first character: `[` or `{` means JSON. A file with no `---` at all is treated as one single post, because
splitting a paragraph on blank lines would tear sentences in half.

### `src/cli.ts` — the command the humans actually type

```bash
npm run fetch-thread -w @dejaview/ingest -- <url-or-file> --slug pep-701 --pep 701
```

It works out what the argument is (existing file → upload, Discourse URL → forum, GitHub URL → GitHub),
fetches it, and writes `fixtures/threads/<slug>.json`. The output folder defaults to the repo's
`fixtures/threads/`, found from the location of the script itself — so the command works the same from
anywhere.

`--with-files` additionally writes `<slug>.files.json` with the changed files of a pull request.

### `src/index.ts` — the public door

It re-exports the five modules above. Anyone in the team can write
`import { fetchDiscourseThread } from "@dejaview/ingest";` and get the same functions the CLI uses.

## Step 5 — Write the tests, using real saved answers

I saved real API answers into `packages/ingest/testdata/` (trimmed small so the repo stays light):

```
discourse-topic.json          a real topic, first 2 posts + the first 4 stream ids
discourse-posts-batch.json    the real /posts.json answer
github-issue.json             a real cpython issue
github-issue-comments.json    real issue comments
github-pr.json                a real cpython pull request (its body is null!)
github-pr-files.json          real changed files
github-pr-review-comments.json real review comments
```

`src/testing.ts` is a small helper that reads those files and fakes the network: it takes a list of
"if the URL contains X, answer with Y" rules, and it also records every URL that was requested. That last
part is what lets a test prove something important, for example:

```ts
expect(batchCall).toContain("post_ids[]=73686");   // the global id
expect(batchCall).not.toContain("post_ids[]=3");    // NOT the post number
```

The four test files cover:

- `url.test.ts` — every URL shape, and the ones that must be rejected.
- `discourse.test.ts` — the first page, the batches, the id-vs-post-number trap, deleted posts, the
  batching limit of 20, the likes, the permalink, duplicates, and a server error.
- `github.test.ts` — issue, pull request, review comments, a `null` body, the unique ids, the ordering, and
  the token header (present when given, absent when not).
- `upload.test.ts` — JSON, the JSON wrapper, the key spellings, Markdown, plain text, no separator, and
  picking the right reader from the file name.

**Result: 38 tests, all passing, no network, about 120 ms.**

## Step 6 — Fetch the three real threads

```bash
npm run fetch-thread -w @dejaview/ingest -- "https://discuss.python.org/t/pep-698-a-typing-override-decorator/20839" --slug pep-698 --pep 698
npm run fetch-thread -w @dejaview/ingest -- "https://discuss.python.org/t/pep-701-syntactic-formalization-of-f-strings/22046" --slug pep-701 --pep 701
npm run fetch-thread -w @dejaview/ingest -- "https://discuss.python.org/t/pep-695-type-parameter-syntax/21646" --slug pep-695 --pep 695
```

What landed in `fixtures/threads/`:

| File | Posts | Size | PEP section in the real PEP (for the eval) |
|---|---|---|---|
| `pep-698.json` | 11 | 14 KB | "Rejected Alternatives" |
| `pep-701.json` | 114 | 189 KB | "Rejected Ideas" |
| `pep-695.json` | 140 | 227 KB | "Rejected Ideas" |

I picked these three because I checked the real PEP files: all three have a ground-truth section, so
Abhijeet's scorecard has something to compare against. (PEP 604 has **no** such section, so I left it out.)

Then I checked the files are sound: no duplicate post ids, every post has a permalink, every body is
HTML, the likes came through, and the posts are in order.

**These three files are the thing Abhijeet and Ansh were waiting for.**

## Step 7 — Verify everything together

```bash
npm run typecheck   # green
npm test            # 13 (old) + 38 (new) = 51 tests, all passing
```

## The traps I hit, and what they teach

1. **A silent empty answer.** Asking the forum for the wrong kind of id returns `posts: []` and no error.
   Now I always pass the ids from `post_stream.stream`, and a test proves it.
2. **A field that is not there.** There is no `like_count`. Likes are in `actions_summary`. Reading the
   design doc carefully would not have found this — only a real call did.
3. **A field that can be `null`.** A GitHub PR description can be missing entirely. I read every body
   through `?? ""`.
4. **Two different ids for the same post.** Discourse has a *global* post id (`73686`) and a *post number*
   (`3`). The API wants the first one; humans and our contract use the second one.
5. **A name clash.** I had two types called `GithubPullFile` — one for the API answer, one for mine. The
   type checker caught it. I renamed the API one to `GithubPullFileResponse`.
6. **Post numbers are only unique inside one thread.** `design.md` §5.1 allows several sources under one
   topic, so the same post number can appear twice across sources. **The database layer (task 3) must
   remap** `ThreadPost.id` to the real `posts.id` and rewrite `Evidence.postId` when it saves. I wrote
   this down here so it does not get forgotten.

## How to run it yourself

```bash
npm install
npm run typecheck
npm test

# fetch a thread
npm run fetch-thread -w @dejaview/ingest -- "https://discuss.python.org/t/pep-701-syntactic-formalization-of-f-strings/22046" --slug pep-701 --pep 701

# read a GitHub issue or PR
npm run fetch-thread -w @dejaview/ingest -- "https://github.com/python/cpython/issues/81061" --slug cpython-81061

# read a local file
npm run fetch-thread -w @dejaview/ingest -- ./some-discussion.md --slug my-topic
```

## What is next (the rest of my list, in order)

Tasks 2, 3, 4 and 5 are done — **Part 2** below explains exactly how the database, the worker and the
API were built. What is left:

- **Task 7 — deploy.** Postgres + API + worker + web somewhere with a public HTTPS address, so Ansh's
  GitHub Action can reach `POST /api/pr-check`.
- **Task 8 — contributor identity across platforms** (P2, only if there is time).

---

# Part 2: the database, the worker and the API

Everything above was the **front door**: getting discussions in. This part is the **backbone** —
the part of the system that remembers everything, runs the slow jobs in the background and serves
the results to the dashboard.

![The schema from design.md §7](mudit-schema.png)

## Step 8 — The database

### The schema file

`db/migrations/001_init.sql` is the whole schema, written straight from `design.md` §7. Eleven tables:

| Table | What it holds |
|---|---|
| `topics` | A PEP or any other decision area. One row per topic (`pep-701`). |
| `sources` | One thread, issue, PR or uploaded file. A topic can hold several. |
| `posts` | Every post of every source, with its cleaned text, signal score and triage label. |
| `decisions` | The decisions we found: title, status (accepted/rejected/withdrawn/open), confidence, and a search vector. |
| `reasons` | Why a decision was made. One decision can have several reasons. |
| `evidence` | The verbatim quote behind a reason, and whether we could verify it. |
| `code_anchors` | Which file and symbol a decision is about, plus where that file moved to. |
| `jobs` | The queue the worker reads from. |
| `llm_calls` | Every call we made to the model: the prompt, the answer, how long it took. |
| `decision_llm_calls` | Which calls led to which decision. |
| `eval_runs` | The scorecard: what the real PEP says against what we found. |
| `pr_checks` | The log of the PR bot's answers. |

Two things I added on top of `design.md` §7, and why:

- **`jobs.attempt` and `jobs.locked_until`.** The design says "claim with `SELECT … FOR UPDATE SKIP LOCKED`",
  but that alone leaves two holes. If the worker crashes after taking the job, the job stays "running"
  forever. And if the worker is only *slow* (our model calls take minutes), another worker would take the
  job away and both would finish. The extra columns close both holes — see Step 10.
- **`decision_llm_calls`.** The design wants `GET /api/decisions/:id/llm-calls` — "show me exactly what
  the model was shown". One model call can produce several decisions and one decision can come from several
  calls, so a plain foreign key would not do. A small join table does.

The CHECK constraints use exactly the values the shared contract allows. `posts.triage_label` can only be
one of the seven `TRIAGE_LABELS`, `decisions.status` only one of the four `DECISION_STATUSES`, and so on.
If the pipeline ever produces something else, the database refuses it instead of quietly storing rubbish.

### The migration runner

`db/migrate.ts` is about 70 lines:

1. It reads `DATABASE_URL` and refuses to run without it.
2. It makes sure a `schema_migrations` table exists.
3. It reads every `.sql` file in `db/migrations/`, sorted by name.
4. For each file it has not applied yet: it opens a transaction, runs the file, records the name,
   commits. If anything fails it rolls back and stops.
5. Running it twice does nothing the second time — it prints `skip 001_init.sql (already applied)`.

```bash
npm run migrate
```

The CI already called `npm run migrate --if-present` before `npm test`; until now there was no
`migrate` script, so that call did nothing. Now there is one.

### The local database

- `docker-compose.yml` — a Postgres 16 container with a volume, a health check and throwaway local
  credentials (not secrets).
- `.env.example` — every variable the project reads, with the secrets left empty. The real `.env` is
  git-ignored.

## Step 9 — The data layer (`db/src/`)

One folder per job, so each file is small and has one reason to change.

| File | What it does |
|---|---|
| `client.ts` | Opens the pool. Also `withTransaction()`, which begins, commits, and rolls back if anything throws. |
| `topics.ts` | Topics, sources and posts. Also `loadThread()` and `loadAnnotations()`. |
| `decisions.ts` | Decisions, reasons, evidence, anchors. Also the full-text search and the decision card. |
| `jobs.ts` | The queue: enqueue, claim, heartbeat, progress, complete, fail. |
| `llmCalls.ts` | The model-call audit trail, and the `LlmCallStore` the pipeline asked for. |
| `evalRuns.ts` | The scorecard rows. |
| `prChecks.ts` | The PR bot log. |
| `timeline.ts` | The thread timeline the dashboard shows. |
| `testing.ts` | The test database helper (explained in Step 12). |

**Every query uses parameters.** It looks like this:

```ts
await pool.query("SELECT * FROM jobs WHERE id = $1", [id]);
```

Never this:

```ts
await pool.query(`SELECT * FROM jobs WHERE id = ${id}`);   // never
```

The second one is how SQL injection happens. It is also slower, because Postgres cannot reuse a
prepared plan.

### The search vector

`design.md` §5.7 wants the "already rejected?" detector to find a rejected decision from the text of a
new pull request. Postgres can do that with a **search vector**: a column that holds the words of the
title, the summary and every reason, already sorted and indexed.

```sql
search  TSVECTOR
CREATE INDEX decisions_search_idx ON decisions USING GIN (search);
```

When we save a decision we fill it in:

```sql
UPDATE decisions SET search = to_tsvector('english', $2) WHERE id = $1
```

with the title, the summary and all the reasons joined together. Then the search is one line:

```sql
WHERE d.search @@ plainto_tsquery('english', $1)
```

No embedding model, no vector database, and it is fast because GIN indexes are made for exactly this.

### The post-id remapping (trap 6 from Part 1)

This is the thing I wrote down earlier so it would not get lost. The pipeline talks about
`ThreadPost.id` — the post number inside a thread. The database gives every post its own serial id.
Two posts in two different threads can both be "post 1".

So the `posts` table has **two** id columns:

| Column | What it is |
|---|---|
| `id` | The database id. The foreign key everything points at. |
| `external_id` | The id on the platform (Discourse post number, GitHub comment id). For traceability. |
| `thread_post_id` | The id the post has inside its thread. This is what the pipeline quotes. |

When the worker saves a thread it builds a map from `thread_post_id` to the database id and hands that
map to everything that follows, so the evidence a decision cites ends up pointing at the right row.
The `evidence` table keeps the same pair, so an extraction can be read back out of the database
unchanged — which is what the eval step needs.

## Step 10 — The worker (`apps/worker/`)

The worker is a loop: take a job, do it, take the next one.

### Taking a job safely

The design says to claim jobs with `SELECT … FOR UPDATE SKIP LOCKED`. The safe way to do that is **one
statement** that both picks the job and marks it:

```sql
UPDATE jobs
   SET status = 'running',
       attempt = attempt + 1,
       started_at = now(),
       locked_until = now() + make_interval(secs => $1::double precision)
 WHERE id = (SELECT id FROM jobs
              WHERE status = 'queued'
                 OR (status = 'running' AND locked_until < now())
              ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
RETURNING *;
```

Three things to understand about it:

- **`FOR UPDATE SKIP LOCKED` inside the subquery.** The row is locked while the statement runs. If
  another worker runs the same statement at the same time, it skips the locked row and takes the next
  one. Nobody waits, nobody takes the same job.
- **The transaction closes before the slow work.** The model call takes minutes. Holding a database
  transaction open for minutes would keep a connection and a row lock busy the whole time. So the job
  is claimed, the statement commits, and only then does the work start.
- **`attempt` is a fencing token.** If a worker is too slow and another worker takes over, the old
  worker still tries to write its result. Every write says "only do this if you are still attempt N",
  so the old worker's write changes **0 rows** and the newer result wins.

### The lease

`locked_until` is a deadline. While a worker is alive it pushes the deadline forward every 60 seconds
(the heartbeat). If the worker dies, the deadline passes and the job becomes claimable again. Without
it, one crash would strand a job forever.

### One worker at a time

The worker takes a Postgres advisory lock when it starts. A second copy finds the lock taken and stops
with a clear message. We only need one worker — the model on the laptop is the bottleneck, not the
queue.

### The chain

```
ingest  ->  fetch the discussion, store it, queue the next step
extract ->  ask the pipeline for the decisions, store them, queue the next step
link    ->  ask the linker which files the decisions are about, store the anchors
eval    ->  compare our decisions with the real PEP, store the scorecard
```

Each job does one step and queues the next. That is why the dashboard can show "fetching → cleaning →
triaging → extracting → done" instead of a spinner that says nothing.

### Calling Abhijeet and Ansh without blocking them

The pipeline is `@dejaview/pipeline` and the linker is `@dejaview/linker`. Neither package existed when
I wrote this. So the worker loads them when it starts, and if they are not there it says so:

```
packages/pipeline is not published yet - extract jobs will fail.
```

and the job fails with a message that names the person:

```
packages/pipeline is not available yet - ask Abhijeet for the extract job
```

When Abhijeet publishes his package, **nothing in my code changes** — the worker picks it up. The
contract I expect is exactly the one in his doc:

```ts
runExtraction(thread, { llmStore, onProgress }) -> Promise<ExtractionResult>
evaluatePep(pepNumber, result, { llmStore })    -> Promise<EvalResult>
```

and for Ansh:

```ts
linkDecision(decision, posts, ctx) -> Promise<CodeAnchor[]>
```

## Step 11 — The API (`apps/api/`)

Express 5, one file per group of routes, and every response is exactly the shape promised in
`packages/shared/src/api.ts`. Nitesh builds the dashboard against those shapes, so they are the law.

| Route | What it does |
|---|---|
| `POST /api/ingest` | Queues an ingest job. Takes a URL or an uploaded file. |
| `GET /api/jobs/:id` | The progress of a job, so the dashboard can show it. |
| `GET /api/topics` | Every topic with its counters and last score. |
| `GET /api/topics/:slug` | One topic: its sources and its decisions. |
| `GET /api/topics/:slug/timeline` | Every post, its triage label, its signal score, and which decisions quote it. |
| `GET /api/decisions` | Search with the filters `?q=&status=&topic=&verified=`. |
| `GET /api/decisions/:id` | The decision card: reasons, evidence, code, people. |
| `GET /api/decisions/:id/llm-calls` | The model calls behind that decision. |
| `POST /api/eval/:slug` · `GET /api/eval` | Run and list the scorecards. |
| `POST /api/pr-check` | The PR bot's endpoint. Needs the bearer token. |
| `GET /api/pr-checks` | The log of what the bot answered. |
| `GET /api/health` | Is the database up, and can we reach the model? |

### The bearer token

`POST /api/pr-check` is the one route that anyone on the internet could call, so it needs the token:

```ts
if (header !== `Bearer ${expected}`) {
  res.status(401).json({ error: "Missing or wrong Authorization header" });
  return;
}
```

`DEJAVIEW_API_TOKEN` comes from the environment. It is never in the repo. If the variable is not set at
all, the route stays open — which is fine for a local demo and dangerous in production, so the
deployment must set it.

### The PR matcher

Ansh owns `packages/linker` and the matching and the comment text belong to him. So the API does not
implement them: it asks for them through a small interface (`PrMatcher`), and the server loads
`@dejaview/linker` when it exists.

Until Ansh's package is there, the API falls back to `apps/api/src/simpleMatcher.ts`, which does the
obvious thing: a decision matches when the pull request touches a file the decision is linked to, or
mentions a symbol the decision is linked to. **When Ansh publishes `@dejaview/linker` with
`matchPr` and `renderPrComment`, the real one is used instead and the fallback is ignored — no
change needed in my code.** The fallback only exists so the demo works tonight.

### The health check

`GET /api/health` does not just ask "is Postgres up". It asks "**are our tables there**":

```sql
SELECT to_regclass('public.jobs') IS NOT NULL AS ready
```

because a Postgres with no tables answers `SELECT 1` perfectly happily. The dashboard needs to know
the difference between "the database is down" and "you forgot to run the migrations".

![The real test output](mudit-tests.png)

## Step 12 — Testing against a real database

No mock database. The tests run against a real Postgres, because most of the bugs in this kind of code
live in the SQL, and a mock SQL does not have any.

### The problem I hit

I wrote the three database test files (`db`, `api`, `worker`) and they passed one after another. Then I
ran the whole suite — and 6 tests failed. **Vitest runs the test files in parallel**, and every file
started by deleting all the rows. So the three files were deleting each other's data while they ran.

### The fix

Each test file now gets **its own Postgres schema**. A schema is a namespace inside the database: two
schemas can hold two sets of tables with the same names, side by side.

`db/src/testing.ts` does it:

1. Creates the schema (`CREATE SCHEMA dejaview_test_api`).
2. Opens a pool whose connection string carries `options=-c search_path=dejaview_test_api`, so every
   query in that pool lands in that schema.
3. Runs the migration files inside it, so the tables are there.
4. `drop()` removes the schema again when the file is done.

Now the three files cannot touch each other, and the suite runs in parallel.

**Result: 89 tests, all passing, in about 300 ms.**

![The API answering with the rows it really returned](mudit-api-run.png)

## Step 13 — Proving it works for real

Tests are good, but I wanted to see the whole thing running. So I started it for real:

```bash
export DATABASE_URL=postgres://dejaview:dejaview@localhost:5432/dejaview_dev
npm run migrate
npm run start -w @dejaview/api      # http://localhost:3001
npm run start -w @dejaview/worker
```

Then I asked the API to ingest PEP 698, exactly like the dashboard would:

```bash
curl -X POST http://localhost:3001/api/ingest \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://discuss.python.org/t/pep-698-a-typing-override-decorator/20839",
       "topicSlug":"pep-698","pepNumber":698}'
```

The answer was `{"jobId":1,"topicSlug":"pep-698"}`, and the worker log said:

```
job 1 (ingest) picked up
job 1 (ingest) done
job 2 (extract) picked up
job 2 (extract) failed: packages/pipeline is not available yet - ask Abhijeet for the extract job
```

That last line is **correct**: the ingest worked (it fetched the thread and stored it), and the
extraction cannot work until Abhijeet's package exists. The job failed with a clear message instead of
crashing the worker.

Then I checked what the API serves:

```bash
curl http://localhost:3001/api/topics
curl http://localhost:3001/api/topics/pep-698
curl http://localhost:3001/api/topics/pep-698/timeline
```

- The topic showed up with its title, its PEP number, 1 source and 0 decisions.
- The timeline had all **11 posts**, each with the right author and the right permalink
  (`.../20839/1` … `.../20839/11`), across 8 different authors.
- The source was the forum thread we asked for.

So: the API accepts a URL, the worker fetches the thread, the database stores it, and the API serves it
back. The only missing piece is the model, which is Abhijeet's part.

## Two more traps from this part

7. **A database with tables but no schema.** The `dejaview` database on this laptop already had tables
   from an earlier prototype of ours, with a **different** shape (it had `discussions`, `messages`,
   `alternatives` — no `topics`, no `sources`, no `jobs`). I did not touch it: I left it alone and
   created a fresh `dejaview_dev` database for this work. `design.md` §7 is the source of truth for
   the schema, so the new schema is what the code expects.
8. **The worker shouting stack traces.** When the tables did not exist, the worker printed a full
   Postgres error every two seconds. Now it recognises that error and says one clear line —
   "The database has no tables yet. Run `npm run migrate`" — and stops.

## What the rest of the team needs from me

- **Abhijeet:** publish `@dejaview/pipeline` with `runExtraction(thread, { llmStore, onProgress })`
  and `evaluatePep(pepNumber, result, { llmStore })`. The `llmStore` is `LlmCallStore` from the shared
  contract; the database implementation is ready in `db/src/llmCalls.ts` and the worker hands it over.
  The three threads in `fixtures/threads/` are the inputs to try it on.
- **Ansh:** publish `@dejaview/linker` with `linkDecision(decision, posts, ctx)`. The API already looks
  for `matchPr` and `renderPrComment` and uses them the moment they exist.
- **Nitesh:** the API is running with every route in `packages/shared/src/api.ts`. Start it with
  `npm run start -w @dejaview/api` and point the dashboard at `http://localhost:3001`.

## How to run the whole thing

```bash
npm install
npm run typecheck
npm test                              # 89 tests, no network, no model needed

# 1. the database
docker compose up -d                 # or use the Postgres you already have
cp .env.example .env                 # and fill in DATABASE_URL
npm run migrate

# 2. the API and the worker, in two terminals
npm run start -w @dejaview/api
npm run start -w @dejaview/worker

# 3. feed it a discussion
curl -X POST http://localhost:3001/api/ingest \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://discuss.python.org/t/pep-698-a-typing-override-decorator/20839","topicSlug":"pep-698","pepNumber":698}'

# 4. watch it work
curl http://localhost:3001/api/jobs/1
curl http://localhost:3001/api/topics
```

## The four pictures in the pull request

They are generated, not drawn by hand, so they cannot drift away from what the code really does:

```bash
npm run start -w @dejaview/api      # the API has to be running
npm run render-pr-images -w @dejaview/api
```

| File | What it shows | Where the content comes from |
|---|---|---|
| `mudit-flow.png` | The flow of the data side, top to bottom | Drawn from the real folders and contracts |
| `mudit-api-run.png` | The API answering, with the rows it returned | `GET /api/topics` and `GET /api/topics/pep-698/timeline` on the running server |
| `mudit-tests.png` | The test run and the list of test files | `npm test` and `vitest list --filesOnly`, run by the script |
| `mudit-schema.png` | The tables in the database | `psql \\dt` against the real database |

**One lesson worth keeping:** GitHub shows a picture in a column about 890 pixels wide. The first version of
these was 2720 pixels wide, so GitHub shrank it to a third and the 12.5 pixel text came out at **4 pixels**
on screen — unreadable. Every picture is now rendered 820 pixels wide, at one device pixel per CSS pixel,
with the text sized for that width. The words are about 17 pixels tall when somebody reads the pull request.

The script also hides one thing on purpose: the machine's own path is cut out of the terminal pictures.

## What is still left in my list

- **Task 7 — deploy.** Postgres + API + worker + web somewhere with a public HTTPS address, so Ansh's
  GitHub Action can reach `POST /api/pr-check`. The environment variables are already listed in
  `.env.example`.
- **Task 8 — contributor identity across platforms** (P2, only if there is time).

