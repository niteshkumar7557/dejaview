# CLAUDE.md

Guidance for AI coding sessions in this repo. **`design.md` is the source of truth** for the product design,
features, architecture, data model, and every hackathon rule (Appendix A = official problem statement,
Appendix B = rules). Read the relevant section of `design.md` before starting a task.

## Project

**DejaView** ("You've had this debate before") — team **Sipmap** (Mudit Agrawal, Nitesh Kumar,
Abhijeet Raj Singh, Ansh Gupta) — Hacktoberfest Hack Day Sonipat, **Problem 06: Open Source Decision
Intelligence and Knowledge Recovery**.

It reads public discussions (discuss.python.org PEP threads, CPython issues/PRs), extracts decisions,
rejected alternatives and their reasons with verified verbatim quotes, links them to CPython code, and
comments on new PRs that touch that code. Evaluation: given a PEP's discussion **without the PEP**, recover
its "Rejected Ideas" and the reasons.

**Hard deadline: final push by 6:30 AM, 1 Nov 2026 (IST).** Commits after that don't count and may cost marks.

## Non-negotiable rules (they affect scoring)

1. **Never push to `main`.** Every change: new branch → PR → CI green → merge.
2. **Every commit message ends with these lines** (plus any attribution trailer):
   ```
   Coding agent: Claude Code
   Models used in project: Qwen3.5 9B, Qwen3.5 4B
   ```
   Use the coding agent that actually helped (team also uses MiniMax M3).
3. **Every PR description** names the coding agent and the models used in the project (fill the PR template).
4. **Models in the product: only `qwen3.5:9b` and `qwen3.5:4b`** via Ollama. Both must really be used by the
   code (9B: extract/consolidate/eval-judge; 4B: triage). Naming a model the code doesn't use = 0 points for
   AI use and −5 overall. Never add a closed API (OpenAI, Claude, Gemini, …) to the product. If a model
   changes, update `HACKATHON.md`, `design.md` §6 and this file in the same PR.
5. **No secrets in the repo.** `LLM_API_TOKEN`, `GITHUB_TOKEN`, `DEJAVIEW_API_TOKEN` go in `.env` (git-ignored)
   or GitHub/deployment secrets. Keep `.env.example` with empty values.
6. **No stubs.** Graders check that features are really built. Every feature ships with real tests.
7. **CI must pass on every PR and on the last commit.** CI never calls the LLM: tests run with
   `LLM_MODE=replay` against recorded fixtures.
8. **`examples/`** holds real inputs and the real outputs the tool produced — never hand-written outputs.
9. **Extraction must never read the PEP text.** Only the eval module fetches the PEP, after extraction.
10. Any team member must be able to explain any code: keep modules small and single-purpose, name things
    plainly, comment the *why*.

## Stack and conventions

- **TypeScript everywhere.** Frontend: Next.js (App Router). Backend: Express. DB: Postgres with **raw SQL
  via `pg` — no ORM.** Schema lives in plain `.sql` migrations under `db/migrations`.
- Planned layout (npm workspaces): `apps/web`, `apps/api`, `apps/worker`, `packages/core` (pure logic +
  most unit tests), `action/` (GitHub Action), `db/migrations`, `examples/`, `fixtures/llm/`.
- Tests: Vitest; API tests with supertest against a Postgres service container in CI.
- Job queue: a Postgres `jobs` table claimed with `SELECT … FOR UPDATE SKIP LOCKED` (no Redis).
- Search: Postgres full-text search (`tsvector`); no embedding model.

## LLM

- Ollama on a team laptop (4 GB VRAM, 16 GB RAM — slow), at `https://llm.kumarnitesh.in`, with
  `Authorization: Bearer $LLM_API_TOKEN`.
- Env: `LLM_BASE_URL`, `LLM_API_TOKEN`, `TRIAGE_MODEL=qwen3.5:4b`, `EXTRACT_MODEL=qwen3.5:9b`,
  `LLM_MODE=live|record|replay`.
- Call `/api/chat` with `format: <JSON schema>`, `think: false`, `temperature: 0`, `num_ctx: 8192`.
- Never send a whole thread to the model; follow the funnel in `design.md` §5.2
  (clean → 4B triage → 9B extract → verify quotes → 9B consolidate).

## Commands

No code is scaffolded yet. When it is, list the install / dev / test / migrate commands here.
