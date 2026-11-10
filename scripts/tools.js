/**
 * agy-memory · tool definitions
 * Chinese rule set: docs/rules.zh-CN.md
 */
const T = [
  {
    name: "memory_add",
    description:
      "Append one entry to long-term memory. `target` picks the track: daily = today's log (default; use this when wrapping up a turn), project = this project's log, memory = cross-project facts (machine, env, paths), user = user profile and preferences, key = project-critical memory that gets injected every turn (prefer memory_suggest_key so the user confirms).",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description:
            "Entry body, 1-3 lines. Write something concrete that is only true of this event; avoid filler like 'task completed'.",
        },
        target: {
          type: "string",
          enum: ["daily", "project", "memory", "user", "key"],
          description: "Which track to write to. Default: daily.",
        },
        project: { type: "string", description: "Optional: absolute path of the workspace. Defaults to the env var or cwd." },
        date: { type: "string", description: "Optional: date for the daily track (YYYY-MM-DD). Defaults to today." },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_search",
    description:
      "Keyword search over the memory library (substring match, no tokenization). Use it for past decisions, why a file was changed, or how a previous pitfall was worked around.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword(s). Any language." },
        tracks: {
          type: "array",
          items: { type: "string", enum: ["memory", "user", "project", "key", "daily"] },
          description: "Restrict to these tracks. Default: all.",
        },
        days: { type: "number", description: "Only search the last N days of the daily track." },
        limit: { type: "number", description: "Max hits. Default 20." },
        project: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "memory_list",
    description: "List every entry in one track, with dates. Use it to audit, deduplicate or reorganize.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", enum: ["daily", "project", "memory", "user", "key"], description: "Default: daily." },
        date: { type: "string", description: "Date for the daily track. Default: today." },
        project: { type: "string" },
        limit: { type: "number", description: "Max entries, newest kept. Default 40." },
      },
    },
  },
  {
    name: "memory_remove",
    description:
      "Delete one entry. `match` must be a substring that identifies exactly one entry; ambiguous matches are refused and the candidates are listed. Deleted entries are archived and can be restored.",
    inputSchema: {
      type: "object",
      properties: {
        target: { type: "string", enum: ["memory", "user", "project", "key", "daily"] },
        match: { type: "string", description: "A substring unique to that entry." },
        date: { type: "string" },
        project: { type: "string" },
      },
      required: ["target", "match"],
    },
  },
  {
    name: "memory_suggest_key",
    description:
      "Propose an entry for project-critical memory. It goes into a pending queue and does NOT take effect until the user confirms it. Use it for standing agreements, architecture decisions and recurring pitfalls.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Full entry body." },
        summary: { type: "string", description: "One-line summary, at most 120 chars." },
        project: { type: "string" },
      },
      required: ["content"],
    },
  },
  {
    name: "memory_promote_key",
    description:
      "Confirm a pending key-memory proposal: write it into projects/<project>.key.md so it is injected from now on.",
    inputSchema: {
      type: "object",
      properties: {
        match: { type: "string", description: "The pending entry's id, or a substring of it." },
        project: { type: "string" },
      },
      required: ["match"],
    },
  },
  {
    name: "memory_pending",
    description: "List pending key-memory proposals that have not taken effect yet.",
    inputSchema: { type: "object", properties: { project: { type: "string" } } },
  },
  {
    name: "memory_drop",
    description: "Discard a pending key-memory proposal without writing it to the library.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "Pending entry id (see memory_pending)." } },
      required: ["id"],
    },
  },
  {
    name: "memory_context",
    description: "Return the exact injected context text (debugging: see what the model is actually fed).",
    inputSchema: {
      type: "object",
      properties: { budget: { type: "number" }, project: { type: "string" } },
    },
  },
  {
    name: "memory_status",
    description: "Library health: entry count per track, whether today has an entry, pending proposals, and where the library lives.",
    inputSchema: { type: "object", properties: { project: { type: "string" } } },
  },
  {
    name: "memory_sync",
    description:
      "Render the current memory into a marked block inside <project>/.agents/AGENTS.md so the agent sees it even without hooks. The SessionStart hook normally injects context directly; this is for setups that prefer a file.",
    inputSchema: {
      type: "object",
      properties: { budget: { type: "number" }, project: { type: "string" } },
    },
  },
];

module.exports = { T };

