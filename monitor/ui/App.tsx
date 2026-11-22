// Hash routing between the two views: `#/` is the feature list,
// `#/features/<slug>` the graph detail. No router dependency. The header
// carries route navigation to the top-level routes.
import { useEffect, useState } from "react"
import { FeatureList } from "./FeatureList.tsx"
import { GraphDetail } from "./GraphDetail.tsx"

type Route = { view: "list" } | { view: "graph"; slug: string }

const parseRoute = (hash: string): Route => {
  const match = hash.match(/^#\/features\/([^/]+)$/)
  return match ? { view: "graph", slug: decodeURIComponent(match[1] as string) } : { view: "list" }
}

export function App({ pollInterval }: { pollInterval?: number }) {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])
  return (
    <>
      <header className="app-header">
        <a className="app-title" href="#/">
          gbuild monitor
        </a>
        <nav className="app-nav">
          <a href="#/">features</a>
          <a href="#/attention">attention</a>
          <a href="#/knowledge">knowledge</a>
        </nav>
      </header>
      <main className="app-main">
        {route.view === "graph" ? (
          <GraphDetail slug={route.slug} pollInterval={pollInterval} />
        ) : (
          <FeatureList pollInterval={pollInterval} />
        )}
      </main>
    </>
  )
}
