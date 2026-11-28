# Running gbuild in Codex

- Use the input after `$gbuild:<skill>` as `$ARGUMENTS`. When giving the user a next command, use
  `$gbuild:plan`, `$gbuild:run`, etc. To run another skill inline, read its `SKILL.md` and pass its
  arguments explicitly.
- Resolve the plugin root two directories above the loaded skill's folder, such as
  `<plugin-root>/skills/plan/`. In the shared instructions, `CLAUDE_PLUGIN_ROOT` refers to this
  directory. Substitute the absolute path and quote it in shell commands. Use the same root when
  following references or reading role files.
- Follow the target repository's instructions on worktrees, reviews, publishing and CI. Store and
  worktree creation may require approval for Git metadata writes. Use Codex's normal approval flow
  and retain the worktree and store locations described by the shared instructions.

## Subagent dispatch for run and review

Use Codex's `spawn_agent` and its subagent wait tool. Confirm they are available before starting a run.
Dispatch a fresh agent for each role and each independent review. Start the agent's task with
`Read <absolute role file> and follow it.` For node agents, move the shared prompt's `Agent file:` path
into that first sentence and send the remaining node line or lines unchanged. For the auditor, append
the slug, feature worktree, branch, and feature context from the review skill.

Use the background subagent path in the run skill. Track each agent ID with its role and nodes. Wait
for any result, handle completed agents as they return, then close them if supported to free slots.
A timeout leaves the agent in flight. A tool response that reports capacity exhaustion leaves that
node queued. Once a slot opens, schedule the next ready implementation or review. Use a separate
agent for each re-review and take the verdict from its final reply. Only the main session merges
branches and writes to Relate.
