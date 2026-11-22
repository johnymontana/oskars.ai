// Feature detail view with hash-addressable tabs: Graph (the NVL dependency
// graph as the primary surface, a node detail side panel opened from the graph
// or the compact wave list, and the wave-grouped node summary list), Timeline
// (per-node run bars on a shared time axis), Acceptance (feature criteria with
// their covering nodes), Repairs (per-node review attempt history) and Query
// (ad-hoc read-only Cypher console). Polls
// /api/features/:slug/graph and /api/knowledge.
import { useEffect, useState } from "react"
import type { GraphNode } from "../src/graph.ts"
import { AcceptanceTab } from "./AcceptanceTab.tsx"
import { fetchGraph, fetchKnowledge } from "./api.ts"
import { NodePanel } from "./NodePanel.tsx"
import { NvlGraph } from "./NvlGraph.tsx"
import { QueryTab } from "./QueryTab.tsx"
import { RepairsTab } from "./RepairsTab.tsx"
import { StatusChip } from "./StatusChip.tsx"
import { TimelineTab } from "./TimelineTab.tsx"
import { usePoll } from "./usePoll.ts"

export type FeatureTab = "graph" | "timeline" | "acceptance" | "repairs" | "query"

const TABS: { id: FeatureTab; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "timeline", label: "Timeline" },
  { id: "acceptance", label: "Acceptance" },
  { id: "repairs", label: "Repairs" },
  { id: "query", label: "Query" },
]

const tabHref = (slug: string, tab: FeatureTab) =>
  `#/features/${encodeURIComponent(slug)}${tab === "graph" ? "" : `/${tab}`}`

export function GraphDetail({ slug, tab = "graph", pollInterval }: { slug: string; tab?: FeatureTab; pollInterval?: number }) {
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
      <nav className="tab-bar" aria-label="feature views">
        {TABS.map((t) => (
          <a key={t.id} href={tabHref(data.slug, t.id)} aria-current={tab === t.id ? "page" : undefined}>
            {t.label}
          </a>
        ))}
      </nav>
      {tab === "timeline" ? (
        <TimelineTab nodes={data.nodes} />
      ) : tab === "acceptance" ? (
        <AcceptanceTab acceptance={data.acceptance} nodes={data.nodes} />
      ) : tab === "repairs" ? (
        <RepairsTab nodes={data.nodes} />
      ) : tab === "query" ? (
        <QueryTab slug={data.slug} />
      ) : (
        <>
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
        </>
      )}
    </section>
  )
}
