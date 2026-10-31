# Mudit: Data, API and worker

You own the **backbone**: getting discussions in, storing everything in Postgres with raw SQL, running the
slow pipeline jobs in the background, serving the API, and deploying. You are the only part that touches
the database.

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

- [ ] **1. Discourse ingest + fixtures (target 10:30 PM).** `packages/ingest` (`@dejaview/ingest`):
  - `fetchDiscourseThread(url): Promise<Thread>` using the public JSON API: `GET /t/{id}.json` gives the
    first posts and `post_stream.stream` (all post ids); fetch the rest with
    `GET /t/{id}/posts.json?post_ids[]=…` in batches of ~20. Use `cooked` HTML as `body` (`format: "html"`),
    the post number as `id`/`externalId`, `like_count` (from `actions_summary`) as `likes`,
    `reply_to_post_number` as `replyToId`, and build the permalink `https://discuss.python.org/t/{slug}/{id}/{post_number}`.
  - CLI: `npm run fetch-thread -w @dejaview/ingest -- <url> --slug pep-698 --pep 698` → writes
    `fixtures/threads/pep-698.json`.
  - Fetch the dev PEP threads (PEP 698 first) and **merge that PR quickly** so others can pull it.
  - Tests: parse a saved Discourse JSON response (no network in tests).
- [ ] **2. Database.** `db/migrations/*.sql` from `design.md` §7, a tiny migration runner (`db/migrate.ts`
  with `pg`, records applied files in a `schema_migrations` table), root script `"migrate"` (CI already calls
  `npm run migrate --if-present` with `DATABASE_URL` set to a Postgres 16 service). `docker-compose.yml` for
  local Postgres. Check constraints must match the contract enums (`DECISION_STATUSES`, `TRIAGE_LABELS`).
- [ ] **3. Data access.** Plain functions with parameterized SQL (`pool.query('… $1', [x])`, never string
  concatenation): save thread/posts, save `ExtractionResult` (decisions, reasons, evidence, post annotations),
  save `CodeAnchor[]`, save eval runs, PR checks. Keep the `decisions.search` tsvector updated (title + summary + reasons).
- [ ] **4. Worker** (`apps/worker`). Loop that claims jobs with `SELECT … FOR UPDATE SKIP LOCKED`, updates
  `stage`/`progress`, records errors. Job chain: `ingest` → `extract` (calls Abhijeet's
  `runExtraction(thread, deps)`) → `link` (calls Ansh's `linkDecision(...)`) → optional `eval` (calls
  `evaluatePep(...)`). Implement `LlmCallStore` on the `llm_calls` table and pass it to the pipeline.
- [ ] **5. API** (`apps/api`, Express). Every route in `packages/shared/src/api.ts`, returning exactly those
  types. CORS for the web app. `POST /api/pr-check` requires `Authorization: Bearer $DEJAVIEW_API_TOKEN`; it
  loads candidate decisions + anchors, calls Ansh's `matchPr()` and `renderPrComment()`, runs the
  "similar rejected" full-text query (`ts_rank` over `decisions.search`, status = rejected), stores a row in
  `pr_checks`. `GET /api/health` reports DB and LLM reachability.
  Tests: supertest against the CI Postgres (`DATABASE_URL`).
- [ ] **6. More ingest sources.** GitHub issue/PR (REST API; optional `GITHUB_TOKEN`; markdown bodies,
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
