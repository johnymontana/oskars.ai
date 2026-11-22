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
- `monitor/` — a local web UI and REST API for watching gbuild feature runs. Standalone
  node:http + tsx server (`src/`, no framework) plus a React 19 + Vite UI (`ui/`) that renders
  the dependency graph with @neo4j-nvl/react. See `monitor/README.md`.
