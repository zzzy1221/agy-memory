#!/usr/bin/env node
"use strict";
/**
 * agy-memory · SessionStart / PreInvocation hook
 *
 * Antigravity hook contract (builtin/skills/agy-customizations/docs/hooks.md):
 *   stdin  = JSON（conversationId / workspacePaths / lastUserInput ...）
 *   stdout = {"injectSteps":[{"systemMessage":{"systemMessage":"..."}}]}
 *
 * Design choice: inject only, never write into the workspace.
 * Writing the memory block into <workspace>/.agents/AGENTS.md would show up in
 * git status, i.e. modifying the user's repo behind their back. Context goes
 * through systemMessage instead; call memory_sync if you actually want a file.
 *
 * Frequency: SessionStart always injects; PreInvocation only tops up when the
 * memory hash changed, so unchanged libraries cost no tokens.
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

/** Extract the workspace from the hook payload; handle file:// and Windows paths */
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
  const workspaceName = path.basename(projectPath) || "this project";

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
            `\n\n(memory library ${lib.HOME} · write with memory_add · search with memory_search · tidy with memory_list/memory_remove)`,
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
  // A failing hook must never wedge the agent
  emit([]);
  if (process.env.AGY_MEMORY_DEBUG) process.stderr.write(String((err && err.stack) || err) + "\n");
}
