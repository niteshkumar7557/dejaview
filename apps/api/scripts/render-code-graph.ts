// Builds the knowledge graph: which file is connected to what, and which discussion went where.
//
// Two kinds of edges, both real:
//
//   - our source files importing each other (read out of the TypeScript imports)
//   - a discussion pointing at a file in CPython (found by the linker's reference parser,
//     the same one the PR bot uses)
//
// Every edge says how it was found, the way idea.md §8 asks for, so a reader can tell a real
// dependency from an inferred one.
//
//   npm run render-code-graph -w @dejaview/api
//
// It writes three files:
//   docs/team/dejaview-graph.html  the interactive page
//   docs/team/dejaview-graph.gif   the animation for the pull request
//   docs/team/dejaview-graph.json  the graph itself, one list of edges

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findReferences } from "@dejaview/linker";
import type { ThreadPost } from "@dejaview/shared";

const API_URL = process.env.DEJAVIEW_API_URL ?? "http://localhost:3001";
const OUT_DIR = fileURLToPath(new URL("../../../docs/team/", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const GIF_WIDTH = 1400;
const GIF_HEIGHT = 900;
/** The whole page is taller than the graph, so the window is taller too. */
const PAGE_HEIGHT = 1160;
const FPS = 8;
const SECONDS = 7;

const SOURCE_ROOTS = ["apps", "packages", "db", "scripts"];
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build", "coverage", ".git"]);

interface FileNode {
  id: string;
  path: string;
  workspace: string;
  lines: number;
  kind: "source" | "test" | "script";
}

interface Edge {
  from: string;
  to: string;
  /** How the edge was found: inside the same package, across packages, or a mention. */
  kind: "RELATIVE" | "WORKSPACE" | "MENTIONS";
  /** True when the import only brings in types, so there is no runtime dependency. */
  typeOnly: boolean;
  detail: string;
}

interface Discussion {
  slug: string;
  title: string;
  posts: number;
  authors: number;
  /** The CPython files this discussion points at. */
  mentions: { path: string; post: number; author: string }[];
  symbols: { symbol: string; post: number }[];
  issues: { ref: string; post: number }[];
}

// ── Read our own source files and their imports ───────────────────────────────────────────────

function walk(dir: string, out: string[] = []): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) walk(path, out);
    else if ([".ts", ".tsx"].includes(extname(path)) && !path.endsWith(".d.ts")) out.push(path);
  }
  return out;
}

function workspaceOf(path: string): string {
  const parts = relative(REPO_ROOT, path).split("/");
  if (parts[0] === "packages" || parts[0] === "apps") return `${parts[0]}/${parts[1]}`;
  if (parts[0] === "db") return "db";
  return "scripts";
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/g;
const BARE_IMPORT_RE = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;

function resolveRelative(fromFile: string, specifier: string): string | null {
  const withoutExtension = specifier.replace(/\.(js|jsx|mjs)$/, "");
  const base = resolve(dirname(fromFile), withoutExtension);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** The file a workspace import points at: the package's own entry point. */
function workspaceEntry(name: string): string | null {
  // Most workspaces live under packages/, but the data one lives at the root.
  const folders = [join(REPO_ROOT, "packages", name), join(REPO_ROOT, name)];
  for (const folder of folders) {
    for (const candidate of [join(folder, "src", "index.ts"), join(folder, "src", "index.tsx")]) {
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

interface Scan {
  nodes: Map<string, FileNode>;
  edges: Edge[];
  externals: Map<string, string[]>;
}

function scanCode(): Scan {
  const files: string[] = [];
  for (const root of SOURCE_ROOTS) walk(join(REPO_ROOT, root), files);

  const nodes = new Map<string, FileNode>();
  for (const file of files) {
    const id = relative(REPO_ROOT, file);
    const isTest = id.includes(".test.") || id.includes("/tests/");
    const isScript = id.startsWith("scripts/") || id.includes("/scripts/");
    nodes.set(id, {
      id,
      path: file,
      workspace: workspaceOf(file),
      lines: readFileSync(file, "utf8").split("\n").length,
      kind: isTest ? "test" : isScript ? "script" : "source",
    });
  }

  const edges: Edge[] = [];
  const externals = new Map<string, string[]>();

  for (const node of nodes.values()) {
    if (node.kind !== "source") continue;
    const text = readFileSync(node.path, "utf8");
    for (const match of text.matchAll(IMPORT_RE)) {
      const typeOnly = Boolean(match[1]);
      const specifier = match[2] ?? "";
      if (specifier.startsWith(".")) {
        const target = resolveRelative(node.path, specifier);
        if (!target) continue;
        const targetId = relative(REPO_ROOT, target);
        if (!nodes.has(targetId)) continue;
        edges.push({
          from: node.id,
          to: targetId,
          kind: "RELATIVE",
          typeOnly,
          detail: specifier,
        });
        continue;
      }
      if (specifier.startsWith("@dejaview/")) {
        const name = specifier.slice("@dejaview/".length);
        const target = workspaceEntry(name);
        if (!target) continue;
        const targetId = relative(REPO_ROOT, target);
        if (!nodes.has(targetId)) continue;
        edges.push({
          from: node.id,
          to: targetId,
          kind: "WORKSPACE",
          typeOnly,
          detail: specifier,
        });
        continue;
      }
      if (specifier.startsWith("node:")) continue;
      const packageName = specifier.startsWith("@")
        ? specifier.split("/").slice(0, 2).join("/")
        : (specifier.split("/")[0] ?? specifier);
      const list = externals.get(packageName) ?? [];
      list.push(specifier);
      externals.set(packageName, list);
    }
  }

  return { nodes, edges, externals };
}

// ── Read the discussions and what they point at ───────────────────────────────────────────────

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error(`GET ${path} answered ${response.status}`);
  return response.json();
}

async function collectDiscussions(): Promise<Discussion[]> {
  const topics = (await getJson("/api/topics")) as {
    slug: string;
    title: string;
    sourceCount: number;
  }[];

  const discussions: Discussion[] = [];
  for (const topic of topics) {
    const posts = (await getJson(`/api/topics/${topic.slug}/timeline`)) as {
      id: number;
      author: string;
      bodyClean: string;
    }[];

    const mentions: Discussion["mentions"] = [];
    const symbols: Discussion["symbols"] = [];
    const issues: Discussion["issues"] = [];

    for (const post of posts) {
      const asPost: ThreadPost = {
        id: post.id,
        externalId: String(post.id),
        author: post.author,
        createdAt: null,
        url: null,
        body: post.bodyClean,
        format: "text",
        replyToId: null,
      };
      for (const reference of findReferences(asPost)) {
        if (reference.type === "path") {
          mentions.push({ path: reference.path, post: post.id, author: post.author });
        } else if (reference.type === "symbol") {
          symbols.push({ symbol: reference.symbol, post: post.id });
        } else if (reference.type === "issue") {
          issues.push({ ref: `${reference.prefix}-${reference.number}`, post: post.id });
        } else if (reference.type === "commit") {
          issues.push({ ref: reference.sha.slice(0, 10), post: post.id });
        } else if (reference.type === "github_url") {
          issues.push({
            ref: `${reference.repository}#${reference.referenceType === "pull" ? "pull" : "issues"}/${reference.number}`,
            post: post.id,
          });
        } else if (reference.type === "repository") {
          issues.push({ ref: `${reference.repository}#${reference.number}`, post: post.id });
        }
      }
    }

    discussions.push({
      slug: topic.slug,
      title: topic.title,
      posts: posts.length,
      authors: new Set(posts.map((post) => post.author)).size,
      mentions: mentions.slice(0, 40),
      symbols: symbols.slice(0, 30),
      issues: issues.slice(0, 20),
    });
  }
  return discussions;
}

// ── The layout ────────────────────────────────────────────────────────────────────────────────

interface Positioned {
  id: string;
  x: number;
  y: number;
  r: number;
  column: number;
}

/** Workspaces in dependency order, so the edges mostly flow to the right. */
function workspaceOrder(scan: Scan): string[] {
  const deps = new Map<string, Set<string>>();
  for (const node of scan.nodes.values()) {
    if (node.kind !== "source") continue;
    if (!deps.has(node.workspace)) deps.set(node.workspace, new Set());
  }
  for (const edge of scan.edges) {
    const from = scan.nodes.get(edge.from);
    const to = scan.nodes.get(edge.to);
    if (!from || !to) continue;
    if (from.workspace === to.workspace) continue;
    deps.get(from.workspace)?.add(to.workspace);
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string, trail: Set<string>) => {
    if (seen.has(name) || trail.has(name)) return;
    trail.add(name);
    for (const dependency of deps.get(name) ?? []) visit(dependency, trail);
    trail.delete(name);
    if (!seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  };
  for (const name of deps.keys()) visit(name, new Set());
  return ordered;
}

function layout(scan: Scan, discussions: Discussion[]): {
  positions: Map<string, Positioned>;
  columns: { name: string; x: number; width: number }[];
} {
  const workspaces = workspaceOrder(scan);
  const columnWidth = 168;
  const gap = 46;
  const leftPad = 178;

  const columns: { name: string; x: number; width: number }[] = [];
  let x = leftPad;
  for (const workspace of workspaces) {
    columns.push({ name: workspace, x, width: columnWidth });
    x += columnWidth + gap;
  }

  const positions = new Map<string, Positioned>();
  for (const [index, column] of columns.entries()) {
    const files = [...scan.nodes.values()]
      .filter((node) => node.workspace === column.name && node.kind === "source")
      .sort((a, b) => b.lines - a.lines);
    const step = Math.min(34, (GIF_HEIGHT - 300) / Math.max(1, files.length));
    files.forEach((node, position) => {
      positions.set(node.id, {
        id: node.id,
        x: column.x + columnWidth / 2,
        y: 150 + position * step,
        r: Math.max(4, Math.min(11, 3 + node.lines / 40)),
        column: index,
      });
    });
  }

  // The discussions sit in their own column on the left.
  discussions.forEach((discussion, index) => {
    positions.set(`discussion:${discussion.slug}`, {
      id: `discussion:${discussion.slug}`,
      x: 74,
      y: 150 + index * 64,
      r: 15,
      column: -1,
    });
  });

  return { positions, columns };
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── The page ──────────────────────────────────────────────────────────────────────────────────

function page(
  scan: Scan,
  discussions: Discussion[],
  positions: Map<string, Positioned>,
  columns: { name: string; x: number; width: number }[],
  meta: Record<string, string>,
): string {
  const data = JSON.stringify({
    nodes: [...scan.nodes.values()].map((node) => ({
      id: node.id,
      workspace: node.workspace,
      lines: node.lines,
      kind: node.kind,
      externals: scan.externals.get(node.id.split("/").pop() ?? "") ?? [],
    })),
    edges: scan.edges,
    discussions,
    positions: [...positions.values()],
    columns,
    meta,
  });

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DejaView — the knowledge graph</title>
<style>
  :root { --ink:#14161a; --muted:#5b616b; --line:#dfe3e8; --gold:#b4860b; }
  * { box-sizing: border-box; }
  body { margin:0; background:#fbfbfc; color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; -webkit-font-smoothing:antialiased; }
  .page { max-width:1600px; margin:0 auto; padding:30px 28px 50px; }
  .kicker { font-size:12px; font-weight:700; letter-spacing:.15em; text-transform:uppercase; color:var(--gold); }
  h1 { font-size:28px; line-height:1.2; margin:7px 0 6px; letter-spacing:-.02em; }
  .lead { font-size:15px; line-height:1.55; color:var(--muted); margin:0 0 18px; max-width:900px; }
  .bar { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:14px; }
  button.tab { font:inherit; font-size:13.5px; font-weight:600; padding:8px 15px; border-radius:9px; border:1px solid var(--line); background:#fff; color:var(--muted); cursor:pointer; }
  button.tab[aria-pressed="true"] { background:#14161a; border-color:#14161a; color:#fff; }
  .legend { display:flex; gap:15px; flex-wrap:wrap; font-size:12.5px; color:var(--muted); margin-left:auto; }
  .legend i { display:inline-block; width:22px; height:0; border-top:2px solid; vertical-align:4px; margin-right:5px; }
  .wrap { position:relative; border:1px solid var(--line); border-radius:13px; background:#fff; overflow:hidden; }
  svg { display:block; width:100%; height:auto; }
  .panel { display:grid; grid-template-columns:1fr 1fr; gap:0; border:1px solid var(--line); border-radius:13px; margin-top:16px; overflow:hidden; background:#fff; }
  .panel > div { padding:16px 20px; }
  .panel > div + div { border-left:1px solid var(--line); background:#fbfbfc; }
  .panel h3 { margin:0 0 4px; font-size:16px; }
  .panel .sub { font-size:13px; color:var(--muted); margin:0 0 12px; }
  .panel ul { list-style:none; margin:0; padding:0; }
  .panel li { font-size:13px; padding:3px 0; }
  .panel code { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; background:#f1f2f4; padding:1px 5px; border-radius:4px; }
  .tag { display:inline-block; font-size:10.5px; font-weight:700; letter-spacing:.06em; padding:1px 6px; border-radius:5px; margin-right:6px; }
  .t-RELATIVE { background:#eef4fd; color:#1b4d91; }
  .t-WORKSPACE { background:#eef8f1; color:#1c6a3c; }
  .t-TYPE_ONLY { background:#f4eefb; color:#6b3fa0; }
  .t-MENTIONS { background:#fdf3d7; color:#7a5c12; }
  .facts { display:grid; grid-template-columns:auto 1fr; gap:5px 12px; font-size:13px; }
  .facts dt { color:var(--muted); }
  .facts dd { margin:0; font-weight:600; }
  .foot { margin-top:16px; font-size:12px; color:#8a9099; }
  @media (max-width:900px) { .panel { grid-template-columns:1fr; } .panel > div + div { border-left:none; border-top:1px solid var(--line); } }
</style></head><body>
<div class="page">
  <div class="kicker">DejaView &middot; the knowledge graph</div>
  <h1>Which file is connected to what, and which discussion went where</h1>
  <p class="lead">Every line below is real. The blue and green lines are our own files importing each
    other, read straight out of the TypeScript. The gold lines are the discussions pointing at a file
    in CPython, found by the same reference parser the pull request bot uses. Click anything.</p>

  <div class="bar">
    <button class="tab" id="tab-code" aria-pressed="true">Our code</button>
    <button class="tab" id="tab-disc" aria-pressed="false">The discussions</button>
    <div class="legend">
      <span><i style="border-color:#7fa8e0"></i>imports (same package)</span>
      <span><i style="border-color:#6fbd8c"></i>imports (another package)</span>
      <span><i style="border-color:#a583d1;border-top-style:dashed"></i>types only</span>
      <span><i style="border-color:#d9a520"></i>a discussion points here</span>
    </div>
  </div>

  <div class="wrap"><svg id="graph" viewBox="0 0 ${GIF_WIDTH} ${GIF_HEIGHT}"></svg></div>
  <div class="panel" id="panel"></div>
  <div class="foot" id="foot"></div>
</div>

<script>
const DATA = ${data};
const svg = document.getElementById("graph");
const panel = document.getElementById("panel");
const NS = "http://www.w3.org/2000/svg";
const pos = new Map(DATA.positions.map((p) => [p.id, p]));
let view = "code";
let selected = null;

function el(tag, attrs, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
function escapeText(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function edgesForView() {
  if (view === "code") return DATA.edges;
  const out = [];
  for (const discussion of DATA.discussions) {
    for (const mention of discussion.mentions) {
      out.push({ from: "discussion:" + discussion.slug, to: "cpython:" + mention.path, kind: "MENTIONS", typeOnly: false, detail: mention.path + " (post #" + mention.post + ")" });
    }
  }
  return out;
}

let phase = 1;
function draw() {
  svg.innerHTML = "";
  const edges = edgesForView();

  if (view === "code") {
    for (const column of DATA.columns) {
      svg.appendChild(el("text", { x: column.x + column.width / 2, y: 122, "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: "#8a9099" }, column.name));
      svg.appendChild(el("line", { x1: column.x + column.width / 2, y1: 130, x2: column.x + column.width / 2, y2: ${GIF_HEIGHT} - 24, stroke: "#eef0f3" }));
    }
  }

  const cpython = new Map();
  if (view === "disc") {
    const discussion = DATA.discussions[0];
    const seen = new Set();
    for (const edge of edges) {
      const key = edge.to;
      if (seen.has(key)) continue;
      seen.add(key);
      const rows = DATA.discussions.filter((d) => d.mentions.some((m) => "cpython:" + m.path === key));
      const y = 150 + cpython.size * 30;
      cpython.set(key, { x: 640, y, name: key.replace("cpython:", "") });
    }
  }

  for (const edge of edges) {
    const from = pos.get(edge.from) ?? cpython.get(edge.from);
    const to = pos.get(edge.to) ?? cpython.get(edge.to);
    if (!from || !to) continue;
    const mid = (from.x + to.x) / 2;
    const stroke = edge.kind === "WORKSPACE" ? "#6fbd8c" : edge.kind === "MENTIONS" ? "#d9a520" : "#7fa8e0";
    const path = el("path", {
      d: "M" + from.x + "," + from.y + " C" + mid + "," + from.y + " " + mid + "," + to.y + " " + to.x + "," + to.y,
      fill: "none", stroke, "stroke-width": edge.kind === "MENTIONS" ? 1.8 : 1,
      "stroke-opacity": edge.kind === "MENTIONS" ? 0.65 : 0.3,
      "stroke-dasharray": edge.typeOnly ? "4 4" : "none",
    });
    svg.appendChild(path);
  }

  for (const node of DATA.positions) {
    if (view === "disc" && node.column !== -1) continue;
    // In the animation the columns light up one after another.
    const appears = node.column < 0 ? phase > 0.04 : phase > 0.06 + node.column * 0.1;
    if (!appears) continue;
    const isDiscussion = node.id.startsWith("discussion:");
    const group = el("g", { style: "cursor:pointer" });
    group.setAttribute("opacity", String(Math.max(0.25, Math.min(1, (phase - 0.06 - Math.max(0, node.column) * 0.1) * 6))));
    group.appendChild(el("circle", {
      cx: node.x, cy: node.y, r: node.r,
      fill: isDiscussion ? "#fdf3d7" : "#eef4fd",
      stroke: isDiscussion ? "#d9a520" : "#7fa8e0",
      "stroke-width": selected === node.id ? 3 : 1.4,
    }));
    const isEntry = node.id.endsWith("/index.ts");
    const isBig = node.r >= 7.5;
    if (isEntry || isBig || isDiscussion) {
      const label = isDiscussion
        ? node.id.replace("discussion:", "")
        : node.id.split("/").slice(-1)[0] ?? node.id;
      group.appendChild(el("text", {
        x: node.x + node.r + 5,
        y: node.y + 4,
        "font-size": isDiscussion ? 12 : 10.5,
        "font-weight": isEntry || isDiscussion ? 700 : 500,
        fill: isDiscussion ? "#7a5c12" : isEntry ? "#1b4d91" : "#6b7280",
      }, label.length > 22 ? label.slice(0, 21) + "…" : label));
    }
    group.appendChild(el("title", {}, node.id.replace("discussion:", "")));
    group.addEventListener("click", () => { selected = node.id; draw(); show(node.id); });
    svg.appendChild(group);
  }

  if (view === "disc") {
    for (const [key, place] of cpython) {
      const group = el("g", { style: "cursor:pointer" });
      group.appendChild(el("circle", { cx: place.x, cy: place.y, r: 5, fill: "#fdf3d7", stroke: "#d9a520", "stroke-width": selected === key ? 3 : 1.4 }));
      group.appendChild(el("text", { x: place.x + 12, y: place.y + 4, "font-size": 11.5, fill: "#5b616b" }, place.name));
      group.addEventListener("click", () => { selected = key; draw(); show(key); });
      svg.appendChild(group);
    }
    svg.appendChild(el("text", { x: 640, y: 122, "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: "#8a9099" }, "the files the discussions point at"));
  }
}

function show(id) {
  if (id.startsWith("discussion:")) {
    const slug = id.replace("discussion:", "");
    const discussion = DATA.discussions.find((d) => d.slug === slug);
    if (!discussion) return;
    const files = discussion.mentions.map((m) => "<li><code>" + escapeText(m.path) + "</code> &middot; post #" + m.post + " by " + escapeText(m.author) + "</li>").join("");
    const symbols = discussion.symbols.map((s) => "<li><code>" + escapeText(s.symbol) + "</code> &middot; post #" + s.post + "</li>").join("");
    const issues = discussion.issues.map((i) => "<li><code>" + escapeText(i.ref) + "</code> &middot; post #" + i.post + "</li>").join("");
    panel.innerHTML =
      "<div><h3>" + escapeText(discussion.title) + "</h3><p class=\\"sub\\">" + discussion.posts + " posts by " + discussion.authors + " authors</p>" +
      "<dl class=\\"facts\\"><dt>Slug</dt><dd>" + escapeText(discussion.slug) + "</dd>" +
      "<dt>Files it points at</dt><dd>" + discussion.mentions.length + "</dd>" +
      "<dt>Symbols</dt><dd>" + discussion.symbols.length + "</dd>" +
      "<dt>Issue or commit references</dt><dd>" + discussion.issues.length + "</dd></dl></div>" +
      "<div><h3>What it points at</h3><ul>" + (files || "<li>nothing found</li>") +
      (symbols ? "</ul><h3>Symbols</h3><ul>" + symbols : "") +
      (issues ? "</ul><h3>Issues and commits</h3><ul>" + issues : "") + "</ul></div>";
    return;
  }
  if (id.startsWith("cpython:")) {
    const path = id.replace("cpython:", "");
    panel.innerHTML =
      "<div><h3>" + escapeText(path) + "</h3><p class=\\"sub\\">A file in CPython that the discussions point at</p></div>" +
      "<div><h3>Who points at it</h3><ul>" + DATA.discussions.filter((d) => d.mentions.some((m) => m.path === path)).map((d) => "<li>" + escapeText(d.slug) + "</li>").join("") + "</ul></div>";
    return;
  }
  const node = DATA.nodes.find((n) => n.id === id);
  if (!node) return;
  const outgoing = DATA.edges.filter((e) => e.from === id);
  const incoming = DATA.edges.filter((e) => e.to === id);
  const row = (edge, other) =>
    "<li><span class=\\"tag t-" + edge.kind + "\\">" + edge.kind + "</span><code>" + escapeText(other) + "</code></li>";
  panel.innerHTML =
    "<div><h3>" + escapeText(node.id) + "</h3><p class=\\"sub\\">" + node.workspace + " &middot; " + node.lines + " lines</p>" +
    "<dl class=\\"facts\\"><dt>Workspace</dt><dd>" + escapeText(node.workspace) + "</dd>" +
    "<dt>Imports</dt><dd>" + outgoing.length + "</dd>" +
    "<dt>Imported by</dt><dd>" + incoming.length + "</dd></dl></div>" +
    "<div><h3>Imports</h3><ul>" + (outgoing.map((e) => row(e, DATA.nodes.find((n) => n.id === e.to)?.id ?? e.to)).join("") || "<li>nothing</li>") + "</ul>" +
    "<h3>Imported by</h3><ul>" + (incoming.map((e) => row(e, DATA.nodes.find((n) => n.id === e.from)?.id ?? e.from)).join("") || "<li>nothing</li>") + "</ul></div>";
}

document.getElementById("tab-code").addEventListener("click", () => {
  view = "code"; selected = null;
  document.getElementById("tab-code").setAttribute("aria-pressed", "true");
  document.getElementById("tab-disc").setAttribute("aria-pressed", "false");
  draw();
});
document.getElementById("tab-disc").addEventListener("click", () => {
  view = "disc"; selected = null;
  document.getElementById("tab-disc").setAttribute("aria-pressed", "true");
  document.getElementById("tab-code").setAttribute("aria-pressed", "false");
  draw();
});

document.getElementById("foot").textContent =
  DATA.meta.files + " source files, " + DATA.meta.edges + " import edges, " +
  DATA.meta.discussions + " discussions. Generated " + DATA.meta.generatedAt +
  " by npm run render-code-graph -w @dejaview/api";
window.__drawn = svg.childNodes.length;

const params = new URLSearchParams(location.search);
const still = params.get("t");
if (still !== null) {
  phase = Math.max(0, Math.min(0.999, Number(still)));
  draw();
} else {
  draw();
}
const first = DATA.discussions[0];
if (first) show("discussion:" + first.slug);
</script>
</body></html>`;
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  const scan = scanCode();
  const discussions = await collectDiscussions();
  const { positions, columns } = layout(scan, discussions);

  const meta = {
    files: String(scan.nodes.size),
    edges: String(scan.edges.length),
    discussions: String(discussions.length),
    generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
  };

  const json = {
    meta,
    nodes: [...scan.nodes.values()].map((node) => ({
      id: node.id,
      workspace: node.workspace,
      lines: node.lines,
      kind: node.kind,
    })),
    edges: scan.edges,
    discussions: discussions.map((discussion) => ({
      slug: discussion.slug,
      title: discussion.title,
      posts: discussion.posts,
      authors: discussion.authors,
      mentions: discussion.mentions,
      symbols: discussion.symbols,
      issues: discussion.issues,
    })),
  };
  writeFileSync(join(OUT_DIR, "dejaview-graph.json"), `${JSON.stringify(json, null, 2)}\n`, "utf8");
  console.log(`wrote ${join(OUT_DIR, "dejaview-graph.json")}`);

  const htmlPath = join(OUT_DIR, "dejaview-graph.html");
  writeFileSync(htmlPath, page(scan, discussions, positions, columns, meta), "utf8");
  console.log(`wrote ${htmlPath}`);

  if (process.env.SKIP_GIF === "1") {
    console.log("SKIP_GIF=1, so the animation was not made");
    return;
  }

  // The animation: the graph draws itself, column by column.
  const frames = Math.round(FPS * SECONDS);
  const frameDir = mkdtempSync(join(tmpdir(), "dejaview-graph-"));
  try {
    for (let frame = 0; frame < frames; frame += 1) {
      const phase = (frame / frames).toFixed(4);
      const png = join(frameDir, `frame-${String(frame).padStart(4, "0")}.png`);
      run(CHROME, [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--window-size=${GIF_WIDTH},${PAGE_HEIGHT}`,
        `--screenshot=${png}`,
        `file://${htmlPath}?t=${phase}`,
      ]);
      process.stdout.write(`\rframe ${frame + 1}/${frames}`);
    }
    process.stdout.write("\n");
    const gif = join(OUT_DIR, "dejaview-graph.gif");
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

function run(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    cwd: REPO_ROOT,
  });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
