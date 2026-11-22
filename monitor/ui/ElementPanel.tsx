// Element side panel for non-GbuildNode store elements (Field, Acceptance,
// Review, Note, Symbol, Feature): the element id, its labels and every
// property. Opened by clicking a node in the store graph explorer; GbuildNode
// clicks keep using NodePanel.
import { Fragment } from "react"
import type { StoreGraphNode } from "./api.ts"

const formatProperty = (value: unknown) => (value === null || value === undefined ? "—" : JSON.stringify(value))

export function ElementPanel({ node, onClose }: { node: StoreGraphNode; onClose: () => void }) {
  return (
    <aside className="node-panel element-panel" aria-label={`element ${node.id}`}>
      <button type="button" className="node-panel-close" aria-label="close panel" onClick={onClose}>
        ×
      </button>
      <h2>
        <span className="mono">{node.id}</span>
      </h2>
      <p>{node.labels.join(", ")}</p>
      <dl>
        {Object.entries(node.properties).map(([key, value]) => (
          <Fragment key={key}>
            <dt>{key}</dt>
            <dd className="mono">{formatProperty(value)}</dd>
          </Fragment>
        ))}
      </dl>
    </aside>
  )
}
