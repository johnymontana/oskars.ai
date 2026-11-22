// Element side panel for non-GbuildNode store elements, nodes (Field,
// Acceptance, Review, Note, Symbol, Feature) and relationships alike. A node
// panel shows the element id, its labels and every property, plus its
// incoming and outgoing relationships with the element at the other end; a
// relationship panel shows its type, its endpoints and its properties.
// Opened by clicking an element in the store graph explorer; GbuildNode
// clicks keep using NodePanel.
import { Fragment } from "react"
import type { StoreGraph, StoreGraphNode, StoreGraphRel } from "./api.ts"
import { formatValue } from "./format.ts"

const isNode = (element: StoreGraphNode | StoreGraphRel): element is StoreGraphNode => "labels" in element

function PropertyList({ properties }: { properties: Record<string, unknown> }) {
  return (
    <dl>
      {Object.entries(properties).map(([key, value]) => (
        <Fragment key={key}>
          <dt>{key}</dt>
          <dd className="mono">{formatValue(value)}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

// The rels of one node in one direction, each with the element at the other
// end.
function RelList({ title, rels, otherEnd }: { title: string; rels: StoreGraphRel[]; otherEnd: "from" | "to" }) {
  if (rels.length === 0) return null
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {rels.map((rel) => (
          <li key={rel.id}>
            {rel.type} <span className="mono">{rel[otherEnd]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ElementPanel({
  element,
  graph,
  onClose,
}: {
  element: StoreGraphNode | StoreGraphRel
  graph: StoreGraph
  onClose: () => void
}) {
  return (
    <aside className="node-panel element-panel" aria-label={`element ${element.id}`}>
      <button type="button" className="node-panel-close" aria-label="close panel" onClick={onClose}>
        ×
      </button>
      <h2>
        <span className="mono">{element.id}</span>
      </h2>
      {isNode(element) ? (
        <>
          <p>{element.labels.join(", ")}</p>
          <PropertyList properties={element.properties} />
          <RelList title="incoming" rels={graph.rels.filter((r) => r.to === element.id)} otherEnd="from" />
          <RelList title="outgoing" rels={graph.rels.filter((r) => r.from === element.id)} otherEnd="to" />
        </>
      ) : (
        <>
          <p>{element.type}</p>
          <dl>
            <dt>from</dt>
            <dd className="mono">{element.from}</dd>
            <dt>to</dt>
            <dd className="mono">{element.to}</dd>
          </dl>
          <PropertyList properties={element.properties} />
        </>
      )}
    </aside>
  )
}
