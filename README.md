# DejaView

> **"You've had this debate before."** Recover the decisions nobody wrote down.

Open-source projects decide things in long public threads. The reasons get buried, so newcomers propose the
same rejected ideas again. DejaView reads those threads, extracts the decisions, the rejected alternatives and
the reasons behind them, backs every claim with a verified word-for-word quote, links decisions to the source
code, and comments on new pull requests that touch that code.

Built by team **Sipmap** (Mudit Agrawal, Nitesh Kumar, Abhijeet Raj Singh, Ansh Gupta) at Hacktoberfest Hack Day
Sonipat, for **Problem 06: Open Source Decision Intelligence and Knowledge Recovery**.

## How it works

```
discuss.python.org / GitHub / file upload
        │
        ▼
 ingest ──► clean ──► triage (Qwen3.5 4B) ──► extract (Qwen3.5 9B)
                                                     │
                                                     ▼
                       consolidate (Qwen3.5 9B) ◄── verify every quote in code
                                │
                                ▼
                  link to CPython code (symbol, path, commit; follows git renames)
                                │
              ┌─────────────────┼──────────────────┐
              ▼                 ▼                  ▼
          dashboard         PR comment        self-evaluation
```

- **Evidence you can check.** Code checks every quote against its post. An unverified quote is shown with a
  warning, never hidden. Every quote links to the exact post.
- **Open models only.** `qwen3.5:4b` sorts every post and `qwen3.5:9b` extracts, consolidates and judges the
  evaluation, both through Ollama on our own laptop. No closed APIs.
- **Honest evaluation.** Extraction never reads the PEP. Only the evaluation fetches it, afterwards, to compare
  our findings with its "Rejected Ideas" section.
- **Reproducible.** Every model answer is recorded in `fixtures/llm/`. CI never calls a model: it replays those
  answers and checks that the committed examples are reproduced exactly.

## Results

All from real runs, committed in [`examples/`](examples/README.md) with the command that produced each one.

| Input | Decisions | Quotes verified | Rejected ideas recovered (recall) |
|---|---|---|---|
| PEP 698 discussion (11 posts) | 3 | 5 of 5 | 1 of 4 (25%) |
| PEP 701 discussion (114 posts) | 16 | 58 of 58 | 2 of 3 (67%) |
| [python/cpython#101016](https://github.com/python/cpython/issues/101016) (13 posts) | 7 | 11 of 11 | not scored: no PEP |

Reading the numbers: the three ideas missed for PEP 698 are written up in the PEP but barely argued in that
short thread. Both PEP 701 matches point at one decision that consolidation merged from two ideas, so that
recall is flattered. In the `#101016` example, the PR bot catches a new PR that proposes the declined idea again
in other words.

## Quick start

Needs Node 22+ and Docker.

**See it work without a model or a database.** This replays the recorded model answers for PEP 698:

```sh
npm install
LLM_MODE=replay npm run extract -w @dejaview/pipeline -- fixtures/threads/pep-698.json
```

**Run the whole stack.** Use a separate terminal for each long-running process:

```sh
docker compose up -d                        # Postgres on :5432
cp .env.example .env                        # fill in what you need; never commit .env
set -a; . ./.env; set +a
npm run migrate
npm run start -w @dejaview/api              # API on :3001
npm run start -w @dejaview/worker           # job runner
npm run dev -w @dejaview/web                # dashboard on http://localhost:3100
```

For live data, create `apps/web/.env.local` with `NEXT_PUBLIC_USE_MOCKS=0` and
`NEXT_PUBLIC_API_URL=http://localhost:3001`. Without it the dashboard shows sample data. Processing a new thread
also needs `LLM_BASE_URL` and `LLM_API_TOKEN`, pointing at an Ollama server with both models.

**Check it:**

```sh
npm run typecheck
LLM_MODE=replay npm test
```

## Repo layout

| Path | What it is |
|---|---|
| `packages/shared` | The contract: TypeScript types shared by every part |
| `packages/ingest` | Fetches threads from discuss.python.org and GitHub |
| `packages/pipeline` | The model funnel, quote verification and the evaluation. The only code that calls a model |
| `packages/linker` | Links decisions to code, tracks renames, matches PRs and writes the PR comment |
| `db/` | Plain SQL migrations and repositories (raw `pg`, no ORM), and the job queue |
| `apps/api` | Express API |
| `apps/worker` | Runs the job chain and saves the results to Postgres |
| `apps/web` | Next.js dashboard, including the MADR export |
| `apps/action` | The GitHub Action that posts the PR comment |
| `examples/` | Real inputs and the real outputs they produced |
| `fixtures/` | Real ingested threads and recorded model answers |

## Current limits

- The PR bot has real example output, but the Action is not yet installed on a CPython fork, so it has not
  commented on a live GitHub PR.
- Consolidation sometimes merges two different ideas into one decision.
- A long thread takes about 20 minutes on our 4 GB laptop GPU, so threads are processed ahead of time and the
  dashboard serves the results from Postgres.

The full list is in [`docs/DEMO.md`](docs/DEMO.md) §3.

## Documentation

- [`docs/PLATFORM.md`](docs/PLATFORM.md): how the whole system works, file by file
- [`docs/DEMO.md`](docs/DEMO.md): how to run and present the demo, and known issues
- [`design.md`](design.md): the design and the hackathon rules
- [`HACKATHON.md`](HACKATHON.md): team, problem, models and why
- [`examples/README.md`](examples/README.md): what each example is and how it was produced
- [`docs/team/README.md`](docs/team/README.md): who built what, and how we worked

## License

[MIT](LICENSE)
