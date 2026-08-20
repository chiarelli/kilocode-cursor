# cursor-agent Tool Inventory

This document catalogues tools emitted by cursor-agent and how the plugin handles them.

**Source**: Empirical discovery via `tests/experiments/` harness (2026-02-17)

## Tool Flow

```
cursor-agent emits: grepToolCall
         ↓
normalizeToolName(): strips "ToolCall" suffix → "grep"
         ↓
resolveAllowedToolName(): checks against OpenCode's allowedToolNames
         ↓
IF FOUND → action: "intercept" → OpenCode executes
IF NOT FOUND → action: "passthrough" → cursor-agent handles
```

## Discovered Tools

### Intercepted (OpenCode executes)

These tools map to OpenCode equivalents and are executed by OpenCode's tool system.

| cursor-agent Tool | After Normalization | OpenCode Tool | Notes |
|-------------------|--------------------|--------------| ------|
| `grepToolCall` | `grep` | `grep` | Direct match |
| `readToolCall` | `read` | `read` | Direct match |
| `shellToolCall` | `shell` | `bash` | Via alias: `shell` → `bash` |
| `editToolCall` | `edit` | `edit` | Direct match |
| `globToolCall` | `glob` | `glob` | Direct match |
| `updateTodosToolCall` | `updateTodos` | `todowrite` | Via alias |

### Passthrough (cursor-agent executes)

These tools have no OpenCode equivalent. They pass through to cursor-agent for execution.

| cursor-agent Tool | After Normalization | Purpose |
|-------------------|--------------------| --------|
| `semSearchToolCall` | `semSearch` | Semantic code search (embeddings-based) |
| `webFetchToolCall` | `webFetch` | Web content fetching |
| `readLintsToolCall` | `readLints` | Lint/diagnostic reading from language servers |

## Configuration

### `UNKNOWN_AS_SUCCESS_TOOLS` (tool-loop-guard.ts)

Tools in this set are treated as "success" when their result classification is "unknown". This prevents spurious loop guard triggers for legitimate tool usage.

Includes both OpenCode tools and passthrough cursor-agent tools:
- Core: `bash`, `shell`, `read`, `write`, `edit`, `grep`, `ls`, `glob`, `stat`, `mkdir`, `rm`
- Network: `webfetch`
- cursor-agent: `semsearch`, `readlints`

### `TOOL_NAME_ALIASES` (tool-loop.ts)

Maps alternative tool names to canonical OpenCode tool names. Key mappings for cursor-agent compatibility:

```typescript
["shell", "bash"],           // shellToolCall → shell → bash
["updatetodos", "todowrite"], // updateTodosToolCall → updateTodos → todowrite
```

## Experiment Results Summary

From 7 experiments run against the opencode-cursor codebase:

| Tool | Total Calls | Experiments Using |
|------|-------------|-------------------|
| `readToolCall` | 38+ | All 7 |
| `grepToolCall` | 14+ | 5 |
| `shellToolCall` | 16+ | 3 |
| `globToolCall` | 4+ | 3 |
| `editToolCall` | 2+ | 2 |
| `semSearchToolCall` | 6+ | 2 |
| `webFetchToolCall` | 2+ | 1 |
| `readLintsToolCall` | 1+ | 1 |
| `updateTodosToolCall` | 1+ | 1 |

## Adding New Tools

When cursor-agent adds new tools:

1. Run the experiment harness to discover tool names
2. If tool has OpenCode equivalent:
   - Add alias to `TOOL_NAME_ALIASES` if name differs
   - Tool will be intercepted automatically
3. If tool is cursor-agent specific (no equivalent):
   - Add to `UNKNOWN_AS_SUCCESS_TOOLS` (lowercase)
   - Document in this file
   - Tool will passthrough automatically

## Experiment Harness

Location: `tests/experiments/`

Run all experiments:
```bash
python tests/experiments/run_experiments.py
```

Results written to:
- `tests/experiments/results/raw/` - Raw stream-json logs
- `tests/experiments/results/summary/` - Per-experiment tool counts + index.json
