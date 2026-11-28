export type FeatureTab = "graph" | "timeline" | "acceptance" | "repairs" | "query"

export const featureHref = (storeRef: string, tab: FeatureTab = "graph", node?: string) => {
  const path = "#/features/" + encodeURIComponent(storeRef) + (tab === "graph" ? "" : "/" + tab)
  return node ? path + "?" + new URLSearchParams({ node }).toString() : path
}
