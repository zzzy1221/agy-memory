# agy-memory

> English (current) · [中文](README.md)

Cross-session long-term memory for [Google Antigravity](https://antigravity.google).

Your agent forgets everything between sessions. This plugin gives it a memory that **survives**, and injects the relevant part into context before it starts thinking.

Fully local. Zero dependencies. No network, no API key, no cost.

```
┌─ SessionStart hook ─────────────────────────────┐
│  global  +  user  +  project-key  +  today      │  ──►  injected into context
└─────────────────────────────────────────────────┘
              ▲                        │
              │                        ▼
        memory_add ...          ~/.antigravity-memory/
                                  ├── MEMORY.md
                                  ├── USER.md
                                  ├── projects/<slug>.md
                                  ├── projects/<slug>.key.md
                                  ├── daily/2026-01-01.md
                                  ├── archive/
                                  └── suggestions.jsonl
```

## Design trade-offs

This plugin is built around four hard constraints. Each one maps to a concrete decision:

**1. Spend only what you are already spending.** No extra API key, no separate extraction or summarisation model. Memory is written by the model already in the conversation, in one tool call — no additional round trip.

**2. No network.** Memory lives in `~/.antigravity-memory/` on your machine. No outbound requests, no account, no server that needs to know what you remembered.

**3. Markdown, not a database.** The upside is that it is readable, diffable, hand-editable, and drops straight into whatever backup you already run. If the plugin breaks or you stop using it, the memory does not go with it — you open the file and read it, no tooling required.

**4. Not resident.** No background process, no port, no autostart. It exists in exactly two moments: when Antigravity runs a hook, and when Antigravity calls a tool. The rest of the time it is not there, using no memory and no power.

The boundary that comes with those choices: **no semantic search.** `memory_search` is substring matching — fine for a few hundred entries, strained at tens of thousands. That is the price of zero dependencies, zero cost, fully local, and a store you can read and edit, and it is stated up front rather than buried.

If you need large-scale semantic retrieval or a shared team memory store, that is a different product direction, and this plugin is not aimed at it.

## Install

Requires **Node.js 18+**. Antigravity must already be installed.

```bash
git clone https://github.com/<your-account>/agy-memory.git
cd agy-memory
node scripts/install.js
```

Or, once you have a copy by any means (tarball, zip, another machine), just run the installer from the plugin directory — it does not need git.

The installer copies the plugin to `~/.gemini/config/plugins/agy-memory/`, then **writes `hooks.json` and `mcp_config.json` with your machine's absolute paths** and self-checks them.

That last part is not laziness — see [Why the installer exists](#why-the-installer-exists).

Options:

```bash
node scripts/install.js --dry-run          # print what would be written
node scripts/install.js --no-hooks         # MCP tools only, no auto-injection
node scripts/install.js --uninstall        # remove hook + MCP config (keeps the library)
AGY_PLUGIN_DIR=/custom/path node scripts/install.js
```

Antigravity hot-loads plugins, so no restart is usually needed. If nothing shows up, restart it once.

### Verify

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"memory_status","arguments":{}}}' \
  | node ~/.gemini/config/plugins/agy-memory/scripts/server.js
```

Or open a new chat and ask it to run `memory_status`.

## What it provides

**11 MCP tools** — `memory_add`, `memory_search`, `memory_list`, `memory_remove`, `memory_suggest_key`, `memory_promote_key`, `memory_pending`, `memory_drop`, `memory_context`, `memory_status`, `memory_sync`

**2 hooks** — `SessionStart` injects memory; `PreInvocation` re-injects only when the library changed (hash-gated, so it does not burn tokens every turn)

**1 rule** — `rules/AGENTS.md`, always on while the plugin is enabled: what to write, where, and what never to write

**1 skill** — `skills/agy-memory/SKILL.md`, loaded on demand: the operational how-to

## The five tracks

| Track | File | Holds | Injected |
|---|---|---|---|
| `memory` | `MEMORY.md` | Cross-project facts: machine, env, paths, versions | ✅ |
| `user` | `USER.md` | User preferences, how to address them, hard limits | ✅ |
| `key` | `projects/<slug>.key.md` | Standing agreements, architecture decisions | ✅ |
| `daily` | `daily/YYYY-MM-DD.md` | Day-by-day log | ✅ (today only) |
| `project` | `projects/<slug>.md` | Per-project progress | ❌ (searchable) |

`key` is the only track that costs tokens on every turn, so it cannot be written directly: `memory_suggest_key` queues a proposal, and `memory_promote_key` applies it after the user confirms. Pending proposals are never injected.

Deletions move entries to `archive/` rather than erasing them.

## Configuration

All optional, via environment variables.

| Variable | Default | Purpose |
|---|---|---|
| `AGY_MEMORY_HOME` | `~/.antigravity-memory` | Where the library lives |
| `AGY_MEMORY_PROJECT` | process cwd | Workspace when the hook does not supply one |
| `AGY_MEMORY_BUDGET` | `7000` | Character budget for the injected block |
| `AGY_MEMORY_DEBUG` | — | Print hook errors to stderr |

## Why the installer exists

Two Antigravity behaviours make a static `hooks.json` impossible to ship:

1. **Hook commands cannot quote their path on Windows.** Write `"C:\...\hook.cmd" SessionStart` and Antigravity treats the quoted string as the command *name*:

   ```
   '\"C:\Users\...\hook.cmd\"' is not recognized as an internal or external command
   ```

   Both nested-quote workarounds fail too. An unquoted absolute path works — and therefore **the plugin path must not contain spaces.** The installer checks this and refuses with instructions rather than installing something that will silently fail.

2. **MCP `command` must be spawnable directly**, not a name resolved through a shell. Writing `node` works until it doesn't; writing the resolved `node.exe` path always does.

So the installer resolves both paths on your machine. Re-run it after moving the plugin.

> `hooks.template.json` and `mcp_config.template.json` are the shipped placeholders. They are overwritten by the installer — edit the templates only if you are changing what the installer generates.

## Also worth knowing

- **`suggestedPrompts` is capped at 3.** Extra entries are silently truncated with only a log warning.
- **Unknown `plugin.json` fields are silently dropped.** A typo does not error; it just does nothing.
- **Hooks run synchronously and block the loop.** Both are capped at 10–15s, and a hook that throws still emits valid empty JSON so it can never wedge your agent.

## Localization

The plugin ships English (`rules/AGENTS.md`, `skills/agy-memory/SKILL.md`). A Chinese rule set is at `docs/rules.zh-CN.md`:

```bash
cp docs/rules.zh-CN.md rules/AGENTS.md
```

Do not keep both — everything in `rules/` is merged and loaded, so two files means paying twice.

## License

MIT. See [LICENSE](LICENSE).
