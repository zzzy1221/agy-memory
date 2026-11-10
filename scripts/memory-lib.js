"use strict";
/**
 * agy-memory · 存储层
 * 纯 Node 标准库，无第三方依赖。
 *
 * 轨道（对应 dsh-memory-evolve 的分层）：
 *   MEMORY.md                全局事实（跨项目）
 *   USER.md                  用户档案
 *   projects/<slug>.md       项目日志
 *   projects/<slug>.key.md   项目关键记忆（每轮注入）
 *   daily/<YYYY-MM-DD>.md    每日日志
 *   suggestions.jsonl        待确认的关键记忆队列
 *   archive/                 归档（删除条目的原文，可逆）
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");

const HOME = process.env.AGY_MEMORY_HOME || path.join(os.homedir(), ".antigravity-memory");

const F = {
  memory: path.join(HOME, "MEMORY.md"),
  user: path.join(HOME, "USER.md"),
  suggestions: path.join(HOME, "suggestions.jsonl"),
  state: path.join(HOME, "state", "inject.json"),
  daily: (d) => path.join(HOME, "daily", `${d}.md`),
  project: (s) => path.join(HOME, "projects", `${s}.md`),
  projectKey: (s) => path.join(HOME, "projects", `${s}.key.md`),
  archive: (n) => path.join(HOME, "archive", n),
};

const TRACKS = ["memory", "user", "project", "key", "daily"];

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function read(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}

/** 工作区路径 → 稳定的项目 slug：目录名 + 路径短哈希 */
function slug(workspacePath) {
  if (!workspacePath) return "global";
  const norm = path.resolve(String(workspacePath)).replace(/[\\/]+$/, "");
  const base = path.basename(norm).replace(/[^\w\u4e00-\u9fa5.-]+/g, "-").slice(0, 40) || "project";
  const h = crypto.createHash("sha1").update(norm.toLowerCase()).digest("hex").slice(0, 6);
  return `${base}-${h}`;
}

/** 解析 `- [YYYY-MM-DD] 内容` 形式的条目（续行缩进两格） */
function parseEntries(text) {
  const out = [];
  let cur = null;
  for (const line of String(text || "").split(/\r?\n/)) {
    const m = /^- \[(\d{4}-\d{2}-\d{2})\]\s?(.*)$/.exec(line);
    if (m) {
      if (cur) out.push(cur);
      cur = { date: m[1], lines: [m[2]] };
    } else if (cur) {
      if (!line.trim()) {
        cur.lines.push("");
      } else {
        cur.lines.push(line.replace(/^\s{1,2}/, ""));
      }
    }
  }
  if (cur) out.push(cur);
  return out
    .map((e) => ({ date: e.date, text: e.lines.join("\n").replace(/\s+$/, ""), raw: null }))
    .filter((e) => e.text)
    .map((e) => ({ ...e, raw: formatEntry(e.date, e.text) }));
}

function formatEntry(date, text) {
  const lines = String(text).split(/\r?\n/);
  const head = `- [${date}] ${lines[0]}`;
  const rest = lines.slice(1).map((l) => (l.trim() ? `  ${l}` : ""));
  return [head, ...rest].join("\n");
}

function appendRaw(p, block) {
  ensureDir(path.dirname(p));
  let body = read(p);
  if (body && !body.endsWith("\n")) body += "\n";
  if (!body) body = `# ${path.basename(p, ".md")}\n\n`;
  body += block.replace(/\s+$/, "") + "\n";
  fs.writeFileSync(p, body, "utf8");
}

function appendEntry(p, text, date) {
  const block = formatEntry(date || today(), text);
  appendRaw(p, block);
  return block;
}

/** 轨道解析：返回 {file, entries} */
function trackFile(track, opts = {}) {
  const s = opts.projectSlug || slug(opts.projectPath);
  switch (track) {
    case "memory":
      return F.memory;
    case "user":
      return F.user;
    case "project":
      return F.project(s);
    case "key":
      return F.projectKey(s);
    case "daily":
      return F.daily(opts.date || today());
    default:
      throw new Error(`未知轨道: ${track}（可用: ${TRACKS.join(" / ")}）`);
  }
}

function listEntries(track, opts = {}) {
  const file = trackFile(track, opts);
  return parseEntries(read(file)).map((e) => ({ ...e, file, track }));
}

/** 唯一的子串匹配 → 移除该条目并归档 */
function removeEntry(track, match, opts = {}) {
  const file = trackFile(track, opts);
  const entries = parseEntries(read(file));
  const hits = entries.filter((e) => e.text.includes(match));
  if (!hits.length) return { removed: 0, reason: "没有条目包含这段文字" };
  if (hits.length > 1) {
    return {
      removed: 0,
      reason: `${hits.length} 条都包含这段文字，需要更精确的匹配片段`,
      candidates: hits.slice(0, 5).map((e) => e.text.split("\n")[0].slice(0, 60)),
    };
  }
  const keep = entries.filter((e) => e !== hits[0]);
  ensureDir(path.dirname(file));
  const header = `# ${path.basename(file, ".md")}\n\n`;
  fs.writeFileSync(file, header + (keep.length ? keep.map((e) => e.raw).join("\n") + "\n" : ""), "utf8");
  ensureDir(path.join(HOME, "archive"));
  appendRaw(F.archive(`${path.basename(file, ".md")}-archive.md`), hits[0].raw);
  return { removed: 1, archivedTo: F.archive(`${path.basename(file, ".md")}-archive.md`), entry: hits[0].text };
}

/** 跨轨搜索：关键字命中，返回 文件 / 行号 / 命中行 */
function search(query, opts = {}) {
  const q = String(query || "").trim();
  if (!q) throw new Error("query 不能为空");
  const needle = q.toLowerCase();
  const tracks = opts.tracks && opts.tracks.length ? opts.tracks : TRACKS;
  const limit = Math.min(Number(opts.limit) || 20, 60);
  const hits = [];

  const scan = (label, file) => {
    const text = read(file);
    if (!text) return;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (hits.length >= limit) return;
      if (line.toLowerCase().includes(needle)) {
        hits.push({
          track: label,
          file,
          line: i + 1,
          text: line.trim().slice(0, 240),
        });
      }
    });
  };

  if (tracks.includes("memory")) scan("memory", F.memory);
  if (tracks.includes("user")) scan("user", F.user);
  if (tracks.includes("key")) scan("key", trackFile("key", opts));
  if (tracks.includes("project")) scan("project", trackFile("project", opts));
  if (tracks.includes("daily")) {
    const dir = path.join(HOME, "daily");
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().reverse();
    } catch {}
    for (const f of files) {
      if (opts.days) {
        const cutoff = new Date(Date.now() - Number(opts.days) * 86400000).toISOString().slice(0, 10);
        if (f.replace(".md", "") < cutoff) break;
      }
      scan("daily", path.join(dir, f));
    }
  }
  return hits;
}

/** 关键记忆：写进待确认队列（对齐 dsh 的 target=key 门禁） */
function suggestKey({ content, summary, projectSlug, projectPath }) {
  const s = projectSlug || slug(projectPath);
  const item = {
    id: crypto.randomBytes(4).toString("hex"),
    project: s,
    content: String(content || "").trim(),
    summary: (summary || String(content || "").split(/\r?\n/)[0]).slice(0, 120),
    at: new Date().toISOString(),
    status: "pending",
  };
  if (!item.content) throw new Error("content 不能为空");
  ensureDir(path.dirname(F.suggestions));
  fs.appendFileSync(F.suggestions, JSON.stringify(item) + "\n", "utf8");
  return item;
}

function listSuggestions(projectSlug) {
  const lines = read(F.suggestions).split(/\r?\n/).filter(Boolean);
  const items = [];
  for (const line of lines) {
    try {
      const o = JSON.parse(line);
      if (o.status === "pending" && (!projectSlug || o.project === projectSlug)) items.push(o);
    } catch {}
  }
  return items;
}

function rewriteSuggestions(mutate) {
  const lines = read(F.suggestions).split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      out.push(mutate(JSON.parse(line)));
    } catch {
      out.push(null);
    }
  }
  ensureDir(path.dirname(F.suggestions));
  fs.writeFileSync(F.suggestions, out.filter(Boolean).map((o) => JSON.stringify(o)).join("\n") + (out.length ? "\n" : ""), "utf8");
}

/** 确认一条待定关键记忆 → 写进 projects/<slug>.key.md */
function promoteKey(match, opts = {}) {
  const s = opts.projectSlug || slug(opts.projectPath);
  const pending = listSuggestions();
  const hits = pending.filter((o) => o.id === match || o.content.includes(match) || o.summary.includes(match));
  if (!hits.length) return { promoted: 0, reason: "没有匹配的待确认条目" };
  if (hits.length > 1) return { promoted: 0, reason: "匹配到多条，给 id 或更精确的片段", candidates: hits.map((o) => ({ id: o.id, summary: o.summary })) };
  const item = hits[0];
  appendEntry(F.projectKey(item.project || s), item.content);
  rewriteSuggestions((o) => (o.id === item.id ? { ...o, status: "confirmed", confirmedAt: new Date().toISOString() } : o));
  return { promoted: 1, id: item.id, into: F.projectKey(item.project || s) };
}

function dropSuggestion(id) {
  const target = listSuggestions().find((o) => o.id === id);
  if (!target) return { dropped: 0, reason: `没有 id=${id} 的待确认条目` };
  rewriteSuggestions((o) => (o.id === id ? { ...o, status: "dropped", droppedAt: new Date().toISOString() } : o));
  return { dropped: 1, id, summary: target.summary };
}

function counts(projectSlug) {
  const s = projectSlug;
  let dailyFiles = 0;
  try {
    dailyFiles = fs.readdirSync(path.join(HOME, "daily")).filter((f) => f.endsWith(".md")).length;
  } catch {}
  return {
    home: HOME,
    memory: parseEntries(read(F.memory)).length,
    user: parseEntries(read(F.user)).length,
    projectLog: parseEntries(read(F.project(s))).length,
    projectKey: parseEntries(read(F.projectKey(s))).length,
    today: parseEntries(read(F.daily(today()))).length,
    dailyFiles,
    pendingSuggestions: listSuggestions().length,
  };
}

/* ---------- 上下文注入 ---------- */

function tail(entries, budget) {
  const picked = [];
  let used = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const cost = entries[i].raw.length + 1;
    if (used + cost > budget) break;
    picked.unshift(entries[i]);
    used += cost;
  }
  const omitted = entries.length - picked.length;
  return { picked: picked.map((e) => e.raw).join("\n"), omitted };
}

function buildContext(opts = {}) {
  const s = opts.projectSlug || slug(opts.projectPath);
  const budget = Number(opts.budget) || 7000;
  const userName = opts.workspaceName || "本项目";

  const sections = [];
  const add = (title, entries, cap) => {
    if (!entries.length) return;
    const { picked, omitted } = tail(entries, cap);
    sections.push(`### ${title}\n${picked}${omitted > 0 ? `\n（另有 ${omitted} 条较早条目未展开，用 memory_search 查）` : ""}`);
  };

  add("全局（MEMORY.md）", parseEntries(read(F.memory)), Math.round(budget * 0.26));
  add("用户（USER.md）", parseEntries(read(F.user)), Math.round(budget * 0.16));
  add(`本项目关键 · ${userName}`, parseEntries(read(F.projectKey(s))), Math.round(budget * 0.32));
  add("今天", parseEntries(read(F.daily(today()))), Math.round(budget * 0.18));

  if (!sections.length) return { text: "", hash: "empty", counts: counts(s) };

  const body = [
    "## 长期记忆 · agy-memory（本机记忆库，跨会话有效）",
    "",
    sections.join("\n\n"),
    "",
    "> 收尾时用 memory_add 写 1 条 daily；长期约定/架构/踩坑先走 target=key 进待确认队列，别直接改注入内容。",
  ].join("\n");

  const hash = crypto.createHash("sha1").update(body).digest("hex").slice(0, 12);
  return { text: body, hash, counts: counts(s) };
}

function readState() {
  return readJson(F.state, {});
}

function writeState(obj) {
  writeJson(F.state, obj);
}

module.exports = {
  HOME,
  F,
  TRACKS,
  today,
  slug,
  parseEntries,
  formatEntry,
  appendEntry,
  trackFile,
  listEntries,
  removeEntry,
  search,
  suggestKey,
  listSuggestions,
  promoteKey,
  dropSuggestion,
  counts,
  buildContext,
  readState,
  writeState,
  read,
  ensureDir,
};
