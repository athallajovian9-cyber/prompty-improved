# Contributing to Prompty

Community contributions are welcome. Before opening a PR, please review the following guidelines.

## Development Setup

**Python runtime:**
```bash
uv pip install -e "runtime/python/prompty[dev]"
```

**TypeScript extension:**
```bash
cd runtime/typescript
npm install
cd packages/core && npm run dev
```

**VS Code extension (for extension development):**
```bash
cd vscode/prompty
npm install
npm run compile
code .  # press F5 to launch a dev host
```

## Before You Open a PR

1. **Run tests:**
   ```bash
   # Python
   uv run pytest runtime/python/prompty/test

   # TypeScript
   npm test

   # VS Code extension
   cd vscode/prompty && npm test
   ```

2. **Check hygiene:**
   ```bash
   git diff --check
   git ls-files --eol | grep 'w/crlf'
   ```

3. **Keep PRs focused.** One concern per PR — security, bug fix, or feature.

## Code Review Checklist

- [ ] No new dependencies unless justified
- [ ] All `error.message` text passed through `redactSecretsInText()` before display
- [ ] Markdown rendered via `renderSafeMarkdown()` (not raw `marked.parse`)
- [ ] No `Math.random()` for security-sensitive nonces
- [ ] Async fs used (no `readFileSync` on extension host)
- [ ] `.env` walks contained to workspace root
- [ ] `connections.json` writes are atomic (temp + rename)

## Reporting Issues

Use [GitHub Issues](https://github.com/microsoft/prompty/issues) with:
- Prompty version (`prompty --version` or extension version)
- Minimal `.prompty` file that reproduces the issue
- Platform (OS, Node/Python version)
