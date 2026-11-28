export type FeatureTab = "overview" | "graph" | "timeline" | "acceptance" | "repairs" | "query"

export const featureHref = (storeRef: string, tab: FeatureTab = "graph", node?: string) => {
  const path = "#/features/" + encodeURIComponent(storeRef) + (tab === "graph" ? "" : "/" + tab)
  return node ? path + "?" + new URLSearchParams({ node }).toString() : path
}

export const inSampleWorkspace = () =>
  window.location.pathname === "/sample" || window.location.pathname.startsWith("/sample/")
