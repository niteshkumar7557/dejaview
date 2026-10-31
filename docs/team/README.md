# Team Sipmap: who builds what

DejaView is split into **four parts that can be built at the same time**. Each person owns their folders,
works on their own branches, and raises PRs as they go. The parts talk to each other only through the
**shared contract** in `packages/shared` (TypeScript types), so nobody waits on anybody's code.

| Person | Part | Owns (only they edit these) | Doc |
|---|---|---|---|
| **Mudit** | Data, API and worker | `db/`, `apps/api/`, `apps/worker/`, `packages/ingest/`, `fixtures/threads/`, `docker-compose.yml`, `.env.example`, deployment | [mudit.md](mudit.md) |
| **Abhijeet** | LLM pipeline and self-evaluation | `packages/pipeline/`, `fixtures/llm/`, `examples/pep-*/` | [abhijeet.md](abhijeet.md) |
| **Ansh** | Code linking and PR bot | `packages/linker/`, `apps/action/`, `examples/pr-check/`, the demo CPython fork | [ansh.md](ansh.md) |
| **Nitesh** | Frontend and pitch | `apps/web/`, `examples/README.md`, pitch slides | [nitesh.md](nitesh.md) |

**Shared (change only with everyone's OK):** `packages/shared/`, root `package.json`, `package-lock.json`,
`tsconfig*.json`, `.github/`, `CLAUDE.md`, `design.md`, `HACKATHON.md`, `docs/team/README.md`.
Each person may edit their **own** `docs/team/<name>.md` (tick off tasks as you go).

## How the parts fit

```
 discuss.python.org / GitHub
          │
          ▼
  [Mudit] packages/ingest ──► Thread (fixtures/threads/<slug>.json)
          │
          ▼
  [Abhijeet] packages/pipeline  runExtraction(thread) ──► ExtractionResult ──► evaluatePep() ──► EvalResult
          │                                                   │
          ▼                                                   ▼
  [Ansh] packages/linker  linkDecision(decision, posts) ──► CodeAnchor[]
          │
          ▼
  [Mudit] apps/worker  runs the jobs above in order and saves everything to Postgres (raw SQL)
  [Mudit] apps/api     serves it as JSON (contract: packages/shared/src/api.ts)
          │                                   ▲
          ▼                                   │ POST /api/pr-check
  [Nitesh] apps/web  dashboard        [Ansh] apps/action  GitHub Action on the CPython fork
                                             (API calls Ansh's matchPr() + renderPrComment())
```

- **Pipeline and linker are pure libraries:** no database, no HTTP server. They take contract types in and
  return contract types out, so they can be built and tested from fixture files alone.
- **Only Mudit's code touches Postgres.** Only Abhijeet's code calls the LLM.
- **Nitesh builds the UI against mock JSON** typed with the contract, then switches to the real API.

## Rules for working in parallel

1. **Branch per task:** `<name>/<topic>`, e.g. `mudit/discourse-ingest`, `nitesh/decision-card`. PR into `main`;
   merge when CI is green. Keep PRs small and merge often (every 1–2 hours) so nobody drifts.
2. **Stay in your folders.** If you need a change in someone else's folder, ask them (or open an issue). Don't
   edit it yourself.
3. **Contract changes (`packages/shared`)** must be **additive** where possible (new optional fields, new types).
   Post in the team chat before opening the PR, and every owner must look at it before it merges.
4. **Root files:** adding your workspace's script or a dependency through `npm install -w <your-workspace>` is fine.
   If `package-lock.json` conflicts, take `main`'s version and re-run `npm install`.
5. **Every commit and PR names the coding agent and models** (CI checks it). AI agents never commit: they
   hand you the commit message and PR description (see `CLAUDE.md`).
6. **No stubs, real tests.** Every PR adds tests for what it adds. CI never calls the LLM (`LLM_MODE=replay`).
7. **Each person can explain their own part in Q&A**, and should be able to explain the whole flow above.

## Workspace conventions

- Package names: `@dejaview/<folder>` (e.g. `@dejaview/pipeline`). Import the contract with
  `import type { Thread } from "@dejaview/shared"`.
- Each workspace has a `tsconfig.json` that extends `../../tsconfig.base.json`, and a `typecheck` script.
  Root `npm run typecheck` runs every workspace's typecheck; root `npm test` (Vitest) runs every `*.test.ts`.
- Secrets only in `.env` (git-ignored). Variables: `DATABASE_URL`, `LLM_BASE_URL`, `LLM_API_TOKEN`,
  `TRIAGE_MODEL`, `EXTRACT_MODEL`, `LLM_MODE`, `GITHUB_TOKEN`, `DEJAVIEW_API_TOKEN`, `CPYTHON_DIR`,
  `NEXT_PUBLIC_API_URL`.

## Integration checkpoints (tonight)

| Time | Everyone has… |
|---|---|
| **10:30 PM** | Mudit: at least one real thread in `fixtures/threads/` (unblocks Abhijeet and Ansh). Nitesh: web app runs on mocks. |
| **12:00 AM** | Each part's main function works on fixture files with tests. Mentors leave at midnight, so ask questions before then. |
| **2:00 AM** | **End to end on PEP #1:** worker runs pipeline + linker, API serves it, web shows real data. Long LLM runs started for the other PEPs. |
| **3:30 AM** | PR bot comments on the CPython fork. Eval scorecard visible in the web app. |
| **5:00 AM** | `examples/` filled with real outputs. All feature PRs merged. |
| **5:30 AM** | Feature freeze. Only fixes. |
| **6:15 AM** | Last merge. CI green on `main`. (Repo frozen at 6:30 AM.) |

Dev PEPs (confirm in the first hour that each has a discuss.python.org thread and a Rejected Ideas section):
PEP 698 (`typing.override`, small, use first), PEP 701 (f-strings), PEP 695 (type parameters). Swap in
the organizers' PEPs as soon as they give them.
