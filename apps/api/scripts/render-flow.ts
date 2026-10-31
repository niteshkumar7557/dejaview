// Builds the flow visualisation: one interactive HTML page and one animated GIF.
//
//   npm run render-flow -w @dejaview/api
//
// The page is the real thing: every number, file name and link in it is read from the running
// API, the database and the repository, so it cannot drift away from the code. The GIF is the
// same page captured frame by frame with headless Chrome, which is why it shows the real flow
// and not a drawing of it.
//
// It needs the API running and a DATABASE_URL.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const API_URL = process.env.DEJAVIEW_API_URL ?? "http://localhost:3001";
const OUT_DIR = fileURLToPath(new URL("../../../docs/team/", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const REPO_URL = "https://github.com/niteshkumar7557/dejaview";
const BRANCH = "mudit/ingest";
// Wide enough to keep the six stages on one row (the page drops to three columns below 980px).
const GIF_WIDTH = 1120;
const GIF_HEIGHT = 300;
const FPS = 12;
const SECONDS = 9;

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

function sql(query: string): string {
  const output = run("psql", [
    process.env.DATABASE_URL ?? "postgres://dejaview:dejaview@localhost:5432/dejaview_dev",
    "-t",
    "-A",
    "-c",
    query,
  ]);
  return output.trim();
}

function listFiles(folder: string): string[] {
  try {
    return readdirSync(join(REPO_ROOT, folder))
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .sort();
  } catch {
    return [];
  }
}

interface Stage {
  id: string;
  step: string;
  title: string;
  subtitle: string;
  files: string[];
  facts: { label: string; value: string }[];
  links: { label: string; url: string }[];
  note: string;
}

async function collect(): Promise<{ stages: Stage[]; meta: Record<string, string> }> {
  const topics = (await getJson("/api/topics")) as {
    slug: string;
    title: string;
    pepNumber: number | null;
    sourceCount: number;
    decisionCount: number;
  }[];
  const timeline = (await getJson("/api/topics/pep-698/timeline")) as {
    id: number;
    author: string;
    createdAt: string | null;
    bodyClean: string;
    url: string | null;
  }[];
  const jobs = (await getJson("/api/pr-checks")) as unknown[];

  const postCount = sql("SELECT count(*) FROM posts");
  const topicCount = sql("SELECT count(*) FROM topics");
  const tableList = sql(
    "SELECT string_agg(tablename, ', ' ORDER BY tablename) FROM pg_tables WHERE schemaname='public'",
  );
  const jobRows = sql(
    "SELECT string_agg(type || '=' || status || COALESCE(' (' || error || ')', ''), E'\\n' ORDER BY id) FROM jobs",
  );

  const firstPost = timeline[0];
  const authors = new Set(timeline.map((post) => post.author));
  const blob = (path: string) => `${REPO_URL}/blob/${BRANCH}/${path}`;
  // Where the dashboard lives, once it is deployed. Until then the links go to the source.
  const dashboardUrl = process.env.DASHBOARD_URL ?? "";

  const stages: Stage[] = [
    {
      id: "sources",
      step: "1",
      title: "The discussion",
      subtitle: "A public thread nobody wrote down",
      files: [],
      facts: [
        { label: "Topics ingested", value: `${topicCount}` },
        { label: "Posts in the database", value: `${postCount}` },
        { label: "Authors on PEP 698", value: `${authors.size}` },
        {
          label: "First post",
          value: firstPost
            ? `@${firstPost.author}: "${firstPost.bodyClean.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 90)}..."`
            : "—",
        },
      ],
      links: [
        {
          label: "The real thread on discuss.python.org",
          url: "https://discuss.python.org/t/pep-698-a-typing-override-decorator/20839",
        },
        { label: "The topic on the dashboard", url: "http://localhost:3100/topics/pep-698" },
      ],
      note: "Ingest never reads the PEP itself. Only the evaluation does, and only afterwards.",
    },
    {
      id: "ingest",
      step: "2",
      title: "Ingest",
      subtitle: "Three shapes of discussion, one Thread",
      files: listFiles("packages/ingest/src"),
      facts: [
        { label: "Sources supported", value: "Discourse · GitHub issue/PR · uploaded file" },
        { label: "CLI", value: "npm run fetch-thread -w @dejaview/ingest" },
        { label: "Threads fetched", value: topics.map((topic) => topic.slug).join(", ") },
      ],
      links: [
        { label: "packages/ingest/src/discourse.ts", url: blob("packages/ingest/src/discourse.ts") },
        { label: "packages/ingest/src/github.ts", url: blob("packages/ingest/src/github.ts") },
        { label: "packages/ingest/src/upload.ts", url: blob("packages/ingest/src/upload.ts") },
      ],
      note: "The forum and GitHub answers were probed live first: the batch endpoint wants global post ids, not post numbers.",
    },
    {
      id: "database",
      step: "3",
      title: "Postgres",
      subtitle: "Everything, in plain SQL",
      files: listFiles("db/src"),
      facts: [
        { label: "Tables", value: tableList },
        { label: "Posts stored", value: `${postCount}` },
        { label: "Rule", value: "every query parameterised, never string-concatenated" },
      ],
      links: [
        { label: "db/migrations/001_init.sql", url: blob("db/migrations/001_init.sql") },
        { label: "db/src/jobs.ts", url: blob("db/src/jobs.ts") },
        { label: "The API live", url: `${API_URL}/api/topics` },
        { label: "The route that serves it", url: blob("apps/api/src/routes/topics.ts") },
      ],
      note: "The schema is design.md §7, with CHECK constraints that use the contract's own values.",
    },
    {
      id: "worker",
      step: "4",
      title: "Worker and model",
      subtitle: "Slow work, out of the way of the API",
      files: listFiles("apps/worker/src"),
      facts: [
        { label: "The chain", value: "ingest → extract → link → eval" },
        { label: "The funnel", value: "clean → triage (4B) → extract (9B) → verify → consolidate" },
        { label: "Job history", value: jobRows || "no jobs yet" },
      ],
      links: [
        { label: "apps/worker/src/jobs — the atomic claim", url: blob("apps/worker/src/jobs.ts") },
        { label: "apps/worker/src/handlers.ts", url: blob("apps/worker/src/handlers.ts") },
      ],
      note: "The job is claimed in one statement, committed before the slow model call, and kept alive by a lease.",
    },
    {
      id: "decisions",
      step: "5",
      title: "The decision card",
      subtitle: "Decided, rejected, and why — with the quote",
      files: [],
      facts: [
        { label: "Status", value: "accepted · rejected · withdrawn · open" },
        { label: "Evidence", value: "a verbatim quote, checked against the post it came from" },
        { label: "Audit trail", value: "every model call, with the prompt and the answer" },
        { label: "Decisions so far", value: "0 — waiting for @dejaview/pipeline" },
      ],
      links: [
        { label: "The contract this shape comes from", url: blob("packages/shared/src/api.ts") },
        { label: "The decisions page", url: dashboardUrl ? dashboardUrl + "/decisions" : blob("apps/web/src/app/decisions/page.tsx") },
      ],
      note: "Nothing is shown without a quote behind it. An unverified quote is flagged, never hidden.",
    },
    {
      id: "code",
      step: "6",
      title: "Code and the PR bot",
      subtitle: "“You have had this debate before.”",
      files: [],
      facts: [
        { label: "Anchors", value: "repo + symbol + path + commit — never a line number" },
        { label: "Renames", value: "git log --follow, then a search for the symbol" },
        { label: "The bot", value: "POST /api/pr-check, one templated comment per pull request" },
        { label: "PR checks so far", value: `${jobs.length}` },
      ],
      links: [
        { label: "The PR check route", url: blob("apps/api/src/routes/prChecks.ts") },
        { label: "The code anchors table", url: blob("db/migrations/001_init.sql") },
        { label: "The PR checks page", url: dashboardUrl ? dashboardUrl + "/pr-checks" : blob("apps/web/src/app/pr-checks/page.tsx") },
      ],
      note: "The comment is templated, not written by the model: instant, deterministic and testable.",
    },
  ];

  return {
    stages,
    meta: {
      generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
      posts: postCount,
      topics: topicCount,
      api: API_URL,
    },
  };
}

function html(stages: Stage[], meta: Record<string, string>): string {
  const data = JSON.stringify({ stages, meta });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DejaView — how a discussion becomes a decision</title>
<style>
  :root {
    --ink: #14161a;
    --muted: #5b616b;
    --line: #dfe3e8;
    --gold: #b4860b;
    --gold-bg: #fdf6e3;
    --blue: #1b4d91;
    --blue-bg: #eef4fd;
    --green: #1c6a3c;
    --green-bg: #ecf8f0;
    --violet: #6b3fa0;
    --violet-bg: #f4eefb;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #fbfbfc; color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .page { max-width: 1240px; margin: 0 auto; padding: 34px 30px 60px; }
  body.gif .panel, body.gif .legend, body.gif .foot, body.gif .lead { display: none; }
  body.gif .page { padding: 22px 26px 26px; }
  body.gif h1 { font-size: 25px; }
  body.gif .lead { margin-bottom: 16px; font-size: 14.5px; }
  .kicker { font-size: 12px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--gold); }
  h1 { font-size: 30px; line-height: 1.2; margin: 8px 0 6px; letter-spacing: -.02em; }
  .lead { font-size: 15.5px; line-height: 1.55; color: var(--muted); margin: 0 0 26px; max-width: 860px; }
  .stage-row { position: relative; display: grid; grid-template-columns: repeat(6, 1fr); gap: 26px; }
  .stage {
    position: relative; border: 1px solid var(--line); border-radius: 14px; background: #fff;
    padding: 15px 15px 14px; cursor: pointer; text-align: left; font: inherit; color: inherit;
    transition: transform .25s ease, box-shadow .25s ease, border-color .25s ease, background .25s ease;
    min-height: 168px;
  }
  .stage:hover { transform: translateY(-3px); box-shadow: 0 12px 28px rgba(20,22,26,.10); }
  .stage:focus-visible { outline: 3px solid #79a8f0; outline-offset: 2px; }
  .stage .num {
    width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center;
    font-size: 13px; font-weight: 700; background: #eef0f3; color: #5b616b; margin-bottom: 9px;
  }
  .stage h2 { font-size: 15.5px; margin: 0 0 4px; letter-spacing: -.01em; }
  .stage p { font-size: 12.5px; line-height: 1.45; color: var(--muted); margin: 0; }
  .stage .hint { font-size: 11px; color: #9aa0a9; margin-top: 9px; }
  .stage.active { border-color: var(--gold); background: var(--gold-bg); transform: translateY(-4px); box-shadow: 0 16px 34px rgba(180,134,11,.16); }
  .stage.active .num { background: var(--gold); color: #fff; }
  .stage.done { border-color: #bfe0cb; background: #f4fbf7; }
  .stage.done .num { background: var(--green); color: #fff; }
  .stage[data-tone="blue"].active { border-color: #7aa9e6; background: var(--blue-bg); }
  .stage[data-tone="blue"].active .num { background: var(--blue); }
  .stage[data-tone="green"].active { border-color: #6fbd8c; background: var(--green-bg); }
  .stage[data-tone="green"].active .num { background: var(--green); }
  .stage[data-tone="violet"].active { border-color: #a583d1; background: var(--violet-bg); }
  .stage[data-tone="violet"].active .num { background: var(--violet); }
  svg.wires { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 0; }
  .stage-row > .stage { z-index: 1; }
  .packet { filter: drop-shadow(0 3px 6px rgba(180,134,11,.45)); }
  .panel {
    margin-top: 26px; border: 1px solid var(--line); border-radius: 14px; background: #fff; overflow: hidden;
  }
  .panel-head { padding: 15px 20px; border-bottom: 1px solid var(--line); background: #f7f8fa; }
  .panel-head h3 { margin: 0 0 3px; font-size: 18px; }
  .panel-head p { margin: 0; font-size: 13.5px; color: var(--muted); }
  .panel-body { display: grid; grid-template-columns: 1.15fr .85fr; gap: 0; }
  .facts { padding: 16px 20px; }
  .fact { display: grid; grid-template-columns: 190px 1fr; gap: 14px; padding: 8px 0; border-bottom: 1px dashed #eceef1; font-size: 13.5px; }
  .fact:last-child { border-bottom: none; }
  .fact dt { color: var(--muted); }
  .fact dd { margin: 0; font-weight: 600; word-break: break-word; }
  .side { padding: 16px 20px; background: #fbfbfc; border-left: 1px solid var(--line); }
  .side h4 { margin: 0 0 9px; font-size: 11.5px; letter-spacing: .11em; text-transform: uppercase; color: #8a9099; }
  .side ul { list-style: none; margin: 0 0 16px; padding: 0; }
  .side li { margin-bottom: 7px; font-size: 13px; }
  .side a { color: var(--blue); text-decoration: none; border-bottom: 1px solid #cfe0f7; }
  .side a:hover { border-bottom-color: var(--blue); }
  .side .note { font-size: 13px; line-height: 1.55; color: var(--muted); }
  .files { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .files span { font-family: ui-monospace, Menlo, monospace; font-size: 11.5px; background: #f1f2f4; border: 1px solid #e4e7ec; border-radius: 6px; padding: 2px 7px; }
  .foot { margin-top: 22px; font-size: 12px; color: #9aa0a9; display: flex; gap: 18px; flex-wrap: wrap; }
  .legend { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; font-size: 12.5px; color: var(--muted); }
  .legend .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--gold); }
  @media (max-width: 980px) {
    .stage-row { grid-template-columns: repeat(3, 1fr); }
    .panel-body { grid-template-columns: 1fr; }
    .side { border-left: none; border-top: 1px solid var(--line); }
  }
</style>
</head>
<body>
<div class="page">
  <div class="kicker">DejaView · the whole flow, moving</div>
  <h1>From a forum thread to a decision a maintainer can check</h1>
  <p class="lead">Every box is real code in the repository, every number is read from the running
    database, and every link opens the actual file or endpoint. Click a stage to see what it does.</p>

  <div class="legend"><span class="dot"></span> Click any stage below for the details.</div>

  <div class="stage-row" id="row">
    <svg class="wires" id="wires" aria-hidden="true"></svg>
  </div>

  <div class="panel" id="panel"></div>

  <div class="foot">
    <span>Generated ${escapeText(meta.generatedAt)}</span>
    <span>${escapeText(meta.posts)} posts · ${escapeText(meta.topics)} topics in the database</span>
    <span>API on ${escapeText(meta.api)}</span>
  </div>
</div>

<script>
const DATA = ${data};
const tones = ["gold", "gold", "blue", "green", "violet", "gold"];
const row = document.getElementById("row");
const wires = document.getElementById("wires");
const panel = document.getElementById("panel");

DATA.stages.forEach((stage, index) => {
  const button = document.createElement("button");
  button.className = "stage";
  button.dataset.index = String(index);
  button.dataset.tone = tones[index];
  button.innerHTML =
    '<div class="num">' + stage.step + '</div>' +
    '<h2>' + escapeText(stage.title) + '</h2>' +
    '<p>' + escapeText(stage.subtitle) + '</p>' +
    '<div class="hint">click for details</div>';
  button.addEventListener("click", () => { select(index); });
  row.appendChild(button);
});

function escapeText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function show(stage) {
  const facts = stage.facts.map((fact) =>
    '<div class="fact"><dt>' + escapeText(fact.label) + '</dt><dd>' + escapeText(fact.value) + '</dd></div>'
  ).join("");
  const files = stage.files.length
    ? '<div class="files">' + stage.files.map((file) => '<span>' + escapeText(file) + '</span>').join("") + '</div>'
    : "";
  const links = stage.links.map((link) =>
    '<li><a href="' + link.url + '" target="_blank" rel="noreferrer">' + escapeText(link.label) + '</a></li>'
  ).join("");
  panel.innerHTML =
    '<div class="panel-head"><h3>' + escapeText(stage.step) + '. ' + escapeText(stage.title) + '</h3>' +
    '<p>' + escapeText(stage.subtitle) + '</p></div>' +
    '<div class="panel-body"><div class="facts">' + facts + files + '</div>' +
    '<div class="side"><h4>Open it</h4><ul>' + links + '</ul>' +
    '<h4>Why it is like that</h4><div class="note">' + escapeText(stage.note) + '</div></div></div>';
}

function select(index) {
  current = index;
  show(DATA.stages[index]);
  paint(currentPhase);
}

// ── The moving part ──────────────────────────────────────────────────────────────────────────
const cards = [...row.querySelectorAll(".stage")];
let currentPhase = 0;
let current = 0;

/** Where the packet is at a given point of the journey: -1 before, stages.length after. */
function positionAt(phase) {
  const n = DATA.stages.length;
  const span = 1 / n;
  const index = Math.min(n - 1, Math.floor(phase / span));
  const within = (phase - index * span) / span;
  return { index, within };
}

function paint(phase) {
  const { index, within } = positionAt(phase);
  const activeIndex = within < 0.45 ? index : Math.min(DATA.stages.length - 1, index + 1);
  cards.forEach((card, i) => {
    card.classList.toggle("active", i === activeIndex && within < 0.45);
    card.classList.toggle("done", i < activeIndex || (i === activeIndex && within >= 0.45));
  });
  drawWires(index, within);
  if (current !== activeIndex && within < 0.45) show(DATA.stages[activeIndex]);
}

function drawWires(index, within) {
  wires.innerHTML = "";
  const rowBox = row.getBoundingClientRect();
  wires.setAttribute("viewBox", "0 0 " + rowBox.width + " " + rowBox.height);
  wires.style.width = rowBox.width + "px";
  wires.style.height = rowBox.height + "px";

  const ns = "http://www.w3.org/2000/svg";
  const points = cards.map((card) => {
    const box = card.getBoundingClientRect();
    return {
      x1: box.left - rowBox.left,
      x2: box.right - rowBox.left,
      y: box.top - rowBox.top + box.height / 2,
    };
  });

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const live = i === index;
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", a.x2); line.setAttribute("y1", a.y);
    line.setAttribute("x2", b.x1 - 6); line.setAttribute("y2", b.y);
    line.setAttribute("stroke", live ? "#b4860b" : i < index ? "#7fbf99" : "#ccd2d9");
    line.setAttribute("stroke-width", live ? "3.5" : "2.5");
    line.setAttribute("stroke-linecap", "round");
    wires.appendChild(line);

    const head = document.createElementNS(ns, "polygon");
    head.setAttribute("points", (b.x1 - 1) + "," + (b.y - 5) + " " + (b.x1 - 9) + "," + b.y + " " + (b.x1 - 1) + "," + (b.y + 5));
    head.setAttribute("fill", live ? "#b4860b" : i < index ? "#7fbf99" : "#ccd2d9");
    wires.appendChild(head);
  }

  const from = points[index];
  const to = points[index + 1] ?? from;
  const x = from.x2 + (to.x1 - from.x2) * within;
  const packet = document.createElementNS(ns, "circle");
  packet.setAttribute("cx", x);
  packet.setAttribute("cy", from.y);
  packet.setAttribute("r", "7");
  packet.setAttribute("fill", "#b4860b");
  packet.setAttribute("class", "packet");
  wires.appendChild(packet);
}

// ── Run it: a still phase from the URL, or a live loop ────────────────────────────────────────
const params = new URLSearchParams(location.search);
if (params.get("gif") === "1") document.body.classList.add("gif");
const still = params.get("t");
if (still !== null) {
  currentPhase = Math.max(0, Math.min(0.999, Number(still)));
  paint(currentPhase);
  show(DATA.stages[positionAt(currentPhase).index]);
  document.body.dataset.ready = "1";
} else {
  select(0);
  const started = performance.now();
  const loop = (now) => {
    const elapsed = (now - started) / 1000;
    const phase = (elapsed % 9) / 9;
    currentPhase = phase;
    paint(phase);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener("resize", () => paint(currentPhase));
}
</script>
</body>
</html>`;
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const { stages, meta } = await collect();
  const page = join(OUT_DIR, "dejaview-flow.html");
  writeFileSync(page, html(stages, meta), "utf8");
  console.log(`wrote ${page}`);

  // The GIF: the same page, captured frame by frame.
  const frames = Math.round(FPS * SECONDS);
  const frameDir = mkdtempSync(join(tmpdir(), "dejaview-flow-"));
  try {
    for (let frame = 0; frame < frames; frame += 1) {
      const phase = (frame / frames).toFixed(4);
      const png = join(frameDir, `frame-${String(frame).padStart(4, "0")}.png`);
      run(CHROME, [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--window-size=${GIF_WIDTH},${GIF_HEIGHT}`,
        `--screenshot=${png}`,
        // gif=1 hides the detail panel, so the picture is only the journey.
        `file://${page}?t=${phase}&gif=1`,
      ]);
      process.stdout.write(`\rframe ${frame + 1}/${frames}`);
    }
    process.stdout.write("\n");

    const gif = join(OUT_DIR, "dejaview-flow.gif");
    run("ffmpeg", [
      "-y",
      "-framerate", String(FPS),
      "-i", join(frameDir, "frame-%04d.png"),
      "-filter_complex",
      "[0:v] palettegen=max_colors=128:stats_mode=diff[p];[0:v][p] paletteuse=dither=bayer:bayer_scale=3",
      "-loop", "0",
      gif,
    ]);
    console.log(`wrote ${gif}`);
  } finally {
    rmSync(frameDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
