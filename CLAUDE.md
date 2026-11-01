# CLAUDE.md

Guidance for AI coding sessions in this repo. **`design.md` is the source of truth** for the product design,
features, architecture, data model, and every hackathon rule (Appendix A = official problem statement,
Appendix B = rules). Read the relevant section of `design.md` before starting a task.

## Start of every session: ask who you are working with (mandatory)

The project is split between four teammates (`docs/team/README.md`). Before doing anything else:

1. **Ask: "Which teammate are you: Mudit, Nitesh, Abhijeet or Ansh?"** Do not read code, plan or edit until
   you have an answer. Skip the question only if the user already said their name in this session. If the
   answer is not one of the four, ask again.
2. **Read `docs/team/README.md`**, then the `design.md` sections for that person's part.
3. **Work only on that person's part.** Create or modify files **only inside the folders that doc says they
   own**. Reading any file is fine.
4. **If a task needs a change outside their folders** (someone else's folder, `packages/shared`, root config,
   `.github/`, `design.md`, `CLAUDE.md`, `HACKATHON.md`): don't make it. Say which file and which owner, and
   draft a short message the user can send to that teammate. Change `packages/shared` or root files only if the
   user explicitly says the team agreed to it.
5. **Branch:** if on `main`, create a branch `<name>/<topic>` before editing (e.g. `abhijeet/quote-verifier`).
   Then follow the commit and PR rule below.

## Project

**DejaView** ("You've had this debate before") — team **Sipmap** (Mudit Agrawal, Nitesh Kumar,
Abhijeet Raj Singh, Ansh Gupta) — Hacktoberfest Hack Day Sonipat, **Problem 06: Open Source Decision
Intelligence and Knowledge Recovery**.

It reads public discussions (discuss.python.org PEP threads, CPython issues/PRs), extracts decisions,
rejected alternatives and their reasons with verified verbatim quotes, links them to CPython code, and
comments on new PRs that touch that code. Evaluation: given a PEP's discussion **without the PEP**, recover
its "Rejected Ideas" and the reasons.

**Hard deadline: final push by 6:30 AM, 1 Nov 2026 (IST).** Commits after that don't count and may cost marks.

## Commits and PRs: the agent does them, humans merge (team rule)

The AI agent **commits, pushes its branch and opens the PR** itself; the teammate reviews and merges. The
agent **never merges** a PR and **never pushes to `main`**.

1. Work on a branch `<name>/<topic>` (create it from an up-to-date `main`).
2. Before committing, run `npm run typecheck` and `npm test` and report the real result.
3. Commit with this message shape. **Do not add a `Co-Authored-By` trailer or any other AI attribution
   line**; the `Coding agent:` line is the disclosure:
   ```
   <imperative summary, at most 72 chars>

   <what changed and why, wrapped at ~72 chars>

   Coding agent: <the agent that did the work>
   Models used in project: Qwen3.5 9B, Qwen3.5 4B
   ```
4. Push (`git push -u origin <branch>`) and open the PR with the GitHub CLI
   (`gh pr create --base main --title "..." --body-file <file>`), filling `.github/pull_request_template.md`
   including the `Coding agent:` and `Models used in project:` lines. No AI attribution footer in the PR body.
5. Give the teammate the PR link, then stop until they merge. They merge with **Rebase and merge**.

GitHub CLI setup (once per machine): `brew install gh`, then `gh auth login` (interactive; the user runs it,
for example by typing `! gh auth login` in Claude Code).

## Non-negotiable rules (they affect scoring)

1. **Nothing goes to `main` directly.** Every change: new branch → PR (opened by the agent) → CI green → merge (done by the teammate, Rebase and merge).
2. **Every commit message ends with these lines** (CI fails the PR otherwise):
   ```
   Coding agent: Claude Code
   Models used in project: Qwen3.5 9B, Qwen3.5 4B
   ```
   Use the coding agent that actually helped (the team uses Claude Code and MiniMax M3).
3. **Every PR description** names the coding agent and the models used in the project (fill the PR template;
   the `Conventions` workflow fails the PR otherwise).
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
- Layout (npm workspaces, owner in brackets): `packages/shared` (contract types, shared) · `packages/ingest`,
  `apps/api`, `apps/worker`, `db/` [Mudit] · `packages/pipeline`, `fixtures/llm/` [Abhijeet] ·
  `packages/linker`, `apps/action` [Ansh] · `apps/web` [Nitesh]. Full ownership table: `docs/team/README.md`.
- Workspaces are named `@dejaview/<folder>`, have a `tsconfig.json` extending `../../tsconfig.base.json` and a
  `typecheck` script. Pipeline and linker are pure libraries (no DB, no HTTP server); only Mudit's code
  touches Postgres; only the pipeline calls the LLM.
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

| Command | What it does |
|---|---|
| `npm install` | Install dependencies (Node ≥ 22; CI uses Node 24) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, all tests (CI runs this with `LLM_MODE=replay`) |
| `BASE_SHA=origin/main npm run check:conventions` | Check that every commit on the branch has the `Coding agent:` / `Models used in project:` lines (add `PR_BODY="..."` to check a PR description too) |

## CI

- `.github/workflows/ci.yml` — on every PR and push to `main`: `npm ci` → typecheck → `npm run migrate`
  (once it exists) against a Postgres 16 service (`DATABASE_URL` is set) → `npm test`. No secrets.
- `.github/workflows/conventions.yml` — on every PR (also when its description is edited): runs
  `scripts/check-conventions.ts` over the PR's commits and description.
- When adding a workspace (`apps/*`, `packages/*`), make sure root `npm run typecheck` and `npm test` cover it.
