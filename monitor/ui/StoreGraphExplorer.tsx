// Full-store graph explorer for the feature detail Graph tab: every element of
// the store as NVL nodes/rels, with the dependency skeleton (GbuildNode +
// DEPENDS_ON, status colors) always on and four toggleable layers — contract
// (Field, INPUT/OUTPUT/FROM), acceptance (Feature/Acceptance,
// HAS_ACCEPTANCE/SATISFIES), reviews (Review, REVIEWED) and knowledge
// (Note/Symbol, WROTE/DEFINES). The legend below the toolbar lists every
// relationship type present in the data with its color; layer toggles sit with
// it. Layout is hierarchical-by-wave for skeleton-only and switches to
// force-directed once any layer is on; the manual toggle still works. With the
// contract layer on, FROM rels caption the recorded value flowing through them.
import { useMemo, useRef, useState } from "react"
import type { RefObject } from "react"
import type NVL from "@neo4j-nvl/base"
import type { Layout, NvlOptions } from "@neo4j-nvl/base"
import { InteractiveNvlWrapper } from "@neo4j-nvl/react"
import type { StoreGraph, StoreGraphNode, StoreGraphRel } from "./api.ts"
import { resolveToken, statusColor } from "./NvlGraph.tsx"

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

export interface StoreGraphExplorerProps {
  graph: StoreGraph
  /** Derived status per GbuildNode slug (frontier/blocked come from /graph). */
  statusBySlug: ReadonlyMap<string, string>
  /** Element id shown in the side panel; its NVL node is marked selected. */
  selectedId?: string | null
  onNodeClick?: (id: string) => void
  onCanvasDoubleClick?: () => void
  /** Access to the NVL instance (zoom/fit controls, tests). */
  nvlRef?: RefObject<NVL | null>
}

export function StoreGraphExplorer({
  graph,
  statusBySlug,
  selectedId = null,
  onNodeClick,
  onCanvasDoubleClick,
  nvlRef,
}: StoreGraphExplorerProps) {
  const internalRef = useRef<NVL>(null)
  const ref = nvlRef ?? internalRef
  const [layers, setLayers] = useState<ReadonlySet<Layer>>(new Set())
  // null = follow the automatic layout for the current layers; the toolbar
  // toggle pins an explicit choice until the layers change again.
  const [pinnedLayout, setPinnedLayout] = useState<Layout | null>(null)
  const layout: Layout = pinnedLayout ?? (layers.size > 0 ? "forceDirected" : "hierarchical")

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
  const styledNodes = useMemo(
    () => nodes.map((n) => ({ ...n, selected: n.id === selectedId })),
    [nodes, selectedId],
  )

  const nvlOptions = useMemo<NvlOptions>(
    () => ({
      renderer: "canvas",
      layout,
      layoutOptions: layout === "hierarchical" ? { direction: "left" as const } : undefined,
    }),
    [layout],
  )

  const zoomBy = (factor: number) => {
    const scale = ref.current?.getScale()
    if (scale) ref.current?.setZoom(scale * factor)
  }

  const relTypesPresent = useMemo(() => [...new Set(graph.rels.map((r) => r.type))].sort(), [graph])

  return (
    <div className="graph-frame">
      <div className="graph-toolbar">
        <button
          type="button"
          aria-pressed={layout === "forceDirected"}
          onClick={() => setPinnedLayout(layout === "hierarchical" ? "forceDirected" : "hierarchical")}
        >
          layout: {layout === "hierarchical" ? "hierarchical" : "force-directed"}
        </button>
        <button type="button" aria-label="zoom in" onClick={() => zoomBy(1.25)}>
          +
        </button>
        <button type="button" aria-label="zoom out" onClick={() => zoomBy(0.8)}>
          −
        </button>
        <button type="button" aria-label="fit graph" onClick={() => ref.current?.fit(nodes.map((n) => n.id))}>
          fit
        </button>
      </div>
      <div style={{ width: "100%", height: "480px" }}>
        <InteractiveNvlWrapper
          ref={ref}
          nodes={styledNodes}
          rels={rels}
          nvlOptions={nvlOptions}
          mouseEventCallbacks={{
            onZoomAndPan: true,
            onNodeClick: (node: { id: string }) => onNodeClick?.(node.id),
            onCanvasDoubleClick: () => onCanvasDoubleClick?.(),
          }}
        />
      </div>
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
          {relTypesPresent.map((type) => (
            <span key={type} className="legend-item">
              <span className="legend-swatch" data-color={relTypeColor(type)} style={{ backgroundColor: relTypeColor(type) }} />
              {type}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}
