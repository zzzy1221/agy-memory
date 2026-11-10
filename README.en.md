# agy-memory

Cross-session long-term memory for Google Antigravity.

> English · [中文](README.md)

---

## Overview

Each new Antigravity conversation starts from an empty context. Agreements, conclusions, and lessons established in earlier sessions are not retained. This plugin injects memory into the context at session start, so the model has access to project-relevant history before it begins reasoning.

All data is stored locally. No outbound network requests, no API keys, no additional cost.

## How it works

```
                ┌──────────────────────────┐
   SessionStart │  global + user + project │ ──► injected as system message
      hook      │      key + today         │
                └──────────────────────────┘
                             ▲
                             │ memory_add
                             │
                ~/.antigravity-memory/
                  ├── MEMORY.md              global facts
                  ├── USER.md                user preferences
                  ├── projects/<slug>.md     project log
                  ├── projects/<slug>.key.md project key memory (injected every turn)
                  ├── daily/YYYY-MM-DD.md    daily log
                  ├── archive/               archived deletions
                  └── suggestions.jsonl      pending proposals
```

At session start the `SessionStart` hook assembles four sources — global facts, user preferences, project key memory, and the current day's log — and injects them into context. After memory changes, the `PreInvocation` hook compares a content hash and tops up the injection only when needed, avoiding repeated token cost.

## Design constraints

The plugin is built around four constraints, each mapping to a specific implementation decision.

**1. No additional call cost**
No separate API key, no extra extraction or summarisation model. Memory is written by the model already in the conversation through a single tool call, producing no additional model requests.

**2. No network communication**
Memory is stored in `~/.antigravity-memory/` on the local machine. There are no outbound requests, no account registration, and no server involvement.

**3. Markdown as the storage format**
This allows reading, version control, manual editing, and inclusion in existing backup workflows. If the plugin stops being used or fails, the memory data itself is unaffected and can be read with a text editor without additional tooling.

**4. No resident process**
No background process, no listening port, no autostart. The plugin executes only during hook invocation and tool calls, and consumes no system resources otherwise.

## Scope and limits

Retrieval is **substring matching**, with no semantic search. A few hundred entries are well served; at tens of thousands, retrieval performance degrades. This is a direct consequence of the four constraints above — zero dependencies, zero cost, fully local, readable and editable.

Large-scale semantic retrieval or a shared team memory store requires a different technical approach.

## Requirements

| Item | Requirement |
|---|---|
| Node.js | 18 or later |
| Antigravity | Installed and working |

## Installation

```bash
git clone https://github.com/zzzy1221/agy-memory.git
cd agy-memory
node scripts/install.js
```

Git is not required for installation. The plugin may be obtained as an archive or copied from another machine, provided the install script is run from the plugin directory.

The install script performs three operations:

1. Copies the plugin to `~/.gemini/config/plugins/agy-memory/`
2. Generates `hooks.json` and `mcp_config.json` using local absolute paths
3. Verifies the generated paths exist and that commands are not quoted

Step 2 is mandatory rather than optional; see [Why an install script is required](#why-an-install-script-is-required).

### Command-line options

| Option | Description |
|---|---|
| `--dry-run` | Print what would be written without modifying the filesystem |
| `--no-hooks` | Install MCP tools only, without automatic injection |
| `--uninstall` | Remove hook and MCP configuration, retaining the memory library |
| `AGY_PLUGIN_DIR=<path>` | Specify the installation directory |

Antigravity hot-loads plugins; a restart is usually unnecessary. If the plugin does not take effect, restart once.

### Verifying the installation

Windows (PowerShell):

```powershell
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_status","arguments":{}}}' | node "$env:USERPROFILE\.gemini\config\plugins\agy-memory\scripts\server.js"
```

macOS / Linux:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_status","arguments":{}}}' \
  | node ~/.gemini/config/plugins/agy-memory/scripts/server.js
```

Expected output is JSON containing the entry count for each track:

```json
{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\n  \"home\": \"...\",\n  \"memory\": 0,\n  \"user\": 0,\n  \"projectLog\": 0,\n  \"today\": 0, ..."}]}}
```

All track counts read `0` after a fresh installation. This is expected and indicates an empty library.

No output, or a `Cannot find module` error, usually means the paths in `mcp_config.json` no longer match the plugin's actual location (for example, after moving the directory). Re-running `node scripts/install.js` corrects this.

As an alternative, open a new Antigravity session and request `memory_status`; if the tool responds, the installation succeeded.

## Usage

The plugin runs automatically. It executes at two points:

- **New session**: injects global facts, user preferences, project key memory, and the current day's log
- **After memory changes**: compares the content hash and tops up the injection when needed

Active operations use natural-language instructions:

| Instruction | Behaviour |
|---|---|
| "Record the agreement we just settled on" | Writes a `daily` entry |
| "Do you remember the build script discussion?" | Calls `memory_search` |
| "This pitfall is worth keeping long-term" | Calls `memory_suggest_key`, adding it to the pending queue |
| "Confirm" / "Store it" | Calls `memory_promote_key`, promoting the proposal |
| "Don't record this" | Calls `memory_drop`, discarding the proposal |

The `key` track is the only track injected on every turn and therefore consumes tokens continuously. It cannot be written directly; proposals require both submission and confirmation. Pending proposals are never injected.

Memory contents can be read directly: every file under `~/.antigravity-memory/` is Markdown.

## Components

| Type | Count | Description |
|---|---|---|
| MCP tools | 11 | `memory_add`, `memory_search`, `memory_list`, `memory_remove`, `memory_suggest_key`, `memory_promote_key`, `memory_pending`, `memory_drop`, `memory_context`, `memory_status`, `memory_sync` |
| Hooks | 2 | `SessionStart` performs injection; `PreInvocation` tops up after changes |
| Rule | 1 | `rules/AGENTS.md`, active while the plugin is enabled, defining write scope and prohibitions |
| Skill | 1 | `skills/agy-memory/SKILL.md`, an on-demand operations manual |

## Memory tracks

| Track | File | Contents | Injected |
|---|---|---|---|
| `memory` | `MEMORY.md` | Cross-project facts: machine, environment, paths, versions | Yes |
| `user` | `USER.md` | User preferences, forms of address, constraints | Yes |
| `key` | `projects/<slug>.key.md` | Standing agreements, architecture decisions | Yes |
| `daily` | `daily/YYYY-MM-DD.md` | Daily log | Yes (current day only) |
| `project` | `projects/<slug>.md` | Per-project progress | No (searchable) |

Entries use the format `- [YYYY-MM-DD] content`, maintained by the tools. Manual edits are not recommended.

Deleted entries move to `archive/` rather than being physically erased, and can be restored.

## Configuration

All optional, set through environment variables.

| Variable | Default | Purpose |
|---|---|---|
| `AGY_MEMORY_HOME` | `~/.antigravity-memory` | Memory library location |
| `AGY_MEMORY_PROJECT` | process working directory | Fallback when the hook supplies no workspace |
| `AGY_MEMORY_BUDGET` | `7000` | Character budget for injected content |
| `AGY_MEMORY_DEBUG` | unset | Write hook errors to stderr |

## Why an install script is required

Two Antigravity behaviours make a static configuration file impossible to distribute directly, so the install script must generate configuration on the target machine.

**1. Hook commands cannot quote their path on Windows**

The following form causes the entire quoted string to be parsed as the command name:

```json
"command": "\"C:\\Users\\...\\hook.cmd\" SessionStart"
```

Error output:

```
'\"C:\Users\...\hook.cmd\"' is not recognized as an internal or external command
```

The two nested-quote alternatives are equally ineffective (one fails silently, the other reports a syntax error). An unquoted absolute path executes correctly, which means **the plugin installation path must not contain spaces**. The install script detects spaces in the path and refuses installation with alternatives, rather than generating a configuration that fails silently on every run.

**2. The MCP `command` must be an executable path**

It cannot be a command name resolved through a shell. `node` works in most environments but breaks when PATH changes; the resolved absolute path to `node.exe` does not.

Both paths must be resolved on the target machine, so the install script must be re-run after moving the plugin directory.

> `hooks.template.json` and `mcp_config.template.json` are shipped placeholders that the install script overwrites. They should be edited only when changing the generation logic.

## Known limitations

- **`suggestedPrompts` accepts at most 3 entries.** Additional entries are silently truncated, leaving only a warning in the log.
- **Unknown fields in `plugin.json` are silently discarded.** A typo does not raise an error and does not take effect.
- **Hooks execute synchronously and block the execution loop.** Timeouts are capped at 10–15 seconds. A hook that throws still emits valid empty JSON and will not interrupt the agent.

## Interface language

The shipped rule and skill are in English (`rules/AGENTS.md`, `skills/agy-memory/SKILL.md`). A Chinese rule set is provided at `docs/rules.zh-CN.md`. To enable it:

Windows (PowerShell):

```powershell
Copy-Item docs\rules.zh-CN.md rules\AGENTS.md -Force
```

macOS / Linux:

```bash
cp docs/rules.zh-CN.md rules/AGENTS.md
```

All files under `rules/` are merged and loaded together. Keeping both versions doubles the token cost on every turn.

## Uninstallation

Remove hook and MCP configuration, retaining the memory library:

```bash
node scripts/install.js --uninstall
```

For complete removal, also delete the plugin directory:

Windows (PowerShell):

```powershell
Remove-Item -Recurse -Force "$env:USERPROFILE\.gemini\config\plugins\agy-memory"
```

macOS / Linux:

```bash
rm -rf ~/.gemini/config/plugins/agy-memory
```

The memory library is located at `~/.antigravity-memory/`, independent of the plugin directory, and may be retained or deleted separately.

## License

MIT. See [LICENSE](LICENSE). Third-party notices in [NOTICE](NOTICE).

## Attribution

The layered memory model is derived from [dsh-memory-evolve](https://github.com/csyangwen/dsh-memory-evolve) by csyangwen (MIT License, Copyright (c) 2026 dsh-external).

What was adopted is the design: five-track layering, injection at session start, the two-step confirmation path for key memory, archiving rather than deletion, and a single entry written when a turn ends. The implementation is independent and targets Antigravity; no upstream source code was copied. The Antigravity adaptation layer (hook contract, MCP server, configuration generation, install script) is original to this project.

Not adopted: git-branch tracks, self-evolution, todo management, CLI dispatch, and the WebUI.

Full details in [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md).
