// Graph detail view: the NVL dependency graph as the primary surface, a node
// detail side panel (opened from the graph or the compact wave list, closed by
// Esc or canvas double-click), and the wave-grouped node summary list. Polls
// /api/features/:slug/graph and /api/knowledge.
import { useEffect, useState } from "react"
import type { GraphNode } from "../src/graph.ts"
import { fetchGraph, fetchKnowledge } from "./api.ts"
import { NodePanel } from "./NodePanel.tsx"
import { NvlGraph } from "./NvlGraph.tsx"
import { StatusChip } from "./StatusChip.tsx"
import { usePoll } from "./usePoll.ts"

export function GraphDetail({ slug, pollInterval }: { slug: string; pollInterval?: number }) {
  const { data, error } = usePoll(() => fetchGraph(slug), pollInterval)
  const { data: knowledge } = usePoll(fetchKnowledge, pollInterval)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)

  // Esc closes the side panel.
  useEffect(() => {
    if (!selectedSlug) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedSlug(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selectedSlug])

  if (error) return (
    <p role="alert" className="state state-error">
      failed to load graph: {error}
    </p>
  )
  if (!data) return <p className="state state-loading">loading…</p>

  const selected = data.nodes.find((n) => n.slug === selectedSlug) ?? null
  const leftBySelected = (item: { by_node: string; project: string; feature: string }) =>
    selected !== null && item.by_node === selected.slug && item.project === data.project && item.feature === data.slug

  const waves = new Map<number, GraphNode[]>()
  for (const node of data.nodes) {
    const group = waves.get(node.wave) ?? []
    group.push(node)
    waves.set(node.wave, group)
  }
  return (
    <section>
      <h1>{data.slug}</h1>
      <p>
        <span className="mono">{data.project}</span> — {data.destination}
      </p>
      <p>
        <a href="#/">← all features</a>
      </p>
      <NvlGraph
        nodes={data.nodes}
        selectedSlug={selectedSlug}
        onNodeClick={setSelectedSlug}
        onCanvasDoubleClick={() => setSelectedSlug(null)}
      />
      {selected && (
        <NodePanel
          node={selected}
          notes={(knowledge?.notes ?? []).filter(leftBySelected)}
          symbols={(knowledge?.symbols ?? []).filter(leftBySelected)}
          onClose={() => setSelectedSlug(null)}
        />
      )}
      {[...waves.entries()]
        .sort(([a], [b]) => a - b)
        .map(([wave, nodes]) => (
          <section key={wave}>
            <h2>wave {wave}</h2>
            <ul className="wave-list">
              {nodes.map((node) => (
                <li key={node.slug}>
                  <button type="button" onClick={() => setSelectedSlug(node.slug)}>
                    <span className="mono">{node.slug}</span> <StatusChip status={node.status} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </section>
  )
}
