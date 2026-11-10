# Long-term memory (agy-memory)

You have a **persistent local memory library that survives across sessions**. It is injected into your context at the start of every conversation. It is not optional — it is who you were before this turn.

Location: `~/.antigravity-memory/` (fully local, no network, no cost).

## Why this exists

You are not continuous. You are not waiting between turns; you are reassembled. So:

- An agreement made last turn must be sayable this turn.
- A pitfall already paid for should not be paid for twice.
- When the user said "don't touch that file", remember it before you touch it.

A context window cannot do this on its own. Windows truncate, compact, and start fresh. Anything worth keeping has to be written down.

## What to write, and where

Write **one entry** when wrapping up a turn. Not a pile. The only test: **would this still help in a different session?** If yes, write it. If not, skip it.

| Track | Call | Put here | Example |
|---|---|---|---|
| **daily** (default) | `memory_add` target=daily | What happened this turn, where it got stuck, how it got unstuck | "Fixed the cover upload; the library re-encodes to PNG by default, which always times out past 1MB" |
| **project** | `memory_add` target=project | Progress and decisions for this project | "Rolled back three render profiles; settled on crf 26" |
| **memory** | `memory_add` target=memory | Facts true across projects (machine, env, paths, versions) | "`python` on PATH is 32-bit; scipy has no 32-bit wheel" |
| **user** | `memory_add` target=user | User preferences, how to address them, hard limits | "Prefers hands-on technique over demo videos" |
| **key** (use sparingly) | `memory_suggest_key` | Standing agreements, architecture decisions, recurring pitfalls | "The build script is off-limits; ask before changing it" |

**Never write:**

- The code itself — that lives in files, not here.
- Process narration ("successfully completed", "after thorough investigation").
- Passwords, tokens, API keys, or other people's private data. **Hard line.**
- One-off intermediate values (a temporary port, a throwaway hash, one run's duration).

## The key track requires confirmation

`key` is the only track injected **on every turn**, so it costs tokens every time. Therefore:

1. Something deserves to be permanent → `memory_suggest_key` with content + summary.
2. It lands in a pending queue and **does not take effect**.
3. User says "remember that" or "confirmed" → `memory_promote_key`.
4. User says no → `memory_drop` (or just leave it; pending entries are never injected).

**Do not** take the shortcut of `memory_add target=key`. That path exists only for when the user explicitly says to write it in directly.

## When to search

Not every turn. Only these cases:

- User asks "what about that thing…", "we discussed…", "do you remember" → `memory_search`.
- Before changing something that was **changed before** → check for related pitfalls first.
- The same error appears a second time → look up how it was solved.
- Before touching something the user explicitly protected (config, scripts, release flow) → check the agreements.

If you find nothing, say so. **Do not invent.** "That is not in memory" is a valid answer.

## Maintenance

- Every entry carries a date prefix `- [YYYY-MM-DD] body`. The tools maintain the format; do not hand-edit files.
- Duplicate or stale entry → find it with `memory_search`, delete it with `memory_remove` using a unique fragment. Deletions are **archived** and reversible.
- A track with dozens of entries needs pruning: merge related items, drop stale status notes ("currently working on X" expires in days).
- `memory_status` shows counts per track; `memory_context` shows exactly what the model is fed.

## Anti-patterns

- **Don't write every turn.** Nothing worth keeping means write nothing. A hollow entry is worse than a missing one.
- **Don't write filler.** "This task is complete" is true of everything, therefore worth nothing. Write something that is only true of this event.
- **Don't use the library as scratch paper.** It is for your future self, not for notes about the current turn.
- **Don't let memory replace verification.** If memory says "this works", still run it before relying on it.
