---
name: review
description: Run Stellar Review's incremental maintainability review in Codex. Use for an explicit Stellar Review request, optionally with --quick or a GitHub PR number.
---

# Stellar Review in Codex

Read the [shared Stellar Review skill](../../skills/stellar-review/SKILL.md) and follow its local
pipeline. Its `$ARGUMENTS` are the arguments supplied after `$stellar-review:review` or in the
request. Resolve the plugin root two levels above this skill's directory. Substitute that absolute
path for `CLAUDE_PLUGIN_ROOT` in shared instructions and role files. Quote absolute paths when
running commands. Use the root of the Git repository being reviewed as the working directory.

Use `scripts/stellar-prep.sh local` from the plugin for Step 0. Forward `--quick` or the PR number
when supplied. Follow the scripted gates before dispatching any agents.

## Dispatch in Codex

Use `spawn_agent` with a fresh agent for each brief file from Step 2. Start its task with:

> Stellar review round <N>. Read <absolute path to agents/stellar-PASS.md> and follow it.
> The plugin root is <absolute plugin root>; resolve CLAUDE_PLUGIN_ROOT references from there.
> Review from <absolute repository root> using read-only operations. Read <absolute brief path>
> and return only the JSON document from your role's instructions.

Keep one brief per agent. Start passes in parallel up to the available agent slots and queue the
rest. Wait for any completed pass, collect its final JSON document, and close the agent if supported
before filling the slot. A timeout leaves the pass in flight. Preserve the shared role instructions
and pass boundaries. When the host supports per-agent model selection, follow the shared tier
guidance and apply any supported `STELLAR_MODEL_<PASS>` overrides. Otherwise use session defaults.

Wait for one valid result per brief before writing `.stellar/findings.json`. If dispatch is
unavailable or a pass fails or returns invalid JSON, report the affected brief and stop before
assembling findings or updating the local ledger. Use the shared skill's local handoff. A PR number
identifies the ledger to read for the review.
