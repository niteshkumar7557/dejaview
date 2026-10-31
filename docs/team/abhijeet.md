# Abhijeet: LLM pipeline and self-evaluation

You own the **brain**: turning a long discussion into verified decision records with the two Qwen models,
and measuring how well we recover a PEP's Rejected Ideas. This is the part the organizers test directly.

Read first: `docs/team/README.md`, `design.md` §1 (what is tested), §5.2 (the funnel), §5.3 (verified
evidence), §5.6 (scorecard), §6 (models). Contract: `packages/shared/src/domain.ts` (`Thread` in;
`ExtractionResult`, `EvalResult`, `LlmCallStore` out).

## You own

`packages/pipeline/` · `fixtures/llm/` · `examples/pep-*/`. Don't edit other people's folders; ask them.

## Who depends on you

- **Mudit's worker** calls `runExtraction()` and `evaluatePep()` and stores the results.
- **Ansh's linker** reads your `ExtractedDecision` (evidence post ids tell him where to look for code references).
- **Nitesh** uses your real outputs in `examples/` as mock data for the UI.

You depend on Mudit's `fixtures/threads/*.json`. Until it lands, you can work on the LLM client and the
quote verifier.

## Public API of `@dejaview/pipeline`

```ts
runExtraction(thread: Thread, deps: {
  llmStore: LlmCallStore;          // Mudit passes a Postgres one; tests pass an in-memory one
  onProgress?: ProgressReporter;
}): Promise<ExtractionResult>

evaluatePep(pepNumber: number, result: ExtractionResult, deps: { llmStore: LlmCallStore }): Promise<EvalResult>
```

## Tasks (in order)

- [x] **1. LLM client.** Ollama `POST {LLM_BASE_URL}/api/chat` with `Authorization: Bearer $LLM_API_TOKEN`,
  `format: <JSON schema>`, `think: false`, `options: { temperature: 0, num_ctx: 8192 }`, `stream: false`.
  Validate every response with zod; 2 retries with backoff; timeout. `promptHash = sha256(model + schema + prompt)`.
  Modes via `LLM_MODE`: `live` (call + save to `LlmCallStore`), `record` (also write
  `fixtures/llm/<hash>.json`), `replay` (read fixtures only, fail loudly if missing; **CI uses this**).
  Models from env: `TRIAGE_MODEL=qwen3.5:4b`, `EXTRACT_MODEL=qwen3.5:9b`.
- [x] **2. Stage 1: clean + signal score** (no LLM). Strip Discourse `<aside class="quote">` blocks and
  GitHub `> ` lines, HTML → text, drop "+1"/thanks/emoji-only/duplicate posts, score decision phrases,
  author role (first post's author = PEP author; small hard-coded Steering Council / core dev list), likes,
  replies, position. Many unit tests.
- [x] **3. Stage 4: quote verifier** (no LLM, can start before fixtures). Normalize, exact substring → 1.0,
  else sliding-window token similarity; ≥ 0.85 verified; else search other posts in the chunk and re-attach;
  else unverified. Tests: exact, fuzzy, wrong post, invented quote.
- [x] **4. Stage 2: triage with `qwen3.5:4b`.** Label each kept post with a `TriageLabel` (batch short posts).
- [x] **5. Stage 3: extract with `qwen3.5:9b`.** Chunk relevant posts to ≤ ~5k tokens with 2-post overlap;
  JSON schema from `design.md` §5.2; every reason needs a verbatim quote ≤ 40 words.
- [x] **6. Stage 5: consolidate with `qwen3.5:9b`.** Merge duplicate ideas across chunks, union evidence,
  latest decision-labeled evidence wins the status. Give each decision a `key` ("d1", "d2", …).
- [x] **7. CLI + first real run.** (PEP 698 done; PEP 701 and 695 long runs in progress) `npm run extract -w @dejaview/pipeline -- fixtures/threads/pep-698.json
  --out examples/pep-698/output/decisions.json` (copy the input to `examples/pep-698/input/thread.json`).
  **Start the long runs on the other PEPs as early as possible (by 2 AM)**; the laptop is slow.
- [x] **8. Eval** (`design.md` §5.6). Only after extraction: fetch `peps/pep-NNNN.rst` from the `python/peps`
  repo, parse "Rejected Ideas" / "Rejected Alternatives" / "Alternatives" subsections into
  `GroundTruthItem[]`, shortlist candidates by word overlap, judge with `qwen3.5:9b`, compute recall,
  reason agreement and extra ideas. CLI writes `examples/pep-NNN/output/eval.json`.
- [x] **9. Replay integration test.** Record one full run with `LLM_MODE=record`, commit the fixtures, and add
  a test that replays it and checks decisions/statuses/verified counts.

## Rules that matter for scoring

- **Both models must really be used** (4B triage, 9B extract/consolidate/eval). Naming an unused model costs
  points. If 9B is too slow, `EXTRACT_MODEL=qwen3.5:4b` is allowed but both names stay in use.
- **Extraction never reads the PEP.** Only `evaluatePep` fetches it, after extraction.
- `examples/` outputs must be real runs, never hand-written.

## Definition of done

`runExtraction` produces verified decisions for the dev PEPs; eval numbers in `examples/`; unit tests for
cleaner, scorer, verifier, PEP parser, chunker; replay integration test green in CI.

## In the pitch / Q&A you explain

The funnel and why (speed on a 4 GB GPU), why two model sizes, how quotes are verified (our answer to
hallucination), how accepted vs rejected is decided, the eval method and its numbers.

## Handover (1 Nov, ~01:10 IST)

Abhijeet ran out of agent time, so Nitesh's agent (Claude Code) took over this part with the team's OK
and built the whole pipeline on branch `nitesh/pipeline`: every stage in `packages/pipeline/src/`, the
evaluation in `src/eval/`, the `extract` CLI, unit tests, and a replay test on the real PEP 698 thread with
recorded fixtures in `fixtures/llm/`. How it works, file by file: `docs/PLATFORM.md` sections 5.2, 5.6, 7.
