// The monitor REST API over node:http. Routes:
//   GET /api/features                one summary per discovered store
//   GET /api/features/:slug/graph    full node list of one store
import { createServer, type Server, type ServerResponse } from "node:http"
import { loadConfig, type MonitorConfig } from "./config.ts"
import { discoverStores } from "./discover.ts"
import { listFeatures } from "./features.ts"
import { graphDetail } from "./graph.ts"

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

export async function startServer(configPath: string, options: { port?: number } = {}): Promise<Server> {
  const config: MonitorConfig = await loadConfig(configPath)
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost")
      if (req.method === "GET" && url.pathname === "/api/features") return send(res, 200, await listFeatures(config))
      const match = url.pathname.match(/^\/api\/features\/([^/]+)\/graph$/)
      if (req.method === "GET" && match) {
        const slug = decodeURIComponent(match[1] as string)
        const store = (await discoverStores(config.roots)).find((s) => s.slug === slug)
        if (!store) return send(res, 404, { error: `no gbuild store found for feature "${slug}"` })
        try {
          return send(res, 200, await graphDetail(store))
        } catch (cause) {
          return send(res, 502, { error: `failed to read store for "${slug}": ${(cause as Error).message}` })
        }
      }
      return send(res, 404, { error: `not found: ${req.method} ${url.pathname}` })
    } catch (cause) {
      return send(res, 500, { error: (cause as Error).message })
    }
  })
  await new Promise<void>((resolvePromise) => server.listen(options.port ?? 0, resolvePromise))
  return server
}
