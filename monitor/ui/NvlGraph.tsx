// NVL rendering of one feature's dependency graph: hierarchical-by-wave layout
// (waves as layers, toggle to force-directed), nodes colored by status from the
// theme tokens, directed DEPENDS_ON rels, zoom/fit controls, click to select,
// double-click a node to focus its transitive upstream+downstream neighborhood
// (restyle only), double-click the canvas or Esc to reset the focus.
import { useEffect, useMemo, useRef, useState } from "react"
import type { RefObject } from "react"
import type NVL from "@neo4j-nvl/base"
import type { Layout, NvlOptions } from "@neo4j-nvl/base"
import { InteractiveNvlWrapper } from "@neo4j-nvl/react"
import type { GraphNode } from "./api.ts"

// The canvas renderer cannot resolve CSS custom properties, so colors are read
// from the theme tokens at render time. The fallbacks mirror theme.css and are
// only used where the stylesheet is not loaded (e.g. jsdom tests).
export const resolveToken = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

const FALLBACK_COLORS: Record<string, string> = {
  completed: "#4caf7d",
  in_progress: "#e2a336",
  frontier: "#5b9dff",
  blocked: "#8b94a3",
  failed: "#e5534b",
  cancelled: "#5a6270",
}

export const statusColor = (status: string) =>
  resolveToken(`--status-${status.replaceAll("_", "-")}`) || FALLBACK_COLORS[status] || FALLBACK_COLORS.blocked!

const relColor = () => resolveToken("--text-dim") || FALLBACK_COLORS.blocked!

// Alpha suffix appended to a hex color to dim elements outside the focused
// neighborhood — a restyle, no refetch.
const DIM_ALPHA = "2e"
const dimColor = (color: string | undefined) => (color ? `${color}${DIM_ALPHA}` : color)

export const toNvlGraph = (nodes: GraphNode[]) => ({
  nodes: nodes.map((n) => ({ id: n.slug, caption: n.slug, color: statusColor(n.status) })),
  rels: nodes.flatMap((n) =>
    n.depends_on.map((dep) => ({ id: `${n.slug}->${dep}`, from: n.slug, to: dep, color: relColor() })),
  ),
})

// The node itself plus its transitive upstream (dependencies) and downstream
// (dependents) closure over DEPENDS_ON.
export const neighborhood = (nodes: GraphNode[], slug: string): Set<string> => {
  const down = new Map<string, string[]>()
  for (const n of nodes) for (const dep of n.depends_on) down.set(dep, [...(down.get(dep) ?? []), n.slug])
  const deps = new Map(nodes.map((n) => [n.slug, n.depends_on]))
  const seen = new Set([slug])
  const queue = [slug]
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

export interface NvlGraphProps {
  nodes: GraphNode[]
  /** Slug of the node shown in the side panel; its NVL node is marked selected. */
  selectedSlug?: string | null
  onNodeClick?: (slug: string) => void
  onCanvasDoubleClick?: () => void
  /** Access to the NVL instance (zoom/fit controls, tests). */
  nvlRef?: RefObject<NVL | null>
}

export function NvlGraph({ nodes, selectedSlug = null, onNodeClick, onCanvasDoubleClick, nvlRef }: NvlGraphProps) {
  const internalRef = useRef<NVL>(null)
  const ref = nvlRef ?? internalRef
  const [layout, setLayout] = useState<Layout>("hierarchical")
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

  const base = useMemo(() => toNvlGraph(nodes), [nodes])
  const styled = useMemo(() => {
    const hood = focus ? neighborhood(nodes, focus) : null
    return {
      nodes: base.nodes.map((n) => ({
        ...n,
        selected: n.id === selectedSlug,
        color: hood && !hood.has(n.id) ? dimColor(n.color) : n.color,
      })),
      rels: base.rels.map((r) => ({
        ...r,
        color: hood && !(hood.has(r.from) && hood.has(r.to)) ? dimColor(r.color) : r.color,
      })),
    }
  }, [base, nodes, focus, selectedSlug])

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

  return (
    <div className="graph-frame">
      <div className="graph-toolbar">
        <button
          type="button"
          aria-pressed={layout === "forceDirected"}
          onClick={() => setLayout((current) => (current === "hierarchical" ? "forceDirected" : "hierarchical"))}
        >
          layout: {layout === "hierarchical" ? "hierarchical" : "force-directed"}
        </button>
        <button type="button" aria-label="zoom in" onClick={() => zoomBy(1.25)}>
          +
        </button>
        <button type="button" aria-label="zoom out" onClick={() => zoomBy(0.8)}>
          −
        </button>
        <button type="button" aria-label="fit graph" onClick={() => ref.current?.fit(nodes.map((n) => n.slug))}>
          fit
        </button>
      </div>
      <div style={{ width: "100%", height: "480px" }}>
        <InteractiveNvlWrapper
          ref={ref}
          nodes={styled.nodes}
          rels={styled.rels}
          nvlOptions={nvlOptions}
          mouseEventCallbacks={{
            onZoomAndPan: true,
            onNodeClick: (node: { id: string }) => onNodeClick?.(node.id),
            onNodeDoubleClick: (node: { id: string }) => setFocus(node.id),
            onCanvasDoubleClick: () => {
              setFocus(null)
              onCanvasDoubleClick?.()
            },
          }}
        />
      </div>
    </div>
  )
}
