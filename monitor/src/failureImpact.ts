interface WaitingTask {
  node: string
  state: string
  waiting_on: string[]
}

// Return the distinct blocked descendants of each failure, even when paths overlap.
export function blockedByFailure(tasks: WaitingTask[]): Map<string, string[]> {
  const dependents = new Map<string, WaitingTask[]>()
  for (const task of tasks) {
    for (const dependency of task.waiting_on) {
      const waiting = dependents.get(dependency) ?? []
      waiting.push(task)
      dependents.set(dependency, waiting)
    }
  }

  const impact = new Map<string, string[]>()
  for (const task of tasks) {
    if (task.state !== "failed") continue
    const visited = new Set([task.node])
    const pending = [...(dependents.get(task.node) ?? [])]
    const blocked: string[] = []
    while (pending.length) {
      const next = pending.pop()!
      if (visited.has(next.node)) continue
      visited.add(next.node)
      if (next.state === "blocked") blocked.push(next.node)
      for (const dependent of dependents.get(next.node) ?? []) pending.push(dependent)
    }
    impact.set(task.node, blocked)
  }
  return impact
}
