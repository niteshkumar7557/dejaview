// Runs the pipeline on a saved thread and writes the real outputs to examples/.
//
//   npm run extract -w @dejaview/pipeline -- fixtures/threads/pep-698.json [--eval] [--eval-only]
//
// Writes examples/<slug>/input/thread.json, examples/<slug>/output/decisions.json and, with --eval,
// examples/<slug>/output/eval.json. Model answers are cached in data/llm-cache/ (git-ignored), so a
// re-run after a crash continues where it stopped. With LLM_MODE=record it also writes fixtures/llm/.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtractionResult, Thread } from "@dejaview/shared";
import { evaluatePep } from "./eval/evaluate.js";
import { runExtraction } from "./run-extraction.js";
import { fileLlmStore } from "./store.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--"));
  if (!input) throw new Error("Usage: npm run extract -w @dejaview/pipeline -- <thread.json> [--eval] [--eval-only]");
  const thread = JSON.parse(await readFile(resolve(process.env.INIT_CWD ?? process.cwd(), input), "utf8")) as Thread;
  const outDir = join(ROOT, "examples", thread.topic.slug);
  const llmStore = fileLlmStore(join(ROOT, "data", "llm-cache"));
  const started = Date.now();

  let result: ExtractionResult;
  if (args.includes("--eval-only")) {
    result = JSON.parse(await readFile(join(outDir, "output", "decisions.json"), "utf8")) as ExtractionResult;
  } else {
    result = await runExtraction(thread, {
      llmStore,
      onProgress: (stage, done, total) => console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${stage} ${done}/${total}`),
    });
    await writeJson(join(outDir, "input", "thread.json"), thread);
    await writeJson(join(outDir, "output", "decisions.json"), result);
    const evidence = result.decisions.flatMap((d) => d.reasons.flatMap((r) => r.evidence));
    console.error(`${result.decisions.length} decisions, ${evidence.filter((e) => e.verified).length}/${evidence.length} quotes verified`);
  }

  if (args.includes("--eval") || args.includes("--eval-only")) {
    if (thread.topic.pepNumber === null) throw new Error("This thread has no PEP number, so it cannot be evaluated");
    const evaluation = await evaluatePep(thread.topic.pepNumber, result, { llmStore });
    await writeJson(join(outDir, "output", "eval.json"), evaluation);
    console.error(`recall ${(evaluation.recall * 100).toFixed(0)}% (${evaluation.matches.filter((m) => m.decisionKey).length}/${evaluation.groundTruth.length}), reason agreement ${(evaluation.reasonAgreement * 100).toFixed(0)}%, extra ideas ${evaluation.extraIdeas}`);
  }
  console.error(`done in ${((Date.now() - started) / 1000).toFixed(0)}s → ${outDir}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
