// Shared NVL frame: the .graph-frame wrapper with the layout/zoom/fit toolbar
// above an InteractiveNvlWrapper. Every view that renders an NVL graph — the
// store explorer, the query results and the knowledge view — goes through
// this frame, so the toolbar markup and zoom logic exist exactly once.
// Optional children render below the canvas (the explorer's legend).
import { useMemo, useRef } from "react"
import type { ReactNode, RefObject } from "react"
import type NVL from "@neo4j-nvl/base"
import type { Layout, Node, NvlOptions, Relationship } from "@neo4j-nvl/base"
import { InteractiveNvlWrapper } from "@neo4j-nvl/react"
import type { MouseEventCallbacks } from "@neo4j-nvl/react"

export interface GraphFrameProps {
  nodes: Node[]
  rels: Relationship[]
  layout: Layout
  onLayoutChange: (layout: Layout) => void
  /** Canvas height in px; defaults to 480. */
  height?: number
  /** Access to the NVL instance (zoom/fit controls, tests). */
  nvlRef?: RefObject<NVL | null>
  mouseEventCallbacks?: MouseEventCallbacks
  children?: ReactNode
}

export function GraphFrame({
  nodes,
  rels,
  layout,
  onLayoutChange,
  height = 480,
  nvlRef,
  mouseEventCallbacks,
  children,
}: GraphFrameProps) {
  const internalRef = useRef<NVL>(null)
  const ref = nvlRef ?? internalRef

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
          onClick={() => onLayoutChange(layout === "hierarchical" ? "forceDirected" : "hierarchical")}
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
      <div style={{ width: "100%", height: `${height}px` }}>
        <InteractiveNvlWrapper
          ref={ref}
          nodes={nodes}
          rels={rels}
          nvlOptions={nvlOptions}
          mouseEventCallbacks={mouseEventCallbacks}
        />
      </div>
      {children}
    </div>
  )
}
