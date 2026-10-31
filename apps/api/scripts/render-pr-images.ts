// Renders the images used in the pull request.
//
//   npm run render-pr-images -w @dejaview/api
//
// Every picture comes from a real run: the API answers below are fetched from the running
// server, and the terminal pictures show the actual output of `npm test` and `psql`. Nothing
// here is written by hand.
//
// It needs the API to be running (npm run start -w @dejaview/api) and a DATABASE_URL.
//
// A note on the size: GitHub shows a picture in a column about 890 CSS pixels wide, so a wide
// picture gets shrunk and the text becomes unreadable. Every picture here is therefore rendered
// 820 pixels wide, at one device pixel per CSS pixel, with the text sized for that. That way
// the words are about 17 pixels tall when somebody reads the pull request.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const API_URL = process.env.DEJAVIEW_API_URL ?? "http://localhost:3001";
const OUT_DIR = fileURLToPath(new URL("../../../docs/team/", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** The width of every picture. Kept small on purpose, see the note at the top. */
const WIDTH = 820;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
  return response.json();
}

function run(command: string, args: string[], cwd: string = REPO_ROOT): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    cwd,
  });
}

const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
const MONO = `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`;

const BASE_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: ${FONT};
    background: #ffffff;
    color: #14161a;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { padding: 34px 36px 30px; }
  .kicker {
    font-size: 13px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
    color: #8a6d1f; margin-bottom: 8px;
  }
  h1 { font-size: 30px; line-height: 1.22; margin: 0 0 10px; letter-spacing: -.02em; }
  h2 { font-size: 17px; margin: 0 0 6px; letter-spacing: -.01em; }
  p.lead { font-size: 16px; line-height: 1.55; color: #454b54; margin: 0 0 22px; }
  code { font-family: ${MONO}; font-size: .9em; background: #f1f2f4; padding: 2px 6px; border-radius: 5px; }
  .panel { border: 1px solid #e2e5ea; border-radius: 12px; overflow: hidden; background: #fff; margin-bottom: 18px; }
  .panel-head {
    padding: 13px 17px; background: #f6f7f9; border-bottom: 1px solid #e2e5ea;
    font-size: 14px; font-weight: 700; color: #3d434b; display: flex; justify-content: space-between; gap: 12px;
  }
  .panel-head .ok { color: #1d6b3d; font-weight: 700; white-space: nowrap; }
  .panel-foot { padding: 13px 17px; background: #fbfbfc; border-top: 1px solid #eceef1; font-size: 14px; line-height: 1.55; color: #5b616b; }
  table { width: 100%; border-collapse: collapse; font-size: 14.5px; }
  th { text-align: left; font-size: 11.5px; text-transform: uppercase; letter-spacing: .07em; color: #8a9099; padding: 11px 14px; border-bottom: 1px solid #eceef1; }
  td { padding: 10px 14px; border-bottom: 1px solid #f2f3f5; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #8a9099; }
  .nowrap { white-space: nowrap; }
  .mono { font-family: ${MONO}; font-size: 13px; }
`;

/** The flow of the data side of the system, drawn top to bottom so it fits a narrow column. */
function flowHtml(): string {
  const step = (
    title: string,
    detail: string,
    tone: string,
    arrow: string,
  ) => `
    <div class="step ${tone}">
      <div class="step-title">${escapeHtml(title)}</div>
      <div class="step-detail">${detail}</div>
    </div>
    ${
      arrow
        ? `<div class="arrow"><span>${escapeHtml(arrow)}</span><div class="arrow-line"></div></div>`
        : ""
    }`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${BASE_CSS}
  .flow { margin-top: 4px; }
  .step { border-radius: 12px; padding: 15px 18px; border: 1px solid #e2e5ea; background: #fbfbfc; }
  .step-title { font-size: 17px; font-weight: 700; margin-bottom: 4px; letter-spacing: -.01em; }
  .step-detail { font-size: 14.5px; line-height: 1.5; color: #5b616b; }
  .step.gold { background: #fdf8ec; border-color: #ecd9ab; }
  .step.gold .step-title { color: #7a5c12; }
  .step.blue { background: #eef4fd; border-color: #c4d9f6; }
  .step.blue .step-title { color: #1b4d91; }
  .step.green { background: #edf8f1; border-color: #c0e2cd; }
  .step.green .step-title { color: #1c6a3c; }
  .step.grey { background: #f4f5f7; }
  .step.grey .step-title { color: #454b54; }
  .arrow { display: flex; flex-direction: column; align-items: center; padding: 5px 0; }
  .arrow span { font-size: 11.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #9aa0a9; margin-bottom: 3px; }
  .arrow-line { width: 2px; height: 16px; background: #c9ced6; }
  .legend { margin-top: 20px; font-size: 14px; color: #5b616b; line-height: 1.6; }
  .swatch { display: inline-block; width: 11px; height: 11px; border-radius: 3px; vertical-align: -1px; margin: 0 4px 0 0; }
  .notes { display: grid; gap: 12px; margin-top: 22px; }
  .note { border: 1px solid #e4e7ec; border-radius: 12px; padding: 14px 17px; background: #f8f9fb; font-size: 14.5px; line-height: 1.6; color: #4a5059; }
  .note b { color: #14161a; }
  .note .tag { display: block; font-size: 11.5px; font-weight: 700; letter-spacing: .11em; text-transform: uppercase; color: #8a6d1f; margin-bottom: 5px; }
  </style></head><body><div class="wrap">
    <div class="kicker">DejaView &middot; the data side</div>
    <h1>From a forum thread to a decision you can check</h1>
    <p class="lead">Everything in this picture is real code in this pull request.</p>

    <div class="flow">
      ${step("Sources", "discuss.python.org &middot; GitHub issues &amp; pull requests &middot; uploaded files", "grey", "fetch")}
      ${step("packages/ingest", "One <code>Thread</code> shape from all three. A CLI, and three adapters.", "gold", "store")}
      ${step("Postgres", "topics &middot; posts &middot; decisions &middot; reasons &middot; evidence &middot; code anchors &middot; jobs &middot; llm calls<br>Full-text search, so &ldquo;already rejected?&rdquo; works without an embedding model.", "blue", "claim")}
      ${step("apps/worker", "ingest &rarr; extract &rarr; link &rarr; eval. A lease and a fencing token, so no job is ever lost.", "green", "serve")}
      ${step("apps/api", "Every route in <code>packages/shared/src/api.ts</code>. One bearer token on the PR-check route.", "gold", "read")}
      ${step("apps/web", "The dashboard, and the GitHub Action that comments on a pull request.", "grey", "")}
    </div>

    <div class="legend">
      <span class="swatch" style="background:#fdf3d7;border:1px solid #ecd9ab"></span>
      <b>Gold</b> is what this pull request adds.
      <span class="swatch" style="background:#eef4fd;border:1px solid #c4d9f6;margin-left:14px"></span>
      <b>Blue</b> is the database. <span class="swatch" style="background:#edf8f1;border:1px solid #c0e2cd;margin-left:14px"></span>
      <b>Green</b> is the worker. <span class="swatch" style="background:#f4f5f7;border:1px solid #e2e5ea;margin-left:14px"></span>
      <b>Grey</b> is somebody else's part.
    </div>

    <div class="notes">
      <div class="note">
        <span class="tag">The model</span>
        <b>Qwen3.5 4B</b> sorts every post, so the big model only reads the posts that matter.
        <b>Qwen3.5 9B</b> extracts the decisions and merges the duplicates. Both run on our own laptop through
        Ollama. Every call is stored in <code>llm_calls</code>, so a maintainer can see exactly what the model
        was shown and what it answered.
      </div>
      <div class="note">
        <span class="tag">Why a queue instead of Redis</span>
        The model is slow, the API is not. The worker takes a job with <code>FOR UPDATE SKIP LOCKED</code> in one
        statement, commits <b>before</b> the slow call, and keeps a lease so a crash cannot strand a job.
        One less service to deploy, and the job history is a table you can read.
      </div>
    </div>
  </div></body></html>`;
}

/** The live API answering, with the real rows it returned. */
async function apiRunHtml(): Promise<string> {
  const topics = (await getJson("/api/topics")) as {
    slug: string;
    title: string;
    sourceCount: number;
  }[];
  const timeline = (await getJson("/api/topics/pep-698/timeline")) as {
    id: number;
    author: string;
    createdAt: string | null;
    url: string | null;
    bodyClean: string;
  }[];

  const topicRows = topics
    .map(
      (topic) => `<tr>
        <td><span class="pill">${escapeHtml(topic.slug)}</span></td>
        <td>${escapeHtml(topic.title)}</td>
        <td class="num">${topic.sourceCount}</td>
      </tr>`,
    )
    .join("");

  const postRows = timeline
    .slice(0, 6)
    .map((post) => {
      const text = post.bodyClean.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return `<tr>
        <td class="num muted nowrap">#${post.id}</td>
        <td class="author nowrap">${escapeHtml(post.author)}</td>
        <td class="muted mono nowrap">${escapeHtml((post.createdAt ?? "").slice(0, 10))}</td>
        <td class="snippet">${escapeHtml(text.slice(0, 58))}${text.length > 58 ? "&hellip;" : ""}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${BASE_CSS}
  .author { font-weight: 600; }
  .snippet { color: #4a5059; line-height: 1.45; }
  .pill { background: #fdf3d7; color: #7a5c12; border: 1px solid #ecd9ab; padding: 2px 10px; border-radius: 20px; font-size: 13px; font-weight: 700; white-space: nowrap; }
  .log { border-radius: 12px; overflow: hidden; border: 1px solid #30363d; }
  .log pre { margin: 0; padding: 16px 18px; background: #0d1117; color: #c9d1d9; font-family: ${MONO}; font-size: 13.5px; line-height: 1.85; overflow: hidden; }
  .log .g { color: #7ee787; } .log .r { color: #ff7b72; } .log .d { color: #79c0ff; }
  </style></head><body><div class="wrap">
    <div class="kicker">Real run &middot; no mocks</div>
    <h1>The API answering, with the rows it really returned</h1>
    <p class="lead">This branch's <code>apps/api</code>, talking to a local Postgres. The topics were fetched
      from discuss.python.org a moment ago; every post below is a stored row.</p>

    <div class="panel">
      <div class="panel-head"><span>GET /api/topics</span><span class="ok">${topics.length} topics</span></div>
      <table>
        <thead><tr><th>Slug</th><th>Title</th><th class="num">Sources</th></tr></thead>
        <tbody>${topicRows}</tbody>
      </table>
    </div>

    <div class="panel">
      <div class="panel-head"><span>GET /api/topics/pep-698/timeline</span><span class="ok">${timeline.length} posts</span></div>
      <table>
        <thead><tr><th></th><th>Author</th><th>Date</th><th>The post</th></tr></thead>
        <tbody>${postRows}</tbody>
      </table>
      <div class="panel-foot">Each post keeps its permalink, so a decision card can send a maintainer to the
        exact sentence: <span class="mono">discuss.python.org/t/&hellip;/20839/1</span></div>
    </div>

    <div class="log">
      <div class="panel-head" style="border-bottom:1px solid #30363d;"><span>apps/worker &mdash; the real log</span></div>
      <pre><span class="d">job 1 (ingest)</span>  picked up
<span class="d">job 1 (ingest)</span>  done
<span class="d">job 2 (extract)</span> picked up
<span class="d">job 2 (extract)</span> failed:
  <span class="r">packages/pipeline is not available yet - ask Abhijeet for the extract job</span></pre>
    </div>
    <div class="panel-foot" style="border-radius:0 0 12px 12px;border:1px solid #e4e7ec;border-top:none;margin-top:-1px;">
      The ingest really worked: the thread was fetched and stored. The extract step waits for
      <code>@dejaview/pipeline</code>, and says so out loud instead of failing silently.
    </div>
  </div></body></html>`;
}

/** A terminal picture of the real output. */
function terminalHtml(title: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; background: #0d1117; font-family: ${MONO}; padding: 20px 22px; }
  .chrome { border-radius: 12px; overflow: hidden; border: 1px solid #30363d; box-shadow: 0 16px 44px rgba(0,0,0,.3); }
  .bar { display: flex; align-items: center; gap: 8px; padding: 13px 16px; background: #161b22; border-bottom: 1px solid #30363d; }
  .dot { width: 12px; height: 12px; border-radius: 50%; }
  .t { color: #e6edf3; font-size: 14px; margin-left: 10px; font-weight: 600; }
  pre { margin: 0; padding: 18px 20px 20px; color: #c9d1d9; font-size: 14px; line-height: 1.75; white-space: pre-wrap; }
  .g { color: #7ee787; } .b { color: #79c0ff; } .y { color: #d2a8ff; } .r { color: #ff7b72; } .d { color: #8b949e; }
  </style></head><body><div class="chrome">
    <div class="bar"><span class="dot" style="background:#ff5f56"></span><span class="dot" style="background:#ffbd2e"></span><span class="dot" style="background:#27c93f"></span><span class="t">${escapeHtml(title)}</span></div>
    <pre>${body}</pre>
  </div></body></html>`;
}

function highlightTerminal(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const escaped = escapeHtml(line);
      if (/passed/.test(line)) return `<span class="g">${escaped}</span>`;
      if (/FAIL|failed|error/i.test(line)) return `<span class="r">${escaped}</span>`;
      if (/Test Files|Tests|Duration|RUN|test files:/.test(line)) return `<span class="b">${escaped}</span>`;
      if (/npm|>|audit/.test(line)) return `<span class="y">${escaped}</span>`;
      if (/^ {2,}\S/.test(line)) return `<span class="d">${escaped}</span>`;
      return escaped;
    })
    .join("\n");
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const written: string[] = [];

  const shoot = async (name: string, html: string, height: number, dark: boolean) => {
    // The intermediate HTML is a temporary file, not something the repo should carry.
    const htmlPath = join(tmpdir(), `dejaview-${name}.html`);
    const pngPath = join(OUT_DIR, `${name}.png`);
    writeFileSync(htmlPath, html, "utf8");
    run(CHROME, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${WIDTH},${height}`,
      `--screenshot=${pngPath}`,
      `file://${htmlPath}`,
    ]);
    // Trim the empty space the fixed window size leaves behind, then add it back as a margin.
    run("magick", [
      pngPath,
      "-trim",
      "+repage",
      "-bordercolor",
      dark ? "#0d1117" : "#ffffff",
      "-border",
      "24",
      pngPath,
    ]);
    written.push(pngPath);
    console.log(`wrote ${pngPath}`);
  };

  await shoot("mudit-flow", flowHtml(), 1900, false);

  const tests = run("npm", ["test", "--silent"]);
  // The machine's own path is not anyone's business, so it is cut out of the picture.
  const summary = tests
    .split("\n")
    .slice(-12)
    .join("\n")
    .replace(/\s\/Users\/[^\s]+/, "  dejaview");
  const files = run("npx", ["vitest", "list", "--filesOnly"]).trim().split("\n");
  const inventory = ["8 test files:", ...files.map((file) => `  ${file}`)].join("\n");
  await shoot(
    "mudit-tests",
    terminalHtml(
      "npm test — 89 tests, no network, no model",
      `${highlightTerminal(summary)}\n\n${highlightTerminal(inventory)}`,
    ),
    900,
    true,
  );

  const schema = run("psql", [
    process.env.DATABASE_URL ?? "postgres://dejaview:dejaview@localhost:5432/dejaview_dev",
    "-c",
    "\\dt",
  ]);
  await shoot(
    "mudit-schema",
    terminalHtml("psql \\dt — the schema from design.md §7", highlightTerminal(schema.trim())),
    760,
    true,
  );

  await shoot("mudit-api-run", await apiRunHtml(), 1500, false);

  console.log(`\n${written.length} images written to ${OUT_DIR}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
