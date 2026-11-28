import type { StoreGraph } from "./api.ts"

export function graphElementNames(graph: StoreGraph): Map<string, string> {
  const names = new Map(graph.nodes.map(({ id, properties }) => {
    const name = properties.slug ?? properties.name ?? properties.feature ?? properties.id ?? properties.topic
    return [id, typeof name === "string" ? name : id]
  }))
  for (const { from, to, type } of graph.rels) {
    if (type === "INPUT" || type === "OUTPUT") {
      names.set(to, `${names.get(from) ?? from} ${type.toLowerCase()} ${names.get(to) ?? to}`)
    }
  }
  return names
}
