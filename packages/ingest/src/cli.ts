// CLI: turn a URL or a file into a Thread fixture.
//
//   npm run fetch-thread -w @dejaview/ingest -- <url-or-file> --slug pep-701 --pep 701
//
// Writes fixtures/threads/<slug>.json. Real input, real output — the organizers ask for it.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Thread } from "@dejaview/shared";
import { fetchDiscourseThread } from "./discourse.js";
import { fetchGithubPullFiles, fetchGithubThread } from "./github.js";
import { threadFromUpload } from "./upload.js";
import { parseDiscourseUrl, parseGithubUrl } from "./url.js";

const DEFAULT_OUT_DIR = fileURLToPath(new URL("../../../fixtures/threads/", import.meta.url));

interface CliArgs {
  target: string;
  slug: string | undefined;
  pepNumber: number | undefined;
  outDir: string;
  withFiles: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    target: "",
    slug: undefined,
    pepNumber: undefined,
    outDir: DEFAULT_OUT_DIR,
    withFiles: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;
    if (arg === "--slug" || arg === "-s") {
      args.slug = argv[index + 1];
      index += 1;
    } else if (arg === "--pep" || arg === "-p") {
      const value = argv[index + 1];
      const parsed = value === undefined ? Number.NaN : Number(value);
      if (Number.isFinite(parsed)) args.pepNumber = parsed;
      index += 1;
    } else if (arg === "--out" || arg === "-o") {
      const value = argv[index + 1];
      if (value) args.outDir = isAbsolute(value) ? value : resolve(process.cwd(), value);
      index += 1;
    } else if (arg === "--with-files") {
      args.withFiles = true;
    } else if (!arg.startsWith("-") && !args.target) {
      args.target = arg;
    }
  }

  return args;
}

async function loadThread(args: CliArgs): Promise<Thread> {
  const { target, slug, pepNumber } = args;

  if (existsSync(target)) {
    return threadFromUpload(target, {
      topicSlug: slug,
      pepNumber: pepNumber ?? null,
      title: basename(target),
    });
  }

  if (parseDiscourseUrl(target)) {
    return fetchDiscourseThread(target, { topicSlug: slug, pepNumber: pepNumber ?? null });
  }

  if (parseGithubUrl(target)) {
    return fetchGithubThread(target, { topicSlug: slug, pepNumber: pepNumber ?? null });
  }

  throw new Error(
    `Cannot tell what "${target}" is. Pass a Discourse topic URL, a GitHub issue/PR URL, or a local file.`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.target) {
    console.error(
      "Usage: npm run fetch-thread -w @dejaview/ingest -- <url-or-file> [--slug <slug>] [--pep <n>] [--out <dir>] [--with-files]",
    );
    process.exitCode = 2;
    return;
  }

  const thread = await loadThread(args);
  const slug = thread.topic.slug;
  const outDir = args.outDir;
  mkdirSync(outDir, { recursive: true });

  const target = join(outDir, `${slug}.json`);
  writeFileSync(target, `${JSON.stringify(thread, null, 2)}\n`, "utf8");

  console.log(`Wrote ${target}`);
  console.log(
    `  topic: ${thread.topic.slug} | source: ${thread.source.kind} | posts: ${thread.posts.length}`,
  );

  if (args.withFiles && parseGithubUrl(args.target)?.isPullRequest) {
    const files = await fetchGithubPullFiles(args.target);
    const filesTarget = join(outDir, `${slug}.files.json`);
    writeFileSync(filesTarget, `${JSON.stringify(files, null, 2)}\n`, "utf8");
    console.log(`Wrote ${filesTarget} (${files.length} changed files)`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
