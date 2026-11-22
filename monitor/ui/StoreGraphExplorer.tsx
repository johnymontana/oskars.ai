// Full-store graph explorer for the feature detail Graph tab: every element of
// the store as NVL nodes/rels, with the dependency skeleton (GbuildNode +
// DEPENDS_ON, status colors) always on and four toggleable layers — contract
// (Field, INPUT/OUTPUT/FROM), acceptance (Feature/Acceptance,
// HAS_ACCEPTANCE/SATISFIES), reviews (Review, REVIEWED) and knowledge
// (Note/Symbol, WROTE/DEFINES). The legend below the toolbar lists every
// relationship type present in the data with its color; layer toggles sit with
// it. Layout is hierarchical-by-wave for skeleton-only and switches to
// force-directed once any layer is on; the manual toggle still works. With the
// contract layer on, FROM rels caption the recorded value flowing through
// them. Double-click a node to focus its transitive upstream+downstream
// neighborhood over DEPENDS_ON (restyle only); Esc or a canvas double-click
// resets the focus.
import { useEffect, useMemo, useState } from "react"
import type { RefObject } from "react"
import type NVL from "@neo4j-nvl/base"
import type { Layout } from "@neo4j-nvl/base"
import type { StoreGraph, StoreGraphNode, StoreGraphRel } from "./api.ts"
import { resolveToken, statusColor } from "./colors.ts"
import { GraphFrame } from "./GraphFrame.tsx"

export type Layer = "contract" | "acceptance" | "reviews" | "knowledge"

// The skeleton (GbuildNode + DEPENDS_ON) is always on; each toggleable layer
// adds its node labels and rel types. Feature rides with the acceptance layer
// because it is the HAS_ACCEPTANCE endpoint.
const SKELETON = { labels: ["GbuildNode"], relTypes: ["DEPENDS_ON"] }
export const LAYERS: { id: Layer; labels: string[]; relTypes: string[] }[] = [
  { id: "contract", labels: ["Field"], relTypes: ["INPUT", "OUTPUT", "FROM"] },
  { id: "acceptance", labels: ["Feature", "Acceptance"], relTypes: ["HAS_ACCEPTANCE", "SATISFIES"] },
  { id: "reviews", labels: ["Review"], relTypes: ["REVIEWED"] },
  { id: "knowledge", labels: ["Note", "Symbol"], relTypes: ["WROTE", "DEFINES"] },
]

// One color per relationship type, from the --rel-* theme tokens; the
// fallbacks mirror theme.css and apply where the stylesheet is not loaded
// (jsdom tests).
export const FALLBACK_REL_COLORS: Record<string, string> = {
  DEPENDS_ON: "#8b94a3",
  INPUT: "#5b9dff",
  OUTPUT: "#4caf7d",
  FROM: "#e2a336",
  HAS_ACCEPTANCE: "#ab7bd8",
  SATISFIES: "#56c2d6",
  REVIEWED: "#e5534b",
  WROTE: "#d878b0",
  DEFINES: "#9dbb4f",
}

export const relTypeColor = (type: string) =>
  resolveToken(`--rel-${type.toLowerCase().replaceAll("_", "-")}`) ||
  FALLBACK_REL_COLORS[type] ||
  FALLBACK_REL_COLORS.DEPENDS_ON!

const elementColor = () => resolveToken("--accent") || "#6aa3ff"

// Alpha suffix appended to a hex color to dim elements outside the focused
// neighborhood — a restyle, no refetch.
const DIM_ALPHA = "2e"
const dimColor = (color: string | undefined) => (color ? `${color}${DIM_ALPHA}` : color)

const truncate = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max)}…` : text)
const valueText = (value: unknown) => (value == null ? null : truncate(JSON.stringify(value) ?? ""))

// NVL captions per label: slug for GbuildNode, `name: value` for Field, the
// identifying property for the rest.
export const elementCaption = (node: StoreGraphNode): string => {
  const p = node.properties
  if (node.labels.includes("GbuildNode")) return String(p.slug)
  if (node.labels.includes("Field")) {
    const value = valueText(p.value)
    return value === null ? String(p.name) : `${String(p.name)}: ${value}`
  }
  if (node.labels.includes("Acceptance")) return String(p.id)
  if (node.labels.includes("Feature")) return String(p.feature)
  if (node.labels.includes("Review")) return `attempt ${String(p.attempt)}`
  if (node.labels.includes("Note")) return String(p.topic)
  if (node.labels.includes("Symbol")) return String(p.name)
  return node.id
}

const relCaption = (rel: StoreGraphRel, byId: Map<string, StoreGraphNode>): string | undefined => {
  // A FROM edge runs (input Field)-[:FROM]->(output Field); the recorded value
  // lives on the upstream output field it points at.
  if (rel.type !== "FROM") return undefined
  const value = valueText(byId.get(rel.to)?.properties.value)
  return value === null ? undefined : value
}

// The nodes/rels visible with the given layers on: skeleton plus each enabled
// layer's labels/types, rels dropped when an endpoint is not visible.
export const toStoreNvl = (graph: StoreGraph, layers: ReadonlySet<Layer>, statusBySlug: ReadonlyMap<string, string>) => {
  const labels = new Set(SKELETON.labels)
  const relTypes = new Set(SKELETON.relTypes)
  for (const layer of LAYERS) {
    if (!layers.has(layer.id)) continue
    for (const l of layer.labels) labels.add(l)
    for (const t of layer.relTypes) relTypes.add(t)
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]))
  const nodes = graph.nodes.filter((n) => n.labels.some((l) => labels.has(l)))
  const visible = new Set(nodes.map((n) => n.id))
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      caption: elementCaption(n),
      color: n.labels.includes("GbuildNode")
        ? statusColor(statusBySlug.get(String(n.properties.slug)) ?? String(n.properties.status ?? "blocked"))
        : elementColor(),
    })),
    rels: graph.rels
      .filter((r) => relTypes.has(r.type) && visible.has(r.from) && visible.has(r.to))
      .map((r) => ({ id: r.id, type: r.type, from: r.from, to: r.to, color: relTypeColor(r.type), caption: relCaption(r, byId) })),
  }
}

// The element itself plus its transitive upstream (dependencies) and
// downstream (dependents) closure over DEPENDS_ON.
export const neighborhood = (graph: StoreGraph, id: string): Set<string> => {
  const deps = new Map<string, string[]>()
  const down = new Map<string, string[]>()
  for (const r of graph.rels) {
    if (r.type !== "DEPENDS_ON") continue
    deps.set(r.from, [...(deps.get(r.from) ?? []), r.to])
    down.set(r.to, [...(down.get(r.to) ?? []), r.from])
  }
  const seen = new Set([id])
  const queue = [id]
  while (queue.length > 0) {
    const current = queue.pop() as string
    for (const next of [...(deps.get(current) ?? []), ...(down.get(current) ?? [])]) {
      if (!seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen
}

export interface StoreGraphExplorerProps {
  graph: StoreGraph
  /** Derived status per GbuildNode slug (frontier/blocked come from /graph). */
  statusBySlug: ReadonlyMap<string, string>
  /** Element id shown in the side panel; its NVL node or rel is marked selected. */
  selectedId?: string | null
  onNodeClick?: (id: string) => void
  onRelClick?: (id: string) => void
  onCanvasDoubleClick?: () => void
  /** Access to the NVL instance (zoom/fit controls, tests). */
  nvlRef?: RefObject<NVL | null>
}

export function StoreGraphExplorer({
  graph,
  statusBySlug,
  selectedId = null,
  onNodeClick,
  onRelClick,
  onCanvasDoubleClick,
  nvlRef,
}: StoreGraphExplorerProps) {
  const [layers, setLayers] = useState<ReadonlySet<Layer>>(new Set())
  // null = follow the automatic layout for the current layers; the toolbar
  // toggle pins an explicit choice until the layers change again.
  const [pinnedLayout, setPinnedLayout] = useState<Layout | null>(null)
  const layout: Layout = pinnedLayout ?? (layers.size > 0 ? "forceDirected" : "hierarchical")
  const [focus, setFocus] = useState<string | null>(null)

  // Esc resets the neighborhood focus.
  useEffect(() => {
    if (!focus) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFocus(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [focus])

  const toggleLayer = (layer: Layer) => {
    setLayers((current) => {
      const next = new Set(current)
      if (next.has(layer)) next.delete(layer)
      else next.add(layer)
      return next
    })
    setPinnedLayout(null)
  }

  const { nodes, rels } = useMemo(() => toStoreNvl(graph, layers, statusBySlug), [graph, layers, statusBySlug])
  const styled = useMemo(() => {
    const hood = focus ? neighborhood(graph, focus) : null
    return {
      nodes: nodes.map((n) => ({
        ...n,
        selected: n.id === selectedId,
        color: hood && !hood.has(n.id) ? dimColor(n.color) : n.color,
      })),
      rels: rels.map((r) => ({
        ...r,
        selected: r.id === selectedId,
        color: hood && !(hood.has(r.from) && hood.has(r.to)) ? dimColor(r.color) : r.color,
      })),
    }
  }, [nodes, rels, graph, focus, selectedId])

  const relTypesPresent = useMemo(() => [...new Set(graph.rels.map((r) => r.type))].sort(), [graph])

  return (
    <GraphFrame
      nodes={styled.nodes}
      rels={styled.rels}
      layout={layout}
      onLayoutChange={setPinnedLayout}
      nvlRef={nvlRef}
      mouseEventCallbacks={{
        onZoomAndPan: true,
        onNodeClick: (node: { id: string }) => onNodeClick?.(node.id),
        onRelationshipClick: (rel: { id: string }) => onRelClick?.(rel.id),
        onNodeDoubleClick: (node: { id: string }) => setFocus(node.id),
        onCanvasDoubleClick: () => {
          setFocus(null)
          onCanvasDoubleClick?.()
        },
      }}
    >
      <div className="graph-legend">
        <span className="legend-group">
          layers:
          {LAYERS.map((layer) => (
            <button
              key={layer.id}
              type="button"
              aria-pressed={layers.has(layer.id)}
              onClick={() => toggleLayer(layer.id)}
            >
              {layer.id}
            </button>
          ))}
        </span>
        <span className="legend-group">
          {relTypesPresent.map((type) => {
            const color = relTypeColor(type)
            return (
              <span key={type} className="legend-item">
                <span className="legend-swatch" data-color={color} style={{ backgroundColor: color }} />
                {type}
              </span>
            )
          })}
        </span>
      </div>
    </GraphFrame>
  )
}
