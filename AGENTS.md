This is a repository for agent plugins and skills created by Oskar Hane.

## Structure

- `plugins/<name>/` — one directory per plugin, listed in `.claude-plugin/marketplace.json`.
- A plugin directory is a Claude Code plugin (`.claude-plugin/plugin.json`, `skills/`, `agents/`).
- A plugin directory can additionally be an OpenCode V2 plugin by adding a `package.json`
  (npm package, `exports: "./index.ts"`) and an `index.ts` default-exporting a `{ id, setup }`
  definition (SDK used type-only via a devDependency — zero runtime deps, no version coupling).
  Keep the markdown in `skills/`/`agents/` the single source of truth for both harnesses;
  `index.ts` translates paths and references at load time rather than forking content. OpenCode
  distribution is via npm publish (git `::path:` subdir installs are not honored by bun/npm).
  See `plugins/gbuild/` for the reference implementation.
- A plugin can also support Codex through `.codex-plugin/plugin.json` and the repo marketplace
  at `.agents/plugins/marketplace.json`. Share skill and agent Markdown across clients, and keep
  Codex-specific tool mappings in the plugin's runtime notes.
