#!/usr/bin/env node
"use strict";
/**
 * agy-memory · installer
 *
 * Why this exists: Antigravity's hook commands cannot quote their path on
 * Windows (the quoted string is parsed as the command *name*), and MCP's
 * `command` must be directly spawnable rather than resolved through a shell.
 * So both configs are generated here with this machine's absolute paths.
 *
 * Usage:
 *   node scripts/install.js              # install to ~/.gemini/config/plugins/agy-memory
 *   node scripts/install.js --dry-run    # print what would be written
 *   node scripts/install.js --no-hooks   # MCP tools only, no auto-injection
 *   node scripts/install.js --uninstall  # remove hook + MCP config (keep the library)
 *   AGY_PLUGIN_DIR=/custom/path node scripts/install.js
 */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const HERE = __dirname;
const PLUGIN_ROOT = path.resolve(HERE, "..");
const NAME = "agy-memory";
const TARGET = process.env.AGY_PLUGIN_DIR || path.join(os.homedir(), ".gemini", "config", "plugins", NAME);

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const UNINSTALL = args.includes("--uninstall");
const NO_HOOKS = args.includes("--no-hooks");

const MIN_NODE = 18;

function isWindows() {
  return process.platform === "win32";
}

function fail(lines) {
  console.error("");
  console.error(lines.join("\n"));
  console.error("");
  process.exit(2);
}

/** Hook commands cannot be quoted on Windows, so the path must not contain spaces. */
function assertNoSpaces(p) {
  if (!isWindows() || !/\s/.test(p)) return;
  fail([
    "x Plugin path contains a space: " + p,
    "",
    "  On Windows, Antigravity strips surrounding quotes from hook commands,",
    "  so a spaced path can be neither quoted nor left bare (both fail; tested).",
    "",
    "  Two options:",
    "",
    "    1. Install to a path without spaces:",
    "         set AGY_PLUGIN_DIR=D:\\agents\\agy-memory",
    "         node scripts\\install.js",
    "",
    "    2. Install the MCP tools only, skipping hook injection:",
    "         node scripts\\install.js --no-hooks",
  ]);
}

function hooksConfig(root) {
  const cmd = isWindows() ? path.join(root, "scripts", "hook.cmd") : path.join(root, "scripts", "hook.sh");
  // Deliberately unquoted: quoting breaks on Windows, and Unix sh does not need
  // it because assertNoSpaces already guaranteed there are no spaces.
  return {
    "agy-memory-session": {
      SessionStart: [{ type: "command", command: `${cmd} SessionStart`, timeout: 15 }],
    },
    "agy-memory-recall": {
      PreInvocation: [{ type: "command", command: `${cmd} PreInvocation`, timeout: 10 }],
    },
  };
}

function mcpConfig(root) {
  return {
    mcpServers: {
      "agy-memory": {
        // Spawn node directly: one less shell layer, and immune to the quoting issue.
        command: findNode(),
        args: [path.join(root, "scripts", "server.js")],
        env: {},
      },
    },
  };
}

/** MCP `command` must be an executable path, not a name guessed from PATH. */
function findNode() {
  const exe = isWindows() ? "node.exe" : "node";
  const candidates = [
    process.execPath,
    path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", exe),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "nodejs", exe),
    "/usr/local/bin/node",
    "/usr/bin/node",
    "/opt/homebrew/bin/node",
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {}
  }
  return "node";
}

function writeJson(file, obj) {
  const text = JSON.stringify(obj, null, 2) + "\n";
  if (DRY) {
    console.log(`\n--- ${file} ---\n${text.trim()}`);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
  console.log("  wrote " + file);
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

function chmodScripts(root) {
  if (isWindows()) return;
  for (const f of ["hook.sh", "mcp.sh"]) {
    try {
      fs.chmodSync(path.join(root, "scripts", f), 0o755);
    } catch {}
  }
}

/** Post-install check: every referenced path exists, nothing is quoted. */
function selfCheck(hooksFile, mcpFile) {
  const problems = [];

  let hooks = {};
  try {
    hooks = JSON.parse(fs.readFileSync(hooksFile, "utf8"));
  } catch {}
  for (const [name, events] of Object.entries(hooks)) {
    for (const handlers of Object.values(events || {})) {
      for (const h of handlers || []) {
        const command = String(h.command || "");
        const target = command.split(" ")[0];
        if (target && !fs.existsSync(target)) problems.push(`hook "${name}" points at a missing file: ${target}`);
        if (/^["']/.test(command)) problems.push(`hook "${name}" is quoted; this fails on Windows`);
      }
    }
  }

  let mcp = {};
  try {
    mcp = JSON.parse(fs.readFileSync(mcpFile, "utf8"));
  } catch {}
  const server = mcp.mcpServers && mcp.mcpServers["agy-memory"];
  if (!server) {
    problems.push("mcp_config.json has no agy-memory server");
  } else {
    if (!fs.existsSync(server.command)) problems.push(`MCP command not found: ${server.command}`);
    const script = (server.args || [])[0];
    if (script && !fs.existsSync(script)) problems.push(`MCP script not found: ${script}`);
  }

  return problems;
}

function main() {
  console.log("agy-memory installer");
  console.log("  source   " + PLUGIN_ROOT);
  console.log("  target   " + TARGET);
  console.log("  node     " + findNode());
  console.log("");

  if (UNINSTALL) {
    for (const f of ["hooks.json", "mcp_config.json"]) {
      const p = path.join(TARGET, f);
      if (fs.existsSync(p)) {
        if (!DRY) fs.unlinkSync(p);
        console.log("  removed " + p);
      }
    }
    console.log("\nHook and MCP config removed. The memory library is kept at ~/.antigravity-memory/");
    return;
  }

  if (!NO_HOOKS) assertNoSpaces(TARGET);

  if (path.resolve(TARGET) !== path.resolve(PLUGIN_ROOT)) {
    if (DRY) console.log(`  would copy ${PLUGIN_ROOT} -> ${TARGET}`);
    else {
      copyTree(PLUGIN_ROOT, TARGET);
      console.log("  copied");
    }
  } else {
    console.log("  installing in place (source is the target)");
  }

  chmodScripts(TARGET);

  const hooksFile = path.join(TARGET, "hooks.json");
  const mcpFile = path.join(TARGET, "mcp_config.json");

  if (NO_HOOKS) {
    // Explicitly empty rather than stale: a leftover config would point at a
    // path that may no longer exist and would fail on every turn.
    writeJson(hooksFile, {});
    console.log("  (--no-hooks: auto-injection off, tools still available)");
  } else {
    writeJson(hooksFile, hooksConfig(TARGET));
  }
  writeJson(mcpFile, mcpConfig(TARGET));

  if (DRY) return;

  const problems = selfCheck(hooksFile, mcpFile);
  console.log("");
  if (problems.length) {
    console.error("x Self-check failed:");
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log("+ Self-check passed: hook and MCP paths exist and are unquoted.");

  console.log("");
  console.log("Next:");
  console.log("  1. Antigravity hot-loads plugins; no restart needed (restart once if nothing appears).");
  console.log("  2. Open a new chat and ask it to run memory_status to confirm the tools are live.");
  console.log("  3. The library is plain Markdown at ~/.antigravity-memory/");
}

const major = Number(String(process.versions.node).split(".")[0]);
if (major < MIN_NODE) {
  fail([`x Node ${process.versions.node} is too old. agy-memory needs Node ${MIN_NODE}+.`, "", "  https://nodejs.org/"]);
}

main();
