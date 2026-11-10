#!/usr/bin/env node
"use strict";
/**
 * agy-memory · SessionStart / PreInvocation hook
 *
 * Antigravity hook 契约（builtin/skills/agy-customizations/docs/hooks.md）：
 *   stdin  = JSON（conversationId / workspacePaths / lastUserInput ...）
 *   stdout = {"injectSteps":[{"systemMessage":{"systemMessage":"..."}}]}
 *
 * 设计取舍：**只注入，不往工作区写文件**。
 * 把记忆块写进 <workspace>/.agents/AGENTS.md 会让它出现在 git status 里，等于
 * 替用户改了仓库。所以上下文走 systemMessage，需要落文件的人自己调 memory_sync。
 *
 * 频次控制：SessionStart 必注入；PreInvocation 只在记忆 hash 变化时补一次，
 * 避免每轮重复烧 token。
 */
const path = require("node:path");
const fs = require("node:fs");
const lib = require("./memory-lib.js");

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function parsePayload(raw) {
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** 从 hook payload 里取工作区；file:// 与 Windows 反斜杠都要认 */
function pickWorkspace(payload) {
  const list = payload.workspacePaths || payload.workspace_uris || [];
  const first = Array.isArray(list) ? list[0] : list;
  if (!first) return path.resolve(process.env.AGY_MEMORY_PROJECT || process.cwd());
  let p = String(first);
  if (p.startsWith("file:///")) {
    p = decodeURIComponent(p.slice(8));
    if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1); // /c:/foo → c:/foo
  } else if (p.startsWith("file://")) {
    p = decodeURIComponent(p.slice(7));
  }
  return path.resolve(p);
}

function emit(steps) {
  process.stdout.write(JSON.stringify({ injectSteps: steps }) + "\n");
}

function main() {
  const event = process.argv[2] || "SessionStart";
  const payload = parsePayload(readStdin());
  const projectPath = pickWorkspace(payload);
  const budget = Number(process.env.AGY_MEMORY_BUDGET) || 7000;
  const workspaceName = path.basename(projectPath) || "本项目";

  const ctx = lib.buildContext({ projectPath, budget, workspaceName });
  const state = lib.readState();
  const key = "h:" + projectPath;

  if (!ctx.text) {
    emit([]);
    return;
  }

  if (event === "SessionStart" || state[key] !== ctx.hash) {
    emit([
      {
        systemMessage: {
          systemMessage:
            ctx.text +
            `\n\n（记忆库 ${lib.HOME} · 写用 memory_add · 查用 memory_search · 整理用 memory_list/remove）`,
        },
      },
    ]);
    lib.writeState({
      ...state,
      [key]: ctx.hash,
      lastEvent: event,
      lastAt: new Date().toISOString(),
      lastProject: projectPath,
    });
    return;
  }

  emit([]);
}

try {
  main();
} catch (err) {
  // hook 失败绝不能挡住 agent
  emit([]);
  if (process.env.AGY_MEMORY_DEBUG) process.stderr.write(String((err && err.stack) || err) + "\n");
}
