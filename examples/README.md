# Examples: real inputs and the real outputs DejaView produced

Everything in this folder was produced by running the project's own code on real data. Nothing here is
written by hand. Each section says what the input is, what came out, and the exact command that made it.

Models used for every run: **qwen3.5:4b** (triage) and **qwen3.5:9b** (extraction, consolidation and the
evaluation judge), running in Ollama on the team laptop (4 GB GPU, 16 GB RAM).

## `pep-698/`: recovering PEP 698's rejected ideas from its discussion

PEP 698 adds the `@typing.override` decorator. Its discussion on discuss.python.org has 11 posts.

**Result:** 3 decisions, 5 of 5 quotes verified word for word against their posts. Recall 25% (1 of the
PEP's 4 rejected alternatives). The other three ("rely on IDEs", "runtime enforcement", "mark a base
class") are written up in the PEP but barely argued in this 11-post thread. Run time on the team laptop:
about 2 minutes.

| File | What it is |
|---|---|
| `input/thread.json` | The discussion as ingested from discuss.python.org (`fixtures/threads/pep-698.json`). **The PEP itself is not in it**: extraction never sees the PEP |
| `output/decisions.json` | What DejaView extracted: every post's cleaned text, signal score and triage label, and the decisions with their status, reasons and quotes, each quote checked against its post (`verified`, `matchScore`) |
| `output/eval.json` | The self-evaluation: the PEP's "Rejected Alternatives" (downloaded only after extraction), which of them we recovered, whether our reasons agree, recall and extra ideas |

Command (from the repo root, with `LLM_BASE_URL` and `LLM_API_TOKEN` in `.env`):

```sh
LLM_MODE=record npm run extract -w @dejaview/pipeline -- fixtures/threads/pep-698.json --eval
```

`LLM_MODE=record` also saved every model answer to `fixtures/llm/`. The test
`packages/pipeline/tests/replay.test.ts` replays those answers and checks that the pipeline reproduces
`output/decisions.json` exactly, which proves this output came from this code.

## `pep-701/`: PEP 701 (f-strings in the grammar), a long discussion

114 posts on discuss.python.org (about 20,000 tokens after cleaning), so the 9B read it in 8 chunks.

**Result:** 16 decisions (9 accepted, 6 rejected, 1 open), **52 of 52 quotes verified**. 13 posts were
filtered before any model saw them. Recall 67%: 2 of the PEP's 3 rejected ideas were matched, reasons
partly agree. Honest note: both matches point at one merged decision (`d4`), whose reasons cover quote
reuse and the brace-escaping discussion; consolidation merged two ideas there. 5 more rejected ideas
were found in the discussion that the PEP does not list. Run time on the team laptop: about 21 minutes.

Same files and command as above, with `fixtures/threads/pep-701.json`. Both examples are reproduced
exactly from the recorded answers by `packages/pipeline/tests/replay.test.ts`.

## `pr-check/`: the PR bot's request and comment

| File | What it is |
|---|---|
| `input/pr.json` | A `PrCheckRequest`, the request the GitHub Action sends: a PR titled "Enforce @typing.override at runtime" that changes `Lib/typing.py` (symbol `override`) |
| `output/response.json` | The API's real answer, with PEP 698 in the database: the accepted `@typing.override` decision (matched because both are linked to `Lib/typing.py`) and two previously rejected ideas (matched by the words the PR shares with them), including runtime enforcement |
| `output/comment.md` | The exact comment the bot posts on the pull request, with links to each decision card |

Produced by running the stack locally (Postgres, API with `DASHBOARD_URL=http://localhost:3100`, worker),
ingesting PEP 698 through `POST /api/ingest`, then:

```sh
curl -s -X POST localhost:3001/api/pr-check -H 'content-type: application/json' --data @examples/pr-check/input/pr.json
```
