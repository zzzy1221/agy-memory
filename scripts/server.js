#!/usr/bin/env node
"use strict";
/**
 * agy-memory · MCP stdio server
 * 协议：JSON-RPC 2.0 over stdio（LSP 风格 Content-Length 头不做，MCP stdio 用换行分帧的 NDJSON）
 * 只依赖 Node 标准库。
 */
const path = require("node:path");
const lib = require("./memory-lib.js");

const SERVER = { name: "agy-memory", version: "1.0.0" };

/** 项目路径解析优先级：显式参数 > 环境变量 > 进程 cwd */
function resolveProject(args = {}) {
  const p = args.project || process.env.AGY_MEMORY_PROJECT || process.cwd();
  return { projectPath: path.resolve(p), projectSlug: lib.slug(p) };
}

const { T: TOOLS } = require("./tools.js");

const BEGIN = "<!-- BEGIN agy-memory (auto-generated, do not edit by hand) -->";
const END = "<!-- END agy-memory -->";

function renderIntoAgentsMd(projectPath, budget) {
  const ctx = lib.buildContext({ projectPath, budget });
  const dir = path.join(projectPath, ".agents");
  const file = path.join(dir, "AGENTS.md");
  lib.ensureDir(dir);
  let old = lib.read(file);
  const block = ctx.text
    ? `${BEGIN}\n${ctx.text}\n${END}`
    : `${BEGIN}\n(the library is empty; write one entry with memory_add when wrapping up)\n${END}`;
  let next;
  const i = old.indexOf(BEGIN);
  const j = old.indexOf(END);
  if (i >= 0 && j > i) {
    next = old.slice(0, i) + block + old.slice(j + END.length);
  } else {
    next = (old ? old.replace(/\s+$/, "") + "\n\n" : "") + block + "\n";
  }
  if (next !== old) require("node:fs").writeFileSync(file, next, "utf8");
  return { file, changed: next !== old, hash: ctx.hash, chars: ctx.text.length, counts: ctx.counts };
}

function callTool(name, args = {}) {
  const { projectPath, projectSlug } = resolveProject(args);
  const base = { projectPath, projectSlug };

  switch (name) {
    case "memory_add": {
      const target = args.target || "daily";
      const file = lib.trackFile(target, { ...base, date: args.date });
      const block = lib.appendEntry(file, args.content, target === "daily" ? args.date || lib.today() : lib.today());
      return { ok: true, wrote: file, target, preview: block };
    }
    case "memory_search": {
      const hits = lib.search(args.query, {
        ...base,
        tracks: args.tracks,
        days: args.days,
        limit: args.limit,
      });
      return { count: hits.length, hits };
    }
    case "memory_list": {
      const target = args.target || "daily";
      const items = lib.listEntries(target, { ...base, date: args.date });
      const limit = Math.min(Number(args.limit) || 40, 200);
      const shown = items.slice(-limit);
      return { target, total: items.length, shown: shown.length, entries: shown.map((e) => ({ date: e.date, text: e.text })) };
    }
    case "memory_remove":
      return lib.removeEntry(args.target, args.match, { ...base, date: args.date });
    case "memory_suggest_key":
      return lib.suggestKey({ content: args.content, summary: args.summary, ...base });
    case "memory_promote_key":
      return lib.promoteKey(args.match, base);
    case "memory_pending":
      return { pending: lib.listSuggestions(projectSlug) };
    case "memory_drop":
      return lib.dropSuggestion(args.id);
    case "memory_context": {
      const ctx = lib.buildContext({ ...base, budget: args.budget });
      return { hash: ctx.hash, chars: ctx.text.length, counts: ctx.counts, text: ctx.text };
    }
    case "memory_status":
      return { ...lib.counts(projectSlug), projectPath, projectSlug };
    case "memory_sync":
      return renderIntoAgentsMd(projectPath, args.budget);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

/* ---------------- JSON-RPC 主循环 ---------------- */

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      replyError(null, -32700, "JSON parse error");
      continue;
    }
    handle(req);
  }
});

function handle(req) {
  const { id, method, params } = req || {};
  // 通知（无 id）不需要回包
  if (id === undefined || id === null) {
    if (method === "notifications/initialized") return;
    return;
  }
  try {
    switch (method) {
      case "initialize":
        return reply(id, {
          protocolVersion: (params && params.protocolVersion) || "2025-06-18",
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER,
        });
      case "ping":
        return reply(id, {});
      case "tools/list":
        return reply(id, { tools: TOOLS });
      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments || {};
        const out = callTool(name, args);
        return reply(id, {
          content: [{ type: "text", text: JSON.stringify(out, null, 2) }],
          isError: false,
        });
      }
      case "resources/list":
        return reply(id, { resources: [] });
      case "prompts/list":
        return reply(id, { prompts: [] });
      default:
        return replyError(id, -32601, `Unsupported method: ${method}`);
    }
  } catch (err) {
    if (method === "tools/call") {
      return reply(id, { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true });
    }
    return replyError(id, -32603, err.message);
  }
}
