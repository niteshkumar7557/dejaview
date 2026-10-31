# Examples: real inputs and the real outputs DejaView produced

Everything in this folder was produced by running the project's own code on real data. Nothing here is
written by hand. Each section says what the input is, what came out, and the exact command that made it.

Models used for every run: **qwen3.5:4b** (triage) and **qwen3.5:9b** (extraction, consolidation and the
evaluation judge), running in Ollama on the team laptop (4 GB GPU, 16 GB RAM).

## `pep-698/`: recovering PEP 698's rejected ideas from its discussion

PEP 698 adds the `@typing.override` decorator. Its discussion on discuss.python.org has 11 posts.

**Result:** 4 decisions, 10 of 11 quotes verified word for word against their posts. Recall 25% (1 of the
PEP's 4 rejected alternatives), and for that one the reasons agree. The three it missed ("rely on IDEs",
"runtime enforcement", "mark a base class") are written up in the PEP but not argued in this 11-post
thread, so they can't be recovered from it. Run time on the team laptop: about 4 minutes.

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

## `pr-check/`: the PR bot's request and comment

| File | What it is |
|---|---|
| `input/pr.json` | A `PrCheckRequest`: the repo, PR number, title, description, changed files and changed symbols the GitHub Action sends |
| `output/response.json` | The API's answer to it |
| `output/comment.md` | The exact comment the bot posts on the pull request |

This example was saved before the database held extracted decisions, so it shows the "no related
decisions" comment. It will be replaced by a real demo PR's request and comment (see
`apps/action/README.md`).
