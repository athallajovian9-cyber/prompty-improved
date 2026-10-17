# Prompt for Gemini: Prompty Code Review — Concrete Issues Found

Review the Prompty VS Code extension codebase at `JovianOps/prompty` (fork of microsoft/prompty
with security/performance/test improvements already applied — see PR #580 for upstream).

## Context: What's already been fixed

- Secret redaction extracted to `utils/redact.ts` (improved patterns + value matching)
- Connection store (`connections/store.ts`) migrated from sync to async `fs/promises`
- Unit tests added for redaction (`src/test/unit/redact.test.ts`)

## What to do

Read the codebase thoroughly and identify CONCRETE, FIXABLE issues. For each issue, provide:
- File path + line number range
- Issue description (be specific about the actual bug/behavior)
- Suggested fix (real code, not pseudocode)
- Priority: High / Medium / Low
- Proof: show the exact code that demonstrates the issue

## Scope

Only review `.ts` files under `vscode/prompty/packages/core/src/`. Do NOT review Python,
Rust, C#, Go, or Java runtime code. Do NOT modify package.json or build configs.

## Areas to focus on (based on prior improvements)

### 1. Sync I/O remaining in promptyController.ts
`promptyController.ts` still uses blocking `fs.readFileSync` and `fs.existsSync`:
- Line 58: `fs.readFileSync(filePath, 'utf-8')` in `readFrontmatter()`
- Line 444: `fs.existsSync(envPath)` in `loadEnvFile()`
- Line 458: `fs.readFileSync(envPath, 'utf-8')` in `parseEnvFile()`

These block the VS Code event loop, same class of issue already fixed in `store.ts`.

### 2. Secret leakage via error output
`promptyController.ts` output channel logs:
- Line 142: `outputChannel.info("  Profile: " + JSON.stringify(profile, null, 2))` — logs full profile JSON including metadata
- Lines 283-285: Error messages with `Model:`, `Connection:`, `Endpoint:` context appended to error output

Verify: does the error path (lines 251-298) ever include API keys or secrets in the displayed message? Check what properties of `error` are surfaced.

### 3. Tool call arguments displayed in chatPanel.ts
`chatPanel.ts` line 447: `arguments: argsStr` — tool call arguments are sent to the webview. If a tool receives arguments containing secrets (e.g., a tool that takes a connection string as input), those secrets appear in the webview DOM with no redaction.

### 4. Unused import in store.ts
`connections/store.ts` line 4: `import * as fs from "fs"` — after async migration, is `fs` still used anywhere? Check for leftover sync usage.

### 5. Missing tests
Only `redact.ts` has unit tests. Files with significant untested logic:
- `chatPanel.ts` — streaming, tool calls, message formatting (1062 lines)
- `promptyController.ts` — connection bridging, env file loading, error formatting (486 lines)
- `connections/store.ts` — profile CRUD operations

### 6. Resource leak in chatPanel.ts tool calls
Line 451: `this.panel.webview.onDidReceiveMessage(...)` handler created per tool call.
If the panel closes before a tool response resolves, the listener is never disposed.
Verify if this handler is tracked for cleanup.

## Deliverable format

For each issue found (max 15):

```
### [Area] [One-line title]

**Location**: `file.ts` LXX-LYY

**Proof**: (exact code demonstrating the issue)

**Fix**: (real code patch)

**Priority**: High/Medium/Low
```

## Constraints
- Only review files under `vscode/prompty/packages/core/src/`
- No Python/Rust/C#/Go/Java code review
- No build config changes
- Real bugs only, no style preferences or speculative refactoring
- Skip issues already mentioned in the 6 focus areas above if they are correct
