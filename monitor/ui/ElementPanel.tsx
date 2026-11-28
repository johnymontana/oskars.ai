// Element side panel for non-GbuildNode store elements, nodes (Field,
// Acceptance, Review, Note, Symbol, Feature) and relationships alike. A node
// panel shows the element id, its labels and every property, plus its
// incoming and outgoing relationships with the element at the other end; a
// relationship panel shows its type, its endpoints and its properties.
// Opened by clicking an element in the store graph explorer; GbuildNode
// clicks keep using NodePanel.
import { Fragment, useMemo } from "react"
import type { Ref } from "react"
import type { StoreGraph, StoreGraphNode, StoreGraphRel } from "./api.ts"
import { formatValue } from "./format.ts"
import { graphElementNames } from "./graphElementNames.ts"

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
function RelList({
  title,
  rels,
  otherEnd,
  names,
  onInspectRelationship,
}: {
  title: string
  rels: StoreGraphRel[]
  otherEnd: "from" | "to"
  names: ReadonlyMap<string, string>
  onInspectRelationship: (id: string) => void
}) {
  if (rels.length === 0) return null
  return (
    <div>
      <h4>{title}</h4>
      <ul>
        {rels.map((rel) => {
          const label = `${rel.type} ${names.get(rel[otherEnd]) ?? rel[otherEnd]}`
          return (
            <li key={rel.id}>
              <button type="button" className="element-relationship" onClick={() => onInspectRelationship(rel.id)}>
                {label}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ElementPanel({
  element,
  graph,
  onClose,
  headingRef,
  onInspectRelationship,
}: {
  element: StoreGraphNode | StoreGraphRel
  graph: StoreGraph
  onClose: () => void
  headingRef?: Ref<HTMLHeadingElement>
  onInspectRelationship: (id: string) => void
}) {
  const names = useMemo(() => graphElementNames(graph), [graph])
  const name = isNode(element) ? names.get(element.id) ?? element.id : element.type
  return (
    <aside className="node-panel element-panel" aria-label={`element ${element.id}`}>
      <button type="button" className="node-panel-close" aria-label="close panel" onClick={onClose}>
        ×
      </button>
      <h2 tabIndex={-1} ref={headingRef}>{name}</h2>
      {name !== element.id && <p className="mono text-dim">{element.id}</p>}
      {isNode(element) ? (
        <>
          <p>{element.labels.join(", ")}</p>
          <PropertyList properties={element.properties} />
          <RelList
            title="incoming"
            rels={graph.rels.filter((r) => r.to === element.id)}
            otherEnd="from"
            names={names}
            onInspectRelationship={onInspectRelationship}
          />
          <RelList
            title="outgoing"
            rels={graph.rels.filter((r) => r.from === element.id)}
            otherEnd="to"
            names={names}
            onInspectRelationship={onInspectRelationship}
          />
        </>
      ) : (
        <>
          <dl>
            <dt>from</dt>
            <dd className="mono">{names.get(element.from) ?? element.from}</dd>
            <dt>to</dt>
            <dd className="mono">{names.get(element.to) ?? element.to}</dd>
          </dl>
          <PropertyList properties={element.properties} />
        </>
      )}
    </aside>
  )
}
