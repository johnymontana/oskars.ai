// Hash routing between the views: `#/` is the feature list,
// `#/features/<storeId>[/<tab>][?node=<slug>]` the feature detail,
// `#/attention` the cross-store attention dashboard,
// `#/knowledge` the notes/symbols browser. No router dependency. The header
// carries route navigation to the top-level routes.
import { useEffect, useState } from "react"
import { AttentionView } from "./AttentionView.tsx"
import { FeatureList } from "./FeatureList.tsx"
import { GraphDetail } from "./GraphDetail.tsx"
import { KnowledgeView } from "./KnowledgeView.tsx"
import { featureHref, inSampleWorkspace, type FeatureTab } from "./routes.ts"

type Route =
  | { view: "list" }
  | { view: "graph"; slug: string; tab: FeatureTab; node?: string }
  | { view: "attention" }
  | { view: "knowledge" }

const parseRoute = (hash: string): Route => {
  const [path = "", query] = hash.split("?", 2)
  const match = path.match(/^#\/features\/([^/]+?)(?:\/(overview|graph|timeline|acceptance|repairs|query))?$/)
  if (match) {
    try {
      return {
        view: "graph",
        slug: decodeURIComponent(match[1] as string),
        tab: (match[2] ?? "graph") as FeatureTab,
        node: new URLSearchParams(query).get("node") ?? undefined,
      }
    } catch {
      return { view: "list" }
    }
  }
  if (path === "#/attention") return { view: "attention" }
  if (path === "#/knowledge") return { view: "knowledge" }
  return { view: "list" }
}

export function App({ pollInterval }: { pollInterval?: number }) {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])
  const updateNode = (node?: string) => {
    if (route.view !== "graph" || route.node === node) return
    window.history.replaceState(window.history.state, "", featureHref(route.slug, route.tab, node))
    setRoute({ ...route, node })
  }

  return (
    <>
      <header className="app-header">
        <a className="app-title" href="#/">
          gbuild monitor
        </a>
        <nav className="app-nav">
          <a href="#/">Features</a>
          <a href="#/attention">Attention</a>
          <a href="#/knowledge">Knowledge</a>
        </nav>
      </header>
      {inSampleWorkspace() && (
        <aside className="sample-banner" aria-label="Sample workspace">
          <strong>Sample workspace</strong>
          <span>Explore an example run.</span>
          <a href="/">Return to your projects</a>
        </aside>
      )}
      <main className="app-main">
        {route.view === "graph" ? (
          <GraphDetail
            key={route.slug}
            slug={route.slug}
            tab={route.tab}
            node={route.node}
            onNodeChange={updateNode}
            pollInterval={pollInterval}
          />
        ) : route.view === "attention" ? (
          <AttentionView pollInterval={pollInterval} />
        ) : route.view === "knowledge" ? (
          <KnowledgeView pollInterval={pollInterval} />
        ) : (
          <FeatureList pollInterval={pollInterval} />
        )}
      </main>
    </>
  )
}
