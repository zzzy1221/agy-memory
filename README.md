# agy-memory

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

## Why not one of the existing memory plugins

Three of them support Antigravity, and all three are good at something this is not:

| | Model | Trade-off |
|---|---|---|
| **Mem0** | Hosted MCP + API key | Server-side extraction into a vector store. Cloud, paid, and the direction is opposite: it summarizes, it does not keep a readable store. |
| **MemPalace** | Local ChromaDB | Excellent **archive** — verbatim storage, semantic search. Needs Python 3.10+, uv, ~300MB of embedding model. It answers "find the session where we discussed X", not "what are the standing rules here". |
| **agentmemory** | Local BM25, daemon on :3111 | 54 tools, a viewer, a resident process. Great if you want a memory product; heavy if you want memory in your editor. |

`agy-memory` takes a fourth position: **layered Markdown tracks, injected every session, written by the model in one call.** No daemon, no embeddings, no Python. When it breaks you open a `.md` file and read it.

That also means it is honest about its ceiling: **no semantic search.** `memory_search` is substring matching. At a few hundred entries that is fine; at tens of thousands you want MemPalace.

## Install

Requires **Node.js 18+**. Antigravity must already be installed.

```bash
git clone https://github.com/<you>/agy-memory.git
cd agy-memory
node scripts/install.js
```

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
