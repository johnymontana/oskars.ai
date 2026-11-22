// Feature detail view with hash-addressable tabs: Graph (the full-store graph
// explorer — dependency skeleton with toggleable contract/acceptance/reviews/
// knowledge layers, a relationship-type legend, and a side panel opened from
// the graph or the compact wave list, NodePanel for GbuildNode elements and a
// generic element panel for the rest), Timeline (per-node run bars on a shared
// time axis), Acceptance (feature criteria with their covering nodes), Repairs
// (per-node review attempt history) and Query (ad-hoc read-only Cypher
// console). Polls /api/features/:slug/graph, /api/features/:slug/store-graph
// and /api/knowledge.
import { useEffect, useState } from "react"
import type { RefObject } from "react"
import type NVL from "@neo4j-nvl/base"
import type { GraphNode } from "../src/graph.ts"
import type { StoreGraphNode } from "../src/storegraph.ts"
import { AcceptanceTab } from "./AcceptanceTab.tsx"
import { fetchGraph, fetchKnowledge, fetchStoreGraph } from "./api.ts"
import { ElementPanel } from "./ElementPanel.tsx"
import { NodePanel } from "./NodePanel.tsx"
import { QueryTab } from "./QueryTab.tsx"
import { RepairsTab } from "./RepairsTab.tsx"
import { StatusChip } from "./StatusChip.tsx"
import { StoreGraphExplorer } from "./StoreGraphExplorer.tsx"
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

export function GraphDetail({
  slug,
  tab = "graph",
  pollInterval,
  nvlRef,
}: {
  slug: string
  tab?: FeatureTab
  pollInterval?: number
  nvlRef?: RefObject<NVL | null>
}) {
  const { data, error } = usePoll(() => fetchGraph(slug), pollInterval)
  const { data: storeData, error: storeError } = usePoll(() => fetchStoreGraph(slug), pollInterval)
  const { data: knowledge } = usePoll(fetchKnowledge, pollInterval)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [selectedElement, setSelectedElement] = useState<StoreGraphNode | null>(null)

  const clearSelection = () => {
    setSelectedSlug(null)
    setSelectedElement(null)
  }

  // Esc closes the side panel.
  useEffect(() => {
    if (!selectedSlug && !selectedElement) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selectedSlug, selectedElement])

  if (error) return (
    <p role="alert" className="state state-error">
      failed to load graph: {error}
    </p>
  )
  if (!data) return <p className="state state-loading">loading…</p>

  const selected = data.nodes.find((n) => n.slug === selectedSlug) ?? null
  const leftBySelected = (item: { by_node: string; project: string; feature: string }) =>
    selected !== null && item.by_node === selected.slug && item.project === data.project && item.feature === data.slug
  const statusBySlug = new Map(data.nodes.map((n) => [n.slug, n.status]))

  // A graph click on a GbuildNode opens the node panel as before; any other
  // label opens the generic element panel.
  const onExplorerNodeClick = (id: string) => {
    const element = storeData?.nodes.find((n) => n.id === id)
    if (element?.labels.includes("GbuildNode")) {
      setSelectedSlug(String(element.properties.slug))
      setSelectedElement(null)
    } else {
      setSelectedElement(element ?? null)
      setSelectedSlug(null)
    }
  }

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
          {storeError ? (
            <p role="alert" className="state state-error">
              failed to load store graph: {storeError}
            </p>
          ) : !storeData ? (
            <p className="state state-loading">loading…</p>
          ) : (
            <StoreGraphExplorer
              graph={storeData}
              statusBySlug={statusBySlug}
              selectedId={selectedSlug ? `GbuildNode:${selectedSlug}` : (selectedElement?.id ?? null)}
              onNodeClick={onExplorerNodeClick}
              onCanvasDoubleClick={clearSelection}
              nvlRef={nvlRef}
            />
          )}
          {selected && (
            <NodePanel
              node={selected}
              notes={(knowledge?.notes ?? []).filter(leftBySelected)}
              symbols={(knowledge?.symbols ?? []).filter(leftBySelected)}
              onClose={() => setSelectedSlug(null)}
            />
          )}
          {selectedElement && <ElementPanel node={selectedElement} onClose={() => setSelectedElement(null)} />}
          {[...waves.entries()]
            .sort(([a], [b]) => a - b)
            .map(([wave, nodes]) => (
              <section key={wave}>
                <h2>wave {wave}</h2>
                <ul className="wave-list">
                  {nodes.map((node) => (
                    <li key={node.slug}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSlug(node.slug)
                          setSelectedElement(null)
                        }}
                      >
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
