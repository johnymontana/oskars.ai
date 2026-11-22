// NVL rendering of one feature's dependency graph: one NVL node per gbuild
// node, one rel per DEPENDS_ON edge, drawn with the canvas renderer inside a
// container with explicit width and height.
import { InteractiveNvlWrapper } from "@neo4j-nvl/react"
import type { GraphNode } from "./api.ts"

export const toNvlGraph = (nodes: GraphNode[]) => ({
  nodes: nodes.map((n) => ({ id: n.slug, caption: n.slug })),
  rels: nodes.flatMap((n) => n.depends_on.map((dep) => ({ id: `${n.slug}->${dep}`, from: n.slug, to: dep }))),
})

export function NvlGraph({ nodes }: { nodes: GraphNode[] }) {
  const { nodes: nvlNodes, rels } = toNvlGraph(nodes)
  return (
    <div style={{ width: "100%", height: "480px" }}>
      <InteractiveNvlWrapper nodes={nvlNodes} rels={rels} nvlOptions={{ renderer: "canvas" }} />
    </div>
  )
}
