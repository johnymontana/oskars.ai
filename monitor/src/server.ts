// The monitor REST API over node:http. Routes:
//   GET  /api/overview                     dashboard snapshot and scan diagnostics
//   GET  /api/features                     one summary per discovered store
//   GET  /api/features/:ref/graph         full node list of one store
//   GET  /api/features/:ref/store-graph   every element of one store as raw nodes/rels
//   POST /api/features/:ref/query         read-only Cypher against one store (rows capped at 500)
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
import { queryStore, RelateLimitError } from "./query.ts"
import { listOverview } from "./overview.ts"

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

export const DEFAULT_MONITOR_HOST = "127.0.0.1"

const MAX_QUERY_ROWS = 500
const MAX_QUERY_REQUEST_BYTES = 64 * 1024
const MAX_QUERY_RESULT_BYTES = 2 * 1024 * 1024
const QUERY_TIMEOUT_MS = 5_000

class RequestTooLarge extends Error {}

const readBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = []
    let received = 0
    const read = (chunk: Buffer) => {
      received += chunk.byteLength
      if (received > MAX_QUERY_REQUEST_BYTES) {
        req.off("data", read)
        chunks.length = 0
        reject(new RequestTooLarge(`Query body exceeds ${MAX_QUERY_REQUEST_BYTES} bytes`))
      } else {
        chunks.push(chunk)
      }
    }
    req.on("data", read)
    req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")))
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

export async function startServer(configPath: string, options: { host?: string; port?: number } = {}): Promise<Server> {
  const config: MonitorConfig = await loadConfig(configPath)
  const host = options.host ?? DEFAULT_MONITOR_HOST
  const port = options.port ?? 0
  if (!host.trim()) throw new Error("Host must not be empty")
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("Port must be an integer between 0 and 65535")
  const server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000 }, async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost")
      if (req.method === "GET" && url.pathname === "/api/overview") return send(res, 200, await listOverview(config))
      if (req.method === "GET" && url.pathname === "/api/features") return send(res, 200, await listFeatures(config))
      if (req.method === "GET" && url.pathname === "/api/attention") return send(res, 200, await listAttention(config))
      if (req.method === "GET" && url.pathname === "/api/knowledge") return send(res, 200, await listKnowledge(config))
      if (req.method === "GET" && url.pathname === "/api/knowledge/graph") return send(res, 200, await knowledgeGraph(config))
      const match = url.pathname.match(/^\/api\/features\/([^/]+)\/(graph|store-graph|query)$/)
      if (match) {
        let ref: string
        try {
          ref = decodeURIComponent(match[1] as string)
        } catch {
          return send(res, 400, { error: "Malformed feature reference" })
        }
        const action = match[2] as string
        const stores = await discoverStores(config.roots)
        const byId = stores.find((store) => store.store_id === ref)
        const matches = byId ? [byId] : stores.filter((store) => store.slug === ref)
        if (matches.length > 1) {
          return send(res, 409, {
            error: `Multiple stores use the feature slug "${ref}"`,
            matches: matches.map(({ store_id, project, slug }) => ({ store_id, project, slug })),
          })
        }
        const store = matches[0]
        if (!store) return send(res, 404, { error: `no gbuild store found for feature "${ref}"` })
        try {
          if (req.method === "GET" && action === "graph") return send(res, 200, await graphDetail(store))
          if (req.method === "GET" && action === "store-graph") return send(res, 200, await storeGraph(store))
          if (req.method === "POST" && action === "query") {
            let cypher: unknown
            try {
              cypher = (JSON.parse(await readBody(req)) as { cypher?: unknown } | null)?.cypher
            } catch (cause) {
              if (cause instanceof RequestTooLarge) return send(res, 413, { error: cause.message })
              return send(res, 400, { error: "request body must be JSON" })
            }
            if (typeof cypher !== "string" || cypher.trim() === "")
              return send(res, 400, { error: 'request body must be a JSON object with a non-empty "cypher" string' })
            try {
              const rows = await queryStore(store.db, cypher, {
                maxRows: MAX_QUERY_ROWS + 1,
                maxBytes: MAX_QUERY_RESULT_BYTES,
                timeoutMs: QUERY_TIMEOUT_MS,
              })
              return send(res, 200, {
                rows: rows.slice(0, MAX_QUERY_ROWS),
                truncated: rows.length > MAX_QUERY_ROWS,
                limit: MAX_QUERY_ROWS,
              })
            } catch (cause) {
              if (cause instanceof RelateLimitError) {
                return send(res, cause.kind === "timeout" ? 504 : 422, { error: cause.message })
              }
              // Relate rejects invalid Cypher and writes in --read-only mode.
              return send(res, 400, { error: (cause as Error).message })
            }
          }
        } catch (cause) {
          return send(res, 502, { error: `failed to read store for "${store.slug}": ${(cause as Error).message}` })
        }
      }
      if (req.method === "GET" && !url.pathname.startsWith("/api/") && (await serveStatic(res, url.pathname))) return
      return send(res, 404, { error: `not found: ${req.method} ${url.pathname}` })
    } catch (cause) {
      return send(res, 500, { error: (cause as Error).message })
    }
  })
  await new Promise<void>((resolvePromise, reject) => {
    const onError = (cause: NodeJS.ErrnoException) => {
      const reason = cause.code === "EADDRINUSE" ? "address already in use; choose another port" : cause.message
      reject(new Error(`Could not listen on ${host} port ${port}: ${reason}`, { cause }))
    }
    server.once("error", onError)
    server.listen({ port, host }, () => {
      server.off("error", onError)
      resolvePromise()
    })
  })
  return server
}
