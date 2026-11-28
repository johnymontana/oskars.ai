// Feature detail view with hash-addressable tabs: Graph (the full-store graph
// explorer — dependency skeleton with toggleable contract/acceptance/reviews/
// knowledge layers, a relationship-type legend, and a side panel opened from
// the graph or the compact wave list, NodePanel for GbuildNode elements and a
// generic element panel for other nodes and relationships), Timeline (per-node run bars on a shared
// time axis), Acceptance (feature criteria with their covering nodes), Repairs
// (per-node review attempt history) and Query (ad-hoc read-only Cypher
// console). Polls /api/features/:ref/graph, /api/features/:ref/store-graph
// and /api/knowledge.
import { useEffect, useState } from "react"
import type { RefObject } from "react"
import type NVL from "@neo4j-nvl/base"
import type { GraphNode } from "../src/graph.ts"
import type { StoreGraphNode, StoreGraphRel } from "../src/storegraph.ts"
import { AcceptanceTab } from "./AcceptanceTab.tsx"
import { AmbiguousStoreError, fetchGraph, fetchKnowledge, fetchStoreGraph } from "./api.ts"
import { ElementPanel } from "./ElementPanel.tsx"
import { NodePanel } from "./NodePanel.tsx"
import { QueryTab } from "./QueryTab.tsx"
import { RefreshNotice } from "./RefreshNotice.tsx"
import { RepairsTab } from "./RepairsTab.tsx"
import { featureHref, type FeatureTab } from "./routes.ts"
import { StatusChip } from "./StatusChip.tsx"
import { StoreGraphExplorer } from "./StoreGraphExplorer.tsx"
import { TimelineTab } from "./TimelineTab.tsx"
import { usePoll } from "./usePoll.ts"

const TABS: { id: FeatureTab; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "timeline", label: "Timeline" },
  { id: "acceptance", label: "Acceptance" },
  { id: "repairs", label: "Repairs" },
  { id: "query", label: "Query" },
]

export function GraphDetail({
  slug,
  tab = "graph",
  node,
  onNodeChange,
  pollInterval,
  nvlRef,
}: {
  slug: string
  tab?: FeatureTab
  node?: string
  onNodeChange?: (node?: string) => void
  pollInterval?: number
  nvlRef?: RefObject<NVL | null>
}) {
  const { data, error, updatedAt } = usePoll((signal) => fetchGraph(slug, signal), pollInterval, slug)
  const storeId = data?.store_id
  const { data: storeData, error: storeError, updatedAt: storeUpdatedAt } = usePoll(
    storeId && tab === "graph" ? (signal) => fetchStoreGraph(storeId, signal) : null,
    pollInterval,
    storeId,
  )
  const { data: knowledge } = usePoll(tab === "graph" ? fetchKnowledge : null, pollInterval)
  const [selectedSlug, setSelectedSlug] = useState<string | null>(node ?? null)
  const [selectedElement, setSelectedElement] = useState<StoreGraphNode | null>(null)
  const [selectedRel, setSelectedRel] = useState<StoreGraphRel | null>(null)

  useEffect(() => {
    setSelectedSlug(node ?? null)
    if (node) {
      setSelectedElement(null)
      setSelectedRel(null)
    }
  }, [slug, node])

  const selectNode = (nodeSlug: string | null) => {
    setSelectedSlug(nodeSlug)
    onNodeChange?.(nodeSlug ?? undefined)
  }

  const clearSelection = () => {
    selectNode(null)
    setSelectedElement(null)
    setSelectedRel(null)
  }

  // Esc closes the side panel.
  useEffect(() => {
    if (!selectedSlug && !selectedElement && !selectedRel) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [selectedSlug, selectedElement, selectedRel, onNodeChange])

  if (error instanceof AmbiguousStoreError) return (
    <section>
      <h1>Choose a project for {slug}</h1>
      <p>This feature name appears in multiple projects.</p>
      <ul>
        {error.matches.map((match) => (
          <li key={match.store_id}>
            <a href={featureHref(match.store_id, tab, node)}>{match.project} / {match.slug}</a>
          </li>
        ))}
      </ul>
    </section>
  )
  if (!data) return error
    ? <RefreshNotice error={error} updatedAt={updatedAt} />
    : <p className="state state-loading">loading…</p>

  const selected = data.nodes.find((candidate) => candidate.slug === selectedSlug) ?? null
  const leftBySelected = (item: { by_node: string; store_id: string }) =>
    selected !== null && item.by_node === selected.slug && item.store_id === data.store_id
  const statusBySlug = new Map(data.nodes.map((n) => [n.slug, n.status]))

  // A graph click on a GbuildNode opens the node panel as before; any other
  // label opens the generic element panel. A relationship click opens the
  // element panel on that rel.
  const onExplorerNodeClick = (id: string) => {
    const element = storeData?.nodes.find((n) => n.id === id)
    setSelectedRel(null)
    if (element?.labels.includes("GbuildNode")) {
      selectNode(String(element.properties.slug))
      setSelectedElement(null)
    } else {
      setSelectedElement(element ?? null)
      selectNode(null)
    }
  }

  const onExplorerRelClick = (id: string) => {
    setSelectedRel(storeData?.rels.find((r) => r.id === id) ?? null)
    selectNode(null)
    setSelectedElement(null)
  }

  // The selected GbuildNode's store-graph id comes from the fetched graph —
  // the id scheme is the server's, never reconstructed client-side.
  const selectedNodeId =
    selectedSlug === null
      ? null
      : (storeData?.nodes.find((n) => n.labels.includes("GbuildNode") && n.properties.slug === selectedSlug)?.id ??
        null)

  const waves = new Map<number, GraphNode[]>()
  for (const node of data.nodes) {
    const group = waves.get(node.wave) ?? []
    group.push(node)
    waves.set(node.wave, group)
  }
  return (
    <section>
      <h1>{data.slug}</h1>
      <RefreshNotice error={error} updatedAt={updatedAt} />
      <p>
        <span className="mono">{data.project}</span> — {data.destination}
      </p>
      <p>
        <a href="#/">← all features</a>
      </p>
      <nav className="tab-bar" aria-label="feature views">
        {TABS.map((t) => (
          <a key={t.id} href={featureHref(data.store_id, t.id, t.id === "graph" ? selectedSlug ?? undefined : undefined)} aria-current={tab === t.id ? "page" : undefined}>
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
        <QueryTab slug={data.store_id} />
      ) : (
        <>
          <RefreshNotice error={storeError} updatedAt={storeUpdatedAt} />
          {!storeData ? (
            !storeError && <p className="state state-loading">loading…</p>
          ) : (
            <StoreGraphExplorer
              graph={storeData}
              statusBySlug={statusBySlug}
              selectedId={selectedNodeId ?? selectedElement?.id ?? selectedRel?.id ?? null}
              onNodeClick={onExplorerNodeClick}
              onRelClick={onExplorerRelClick}
              onCanvasDoubleClick={clearSelection}
              nvlRef={nvlRef}
            />
          )}
          {selected && (
            <NodePanel
              node={selected}
              notes={(knowledge?.notes ?? []).filter(leftBySelected)}
              symbols={(knowledge?.symbols ?? []).filter(leftBySelected)}
              onClose={() => selectNode(null)}
            />
          )}
          {selectedElement && storeData && (
            <ElementPanel element={selectedElement} graph={storeData} onClose={() => setSelectedElement(null)} />
          )}
          {selectedRel && storeData && (
            <ElementPanel element={selectedRel} graph={storeData} onClose={() => setSelectedRel(null)} />
          )}
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
                          selectNode(node.slug)
                          setSelectedElement(null)
                          setSelectedRel(null)
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
