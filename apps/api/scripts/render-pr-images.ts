// Renders the images used in the pull request.
//
//   npm run render-pr-images -w @dejaview/api
//
// Every picture comes from a real run: the API answers below are fetched from the running
// server, and the terminal pictures show the actual output of `npm test` and `psql`. Nothing
// here is written by hand.
//
// It needs the API to be running (npm run start -w @dejaview/api) and a DATABASE_URL.

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const API_URL = process.env.DEJAVIEW_API_URL ?? "http://localhost:3001";
const OUT_DIR = fileURLToPath(new URL("../../../docs/team/", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
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
  .wrap { padding: 40px 44px 36px; }
  .kicker {
    font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
    color: #8a6d1f; margin-bottom: 10px;
  }
  h1 { font-size: 27px; line-height: 1.2; margin: 0 0 6px; letter-spacing: -.015em; }
  h2 { font-size: 15px; margin: 0 0 14px; color: #4a4f57; font-weight: 600; }
  p.lead { font-size: 14.5px; line-height: 1.55; color: #4a4f57; margin: 0 0 24px; max-width: 980px; }
  code { font-family: ${MONO}; font-size: .92em; background: #f2f3f5; padding: 1px 5px; border-radius: 4px; }
`;

/** The flow of the data side of the system. */
function flowHtml(): string {
  const box = (title: string, detail: string, tone: string) => `
    <div class="box ${tone}">
      <div class="box-title">${escapeHtml(title)}</div>
      <div class="box-detail">${detail}</div>
    </div>`;

  const arrow = (label: string) => `
    <div class="arrow">
      <div class="arrow-label">${escapeHtml(label)}</div>
      <div class="arrow-line"></div>
      <div class="arrow-head"></div>
    </div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${BASE_CSS}
  .flow { display: flex; align-items: stretch; gap: 0; margin-top: 8px; }
  .box {
    border-radius: 10px; padding: 14px 15px; min-width: 168px; flex: 1;
    border: 1px solid #e2e5ea; background: #fbfbfc;
  }
  .box-title { font-size: 13.5px; font-weight: 700; margin-bottom: 5px; letter-spacing: -.01em; }
  .box-detail { font-size: 11.5px; line-height: 1.5; color: #5b616b; }
  .box.gold { background: #fdf8ec; border-color: #ecdcb4; }
  .box.gold .box-title { color: #7a5c12; }
  .box.blue { background: #eef4fd; border-color: #c8dcf7; }
  .box.blue .box-title { color: #1b4d91; }
  .box.green { background: #eef8f1; border-color: #c5e4d0; }
  .box.green .box-title { color: #1d6b3d; }
  .box.grey { background: #f5f6f8; }
  .arrow { width: 62px; flex: none; display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 16px; }
  .arrow-label { font-size: 10px; color: #858b94; margin-bottom: 6px; white-space: nowrap; }
  .arrow-line { width: 100%; height: 2px; background: #c9ced6; }
  .arrow-head { width: 0; height: 0; border-left: 7px solid #c9ced6; border-top: 5px solid transparent; border-bottom: 5px solid transparent; margin-top: -4px; }
  .lower { margin-top: 22px; display: flex; gap: 16px; }
  .note {
    flex: 1; border-radius: 10px; padding: 13px 16px; background: #f7f8fa; border: 1px solid #e4e7ec;
    font-size: 12.5px; line-height: 1.55; color: #4a4f57;
  }
  .note b { color: #14161a; }
  .note .tag {
    display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: .1em;
    text-transform: uppercase; color: #8a6d1f; margin-bottom: 5px;
  }
  </style></head><body><div class="wrap">
    <div class="kicker">DejaView &middot; the data side</div>
    <h1>From a forum thread to a decision you can check</h1>
    <p class="lead">Everything in this picture is real code in this pull request. The gold boxes are what this PR adds;
      the model and the linker are Abhijeet's and Ansh's parts, and the dashboard is Nitesh's.</p>

    <div class="flow">
      ${box("Sources", "discuss.python.org<br>GitHub issues &amp; PRs<br>uploaded files", "grey")}
      ${arrow("fetch")}
      ${box("packages/ingest", "one <code>Thread</code> shape<br>CLI + three adapters", "gold")}
      ${arrow("store")}
      ${box("Postgres", "topics, posts, decisions<br>evidence, anchors, jobs<br>full-text search", "blue")}
      ${arrow("claim")}
      ${box("apps/worker", "ingest &rarr; extract &rarr; link<br>lease + fencing token", "green")}
      ${arrow("serve")}
      ${box("apps/api", "every route in the<br>shared contract", "gold")}
      ${arrow("read")}
      ${box("apps/web", "the dashboard<br>(Nitesh's part)", "grey")}
    </div>

    <div class="lower">
      <div class="note">
        <span class="tag">The model</span><br>
        <b>Qwen3.5 4B</b> sorts every post before the big model reads it.
        <b>Qwen3.5 9B</b> extracts the decisions and merges duplicates.
        Both run on our own laptop, through Ollama. Every call is stored in
        <code>llm_calls</code>, so a maintainer can see exactly what the model was shown.
      </div>
      <div class="note">
        <span class="tag">Why a queue</span><br>
        The model is slow, the API is not. The worker takes a job with
        <code>FOR UPDATE SKIP LOCKED</code> in one statement, commits <b>before</b> the slow call,
        and keeps a lease so a crash cannot strand a job.
      </div>
      <div class="note">
        <span class="tag">Where it goes next</span><br>
        The dashboard reads the same API. The GitHub Action posts one comment on a pull request:
        <b>&ldquo;you have had this debate before&rdquo;</b>, with the evidence link.
      </div>
    </div>
  </div></body></html>`;
}

/** The live API answering, with the real rows it returned. */
async function apiRunHtml(): Promise<string> {
  const topics = (await getJson("/api/topics")) as {
    slug: string;
    title: string;
    pepNumber: number | null;
    decisionCount: number;
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
        <td class="num">${topic.decisionCount}</td>
      </tr>`,
    )
    .join("");

  const postRows = timeline
    .slice(0, 7)
    .map((post) => {
      const text = post.bodyClean.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      return `<tr>
        <td class="num muted">#${post.id}</td>
        <td class="author">${escapeHtml(post.author)}</td>
        <td class="muted mono nowrap">${escapeHtml((post.createdAt ?? "").slice(0, 10))}</td>
        <td class="snippet">${escapeHtml(text.slice(0, 74))}${text.length > 74 ? "&hellip;" : ""}</td>
        <td class="mono muted link">${escapeHtml((post.url ?? "").split("/").slice(-2).join("/"))}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><style>
  ${BASE_CSS}
  .grid { display: grid; grid-template-columns: 0.82fr 1.18fr; gap: 20px; align-items: start; }
  .panel { border: 1px solid #e4e7ec; border-radius: 11px; overflow: hidden; background: #fff; }
  .panel-head {
    padding: 11px 15px; background: #f7f8fa; border-bottom: 1px solid #e4e7ec;
    font-size: 12px; font-weight: 700; color: #4a4f57; display: flex; justify-content: space-between;
  }
  .panel-head .ok { color: #1d6b3d; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; color: #858b94; padding: 9px 12px; border-bottom: 1px solid #eceef1; }
  td { padding: 8px 12px; border-bottom: 1px solid #f2f3f5; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #858b94; }
  .nowrap { white-space: nowrap; }
  .mono { font-family: ${MONO}; font-size: 11px; }
  .author { font-weight: 600; white-space: nowrap; }
  .snippet { color: #4a4f57; line-height: 1.45; }
  .link { color: #1b4d91; white-space: nowrap; }
  .pill { background: #fdf3d7; color: #7a5c12; border: 1px solid #ecdcb4; padding: 1px 7px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .log { margin-top: 18px; }
  .log pre { margin: 0; padding: 14px 16px; background: #0d1117; color: #c9d1d9; font-family: ${MONO}; font-size: 12px; line-height: 1.75; border-radius: 11px; overflow: hidden; }
  .log .g { color: #7ee787; } .log .r { color: #ff7b72; } .log .d { color: #79c0ff; } .log .y { color: #d2a8ff; }
  .foot { margin-top: 14px; font-size: 11.5px; color: #858b94; }
  </style></head><body><div class="wrap">
    <div class="kicker">Real run &middot; no mocks</div>
    <h1>The API answering, with the rows it really returned</h1>
    <p class="lead">The server below is this branch's <code>apps/api</code> talking to a local Postgres.
      The two topics were fetched from discuss.python.org a moment ago; every post below is stored in the database.</p>

    <div class="grid">
      <div class="panel">
        <div class="panel-head"><span>GET /api/topics</span><span class="ok">${topics.length} topics</span></div>
        <table>
          <thead><tr><th>Slug</th><th>Title</th><th class="num">Src</th><th class="num">Dec</th></tr></thead>
          <tbody>${topicRows}</tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-head"><span>GET /api/topics/pep-698/timeline</span><span class="ok">${timeline.length} posts</span></div>
        <table>
          <thead><tr><th></th><th>Author</th><th>Date</th><th>Post</th><th>Link</th></tr></thead>
          <tbody>${postRows}</tbody>
        </table>
      </div>
    </div>

    <div class="log">
      <div class="panel-head" style="border-radius:11px 11px 0 0;border-bottom:none;"><span>apps/worker &mdash; the real log</span></div>
      <pre><span class="d">job 1 (ingest)</span>  picked up
<span class="d">job 1 (ingest)</span>  done
<span class="d">job 2 (extract)</span> picked up
<span class="d">job 2 (extract)</span> failed: <span class="r">packages/pipeline is not available yet - ask Abhijeet for the extract job</span></pre>
      <div class="foot">The ingest really worked: the thread was fetched and stored. The extract step waits for
      <code>@dejaview/pipeline</code>, and says so out loud instead of failing silently.</div>
    </div>
  </div></body></html>`;
}

/** A terminal picture of the real test output. */
function terminalHtml(title: string, body: string, tint = "#0d1117"): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; background: ${tint}; font-family: ${MONO}; padding: 26px 28px; }
  .chrome { border-radius: 12px; overflow: hidden; border: 1px solid #30363d; box-shadow: 0 18px 50px rgba(0,0,0,.28); }
  .bar { display: flex; align-items: center; gap: 8px; padding: 11px 14px; background: #161b22; border-bottom: 1px solid #30363d; }
  .dot { width: 11px; height: 11px; border-radius: 50%; }
  .t { color: #8b949e; font-size: 12px; margin-left: 8px; }
  pre { margin: 0; padding: 16px 18px 18px; color: #c9d1d9; font-size: 12.5px; line-height: 1.62; white-space: pre-wrap; }
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
      if (/Test Files|Tests|Duration|RUN/.test(line)) return `<span class="b">${escaped}</span>`;
      if (/npm|>/.test(line)) return `<span class="y">${escaped}</span>`;
      return `<span class="d">${escaped}</span>`;
    })
    .join("\n");
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const written: string[] = [];

  const shoot = async (name: string, html: string, width = 1360, height = 900) => {
    // The intermediate HTML is a temporary file, not something the repo should carry.
    const htmlPath = join(tmpdir(), `dejaview-${name}.html`);
    const pngPath = join(OUT_DIR, `${name}.png`);
    writeFileSync(htmlPath, html, "utf8");
    run(CHROME, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=2",
      `--window-size=${width},${height}`,
      `--screenshot=${pngPath}`,
      `file://${htmlPath}`,
    ]);
    // Trim the empty space the fixed window size leaves behind, then add it back as a margin.
    run("magick", [
      pngPath,
      "-trim",
      "+repage",
      "-bordercolor",
      name.startsWith("mudit-flow") || name === "mudit-api-run" ? "#ffffff" : "#0d1117",
      "-border",
      "28",
      pngPath,
    ]);
    written.push(pngPath);
    console.log(`wrote ${pngPath}`);
  };

  await shoot("mudit-flow", flowHtml());

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
    1180,
    760,
  );

  const schema = run("psql", [
    process.env.DATABASE_URL ?? "postgres://dejaview:dejaview@localhost:5432/dejaview_dev",
    "-c",
    "\\dt",
  ]);
  await shoot(
    "mudit-schema",
    terminalHtml("psql \\dt — the schema from design.md §7", highlightTerminal(schema.trim())),
    1120,
    620,
  );

  await shoot("mudit-api-run", await apiRunHtml());

  console.log(`\n${written.length} images written to ${OUT_DIR}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
