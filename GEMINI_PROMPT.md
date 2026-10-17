# Prompt for Gemini: Prompty Code Review + Improvement Suggestions

## Context

We have a fork of Microsoft's Prompty at `JovianOps/prompty` with several improvements already applied.
The upstream PR is at: https://github.com/microsoft/prompty/pull/580

### Improvements already made (in our fork):

1. **Secret redaction** → `vscode/prompty/packages/core/src/utils/redact.ts`
   - Extracted redaction logic from `previewPanel.ts` into `utils/redact.ts`
   - Expanded `isSensitiveKey()` to catch more patterns: `key`, `auth`, `connectionString`, suffix/prefix patterns
   - Added `redactSecretValue()` for known secret format detection (sk-, ghp_, AKIA, JWT, Bearer, Google API keys, Slack tokens)
   - Fixed operator precedence bug in Bearer regex

2. **Async filesystem I/O** → `vscode/prompty/packages/core/src/connections/store.ts`
   - Replaced sync `fs.readFileSync`/`fs.writeFileSync` with async `fs/promises`

3. **Tests** → `vscode/prompty/packages/core/src/test/unit/redact.test.ts`
   - Unit tests for redaction (key names, value patterns, nested objects)

## Task

Review the Prompty codebase for additional improvements. Focus on:

1. **Security**: What other secrets might leak? Are there other sync I/O calls that could block the event loop?
2. **UX**: Are there error handling gaps, missing edge cases, or user-facing issues?
3. **Architecture**: Where is logic duplicated that could be consolidated? Where are abstractions misplaced?
4. **Testing**: What areas lack test coverage that should have it?

### Specific files to examine:

```
vscode/prompty/packages/core/src/
├── controllers/
│   ├── chatPanel.ts      (~1062 lines — the main chat UI)
│   └── previewPanel.ts   (modified — uses redact.ts)
├── connections/
│   ├── registry.ts
│   ├── store.ts           (modified — async I/O)
│   └── types.ts
├── utils/
│   ├── nonce.ts
│   └── redact.ts          (NEW — improved secret redaction)
├── test/
│   └── unit/
│       └── redact.test.ts  (NEW — unit tests)
└── extension.ts
```

### Questions to answer:

1. **Security**: Are there other places where secrets could leak besides frontmatter display? Check `chatPanel.ts` for any raw output of configuration, connection strings, or model options.
2. **Performance**: Are there other synchronous `fs` calls in the extension? Check for `readFileSync`, `writeFileSync`, `existsSync`, `mkdirSync` anywhere else.
3. **Error handling**: In `chatPanel.ts`, what happens when `turn()` throws? Are there unhandled promise rejections?
4. **Architecture**: The `registry.ts` file has provider registrations — is there validation of connection configs before they're used?
5. **Testing**: What testable units exist in `chatPanel.ts` or `extension.ts` that don't have tests?

### Scope constraints:
- Only review `.ts` files in `vscode/prompty/packages/core/src/`
- Don't modify Python/Rust/C#/Go runtime code
- Don't add dependencies — only stdlib + existing packages
- Focus on real bugs/gaps, not style preferences

Read each file, identify concrete issues, and provide:
- File path + line number
- Issue description
- Suggested fix (code snippet)
- Priority: High (security/data loss), Medium (UX/correctness), Low (cleanliness)
