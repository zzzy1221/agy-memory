---
name: agy-memory
description: >-
  Read and write cross-session long-term memory in ~/.antigravity-memory: look up past
  decisions and pitfalls, record one entry when wrapping up a turn, propose a standing
  agreement as a pending key memory. Use when the user asks "what did we say about…",
  "do you remember…", or before changing something that was changed before.
---

# Long-term memory operations

Memory lives in `~/.antigravity-memory/`, all Markdown. You can read it with file tools, but **prefer the MCP tools** for reads and writes — they maintain the format, deduplication and archiving. Hand-editing the files will eventually corrupt the structure.

## Start with status

First contact with the library, or unsure what is in it:

```
memory_status
```

Returns per-track counts, whether today has an entry, and how many proposals are pending. All zeros means it is empty — start from this turn.

## Four moves

### Write (most common)

```
memory_add  content="one line that is only true of this event"  target=daily
```

Pick `target` from the table in the memory rules. When unsure, use daily.

- One entry, one line. No multi-paragraph essays.
- No "completed successfully" filler.
- One entry when wrapping up is enough.

### Search

```
memory_search  query="cover upload timeout"
memory_search  query="build script"  tracks=["key","project"]
```

Substring matching, no tokenization — so **pass keywords, not whole sentences**. If a query misses, try once with different words; after two misses say you found nothing rather than inventing an answer.

### List / remove

```
memory_list   target=project
memory_remove target=daily  match="a fragment unique to that entry"
```

`match` must hit exactly one entry. Ambiguous matches are refused and the candidates are listed — that is deliberate, to prevent deleting a swath by accident. Removed entries go to `archive/` and are reversible.

### Key memory (two steps)

```
memory_suggest_key  content="full body"  summary="one line"
memory_pending                       # review the queue
memory_promote_key  match="summary fragment"   # only after the user confirms
```

The `key` track is injected every turn, so it costs tokens. That is why you cannot decide it alone — propose, wait for the user, then promote.

## How injection happens

The `SessionStart` hook assembles "global + user + this project's key + today" into one block and injects it as a system message. The `PreInvocation` hook tops it up after the library changes (compared by hash, so an unchanged library is not re-injected).

If a memory block appears in your context and you did nothing, that is the hook working. To see exactly what you were fed, call `memory_context`.

## Gotchas

- **`node` not on PATH**: the plugin's launchers resolve `%ProgramFiles%\nodejs\node.exe` themselves. If every tool is dead, check that `~/.antigravity-memory/` exists and has content.
- **Wrong date**: `memory_add date=` accepts an explicit date for the daily track; useful for backfilling yesterday.
- **Moving the library**: set `AGY_MEMORY_HOME`; both the tools and the hooks honour it.
- **Wrong project detected**: the workspace comes from the hook's `workspacePaths`. If a tool call resolves to the wrong slug, pass `project="absolute path"` explicitly.
