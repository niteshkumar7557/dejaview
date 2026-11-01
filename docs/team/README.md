# Team Sipmap: who builds what

DejaView is split into **four parts that can be built at the same time**. Each person owns their folders,
works on their own branches, and raises PRs as they go. The parts talk to each other only through the
**shared contract** in `packages/shared` (TypeScript types), so nobody waits on anybody's code.

| Person | Part | Owns (only they edit these) |
|---|---|---|
| **Mudit** | Data, API and worker | `db/`, `apps/api/`, `apps/worker/`, `packages/ingest/`, `fixtures/threads/`, `docker-compose.yml`, `.env.example`, deployment |
| **Abhijeet** | LLM pipeline and self-evaluation | `packages/pipeline/`, `fixtures/llm/`, `examples/pep-*/` |
| **Ansh** | Code linking and PR bot | `packages/linker/`, `apps/action/`, `examples/pr-check/`, the demo CPython fork |
| **Nitesh** | Frontend and pitch | `apps/web/`, `examples/README.md`, pitch slides |

The table shows who built what originally. Since 1 Nov, around 3:40 AM, Nitesh has owned every part (see
`docs/PLATFORM.md` §13).

**Shared (change only with everyone's OK):** `packages/shared/`, root `package.json`, `package-lock.json`,
`tsconfig*.json`, `.github/`, `CLAUDE.md`, `design.md`, `HACKATHON.md`, `docs/team/README.md`.

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
5. **Every commit and PR names the coding agent and models** (CI checks it). The AI agent commits, pushes
   and opens the PR (no AI co-author line); you review and merge with **Rebase and merge** (see `CLAUDE.md`).
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
