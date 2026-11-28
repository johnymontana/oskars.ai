# oskars.ai

Agent plugins by Oskar Hane. All plugins support Claude Code. The table shows which also support Codex and OpenCode.

## Plugins

| Plugin | Description | Codex | OpenCode |
|--------|-------------|-------|----------|
| [autoresearch](./plugins/autoresearch/) | Autonomous experiment loop: try ideas, keep what works, discard what doesn't | | |
| [coding-skills](./plugins/coding-skills/) | Language-specific coding skills (TypeScript security, more to come) | | |
| [product-skills](./plugins/product-skills/) | Product management skills — discovery, specs, prioritization, and reviews | | |
| [gbuild](./plugins/gbuild/) | Graph-native task planning and execution: dependency-graph plans, concurrent fan-out, per-node review | ✓ | ✓ |
| [stellar-review](./plugins/stellar-review/) | Strict maintainability review as a deterministic pipeline: scripted facts, cross-round ledger, four focused passes, scripted verdict | ✓ | ✓ |

## Install

Add the marketplace, then install any plugin:

```bash
claude plugin marketplace add oskarhane/oskars.ai
claude plugin install autoresearch@oskars.ai
```

Register the marketplace in Codex and install the plugins you want:

```bash
codex plugin marketplace add oskarhane/oskars.ai
codex plugin add gbuild@oskars-ai
codex plugin add stellar-review@oskars-ai
```

Start a new Codex session and use `$gbuild:design`, `$gbuild:plan`, or `$stellar-review:review`.
See the [gbuild guide](./plugins/gbuild/README.md#codex) and the
[Stellar Review guide](./plugins/stellar-review/README.md#codex) for prerequisites and updates.

For plugins marked OpenCode-compatible (gbuild, stellar-review):

```bash
opencode plugin add opencode-gbuild
opencode plugin add opencode-stellar-review
```
