// The monitor REST API over node:http. Routes:
//   GET  /api/features                     one summary per discovered store
//   GET  /api/features/:slug/graph         full node list of one store
//   GET  /api/features/:slug/store-graph   every element of one store as raw nodes/rels
//   POST /api/features/:slug/query         read-only Cypher against one store (rows capped at 500)
//   GET  /api/attention                    failed and blocked nodes across all stores
//   GET  /api/knowledge                    notes and symbols across all stores
//   GET  /api/knowledge/graph              notes/symbols as a cross-store graph
// Any other GET serves the built UI from dist/ (npm run build) when present.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { loadConfig, type MonitorConfig } from "./config.ts"
import { discoverStores } from "./discover.ts"
import { listFeatures } from "./features.ts"
import { graphDetail } from "./graph.ts"
import { storeGraph } from "./storegraph.ts"
import { listAttention } from "./attention.ts"
import { knowledgeGraph, listKnowledge } from "./knowledge.ts"
import { queryStore } from "./query.ts"

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

const MAX_QUERY_ROWS = 500 // ad-hoc query results are truncated to this many rows

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolvePromise, reject) => {
    let body = ""
    req.on("data", (chunk: Buffer) => (body += chunk.toString("utf8")))
    req.on("end", () => resolvePromise(body))
    req.on("error", reject)
  })

const DIST = fileURLToPath(new URL("../dist/", import.meta.url))
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
}

// The UI uses hash routing, so only "/" and the bundle's static assets are
// ever requested; a missing dist/ just falls through to the JSON 404.
const serveStatic = async (res: ServerResponse, pathname: string): Promise<boolean> => {
  const file = resolve(DIST, pathname === "/" ? "index.html" : pathname.slice(1))
  if (!file.startsWith(DIST)) return false
  try {
    const body = await readFile(file)
    res.writeHead(200, { "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream" })
    res.end(body)
    return true
  } catch {
    return false
  }
}

export async function startServer(configPath: string, options: { port?: number } = {}): Promise<Server> {
  const config: MonitorConfig = await loadConfig(configPath)
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost")
      if (req.method === "GET" && url.pathname === "/api/features") return send(res, 200, await listFeatures(config))
      if (req.method === "GET" && url.pathname === "/api/attention") return send(res, 200, await listAttention(config))
      if (req.method === "GET" && url.pathname === "/api/knowledge") return send(res, 200, await listKnowledge(config))
      if (req.method === "GET" && url.pathname === "/api/knowledge/graph") return send(res, 200, await knowledgeGraph(config))
      const match = url.pathname.match(/^\/api\/features\/([^/]+)\/(graph|store-graph|query)$/)
      if (match) {
        const slug = decodeURIComponent(match[1] as string)
        const action = match[2] as string
        const store = (await discoverStores(config.roots)).find((s) => s.slug === slug)
        if (!store) return send(res, 404, { error: `no gbuild store found for feature "${slug}"` })
        try {
          if (req.method === "GET" && action === "graph") return send(res, 200, await graphDetail(store))
          if (req.method === "GET" && action === "store-graph") return send(res, 200, await storeGraph(store))
          if (req.method === "POST" && action === "query") {
            let cypher: unknown
            try {
              cypher = (JSON.parse(await readBody(req)) as { cypher?: unknown }).cypher
            } catch {
              return send(res, 400, { error: "request body must be JSON" })
            }
            if (typeof cypher !== "string" || cypher.trim() === "")
              return send(res, 400, { error: 'request body must be a JSON object with a non-empty "cypher" string' })
            try {
              return send(res, 200, { rows: (await queryStore(store.db, cypher)).slice(0, MAX_QUERY_ROWS) })
            } catch (cause) {
              // relate fails invalid Cypher and rejects writes engine-side in --read-only mode
              return send(res, 400, { error: (cause as Error).message })
            }
          }
        } catch (cause) {
          return send(res, 502, { error: `failed to read store for "${slug}": ${(cause as Error).message}` })
        }
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/") && (await serveStatic(res, url.pathname))) return
      return send(res, 404, { error: `not found: ${req.method} ${url.pathname}` })
    } catch (cause) {
      return send(res, 500, { error: (cause as Error).message })
    }
  })
  await new Promise<void>((resolvePromise) => server.listen(options.port ?? 0, resolvePromise))
  return server
}
