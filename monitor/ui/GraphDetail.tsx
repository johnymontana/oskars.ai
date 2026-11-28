// Feature detail view with hash-addressable tabs: Graph (the full-store graph
// explorer — dependency skeleton with toggleable contract/acceptance/reviews/
// knowledge layers, a relationship-type legend, and a side panel opened from
// the graph or the compact wave list, NodePanel for GbuildNode elements and a
// generic element panel for other nodes and relationships), Timeline (per-node run bars on a shared
// time axis), Acceptance (feature criteria with their covering nodes), Repairs
// (per-node review attempt history) and Query (ad-hoc read-only Cypher
// console). Polls /api/features/:ref/graph, /api/features/:ref/store-graph
// and /api/knowledge.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import type NVL from "@neo4j-nvl/base"
import type { GraphNode } from "../src/graph.ts"
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
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const panelHeading = useRef<HTMLHeadingElement>(null)
  const focusOrigin = useRef<HTMLButtonElement | null>(null)
  const focusRequested = useRef(false)
  const featureSection = useRef<HTMLElement>(null)

  useEffect(() => {
    setSelectedSlug(node ?? null)
    if (node) setSelectedElementId(null)
  }, [slug, node])

  const selectNode = useCallback((nodeSlug: string | null) => {
    setSelectedSlug(nodeSlug)
    onNodeChange?.(nodeSlug ?? undefined)
  }, [onNodeChange])

  const clearSelection = useCallback(() => {
    selectNode(null)
    setSelectedElementId(null)
    focusRequested.current = false
    const origin = focusOrigin.current
    focusOrigin.current = null
    if (origin?.isConnected) origin.focus()
    else if (origin) featureSection.current?.querySelector<HTMLInputElement>(".graph-element-list input")?.focus()
  }, [selectNode])

  useLayoutEffect(() => {
    if (focusRequested.current && panelHeading.current) {
      panelHeading.current.focus()
      focusRequested.current = false
    }
  })

  useEffect(() => {
    if (tab !== "graph" || (!selectedSlug && !selectedElementId)) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") clearSelection()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [tab, selectedSlug, selectedElementId, clearSelection])

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

  const selectedElement = selectedElementId === null ? null
    : storeData?.nodes.find((element) => element.id === selectedElementId)
      ?? storeData?.rels.find((element) => element.id === selectedElementId)
      ?? null

  const openNode = (nodeSlug: string, origin?: HTMLButtonElement) => {
    focusOrigin.current = origin ?? null
    if (origin && nodeSlug === selectedSlug) panelHeading.current?.focus()
    else focusRequested.current = Boolean(origin)
    setSelectedElementId(null)
    selectNode(nodeSlug)
  }

  const openElement = (id: string, requestFocus: boolean) => {
    if (requestFocus && id === selectedElementId) panelHeading.current?.focus()
    else focusRequested.current = requestFocus
    selectNode(null)
    setSelectedElementId(id)
  }

  const onExplorerNodeClick = (id: string, origin?: HTMLButtonElement) => {
    const element = storeData?.nodes.find((candidate) => candidate.id === id)
    if (element?.labels.includes("GbuildNode")) {
      openNode(String(element.properties.slug), origin)
    } else {
      focusOrigin.current = origin ?? null
      openElement(id, Boolean(origin))
    }
  }

  const onExplorerRelClick = (id: string, origin?: HTMLButtonElement) => {
    focusOrigin.current = origin ?? null
    openElement(id, Boolean(origin))
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
    <section ref={featureSection}>
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
        <QueryTab key={data.store_id} storeId={data.store_id} project={data.project} feature={data.slug} />
      ) : (
        <>
          <RefreshNotice error={storeError} updatedAt={storeUpdatedAt} />
          {!storeData ? (
            !storeError && <p className="state state-loading">loading…</p>
          ) : (
            <StoreGraphExplorer
              graph={storeData}
              statusBySlug={statusBySlug}
              selectedId={selectedNodeId ?? selectedElementId}
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
              headingRef={panelHeading}
              onClose={clearSelection}
            />
          )}
          {selectedElement && storeData && (
            <ElementPanel
              element={selectedElement}
              graph={storeData}
              headingRef={panelHeading}
              onClose={clearSelection}
              onInspectRelationship={(id) => openElement(id, true)}
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
                      <button
                        type="button"
                        onClick={(event) => openNode(node.slug, event.currentTarget)}
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
