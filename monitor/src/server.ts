// The monitor REST API over node:http. Routes:
//   GET /api/features                one summary per discovered store
//   GET /api/features/:slug/graph    full node list of one store
// Any other GET serves the built UI from dist/ (npm run build) when present.
import { createServer, type Server, type ServerResponse } from "node:http"
import { readFile } from "node:fs/promises"
import { extname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { loadConfig, type MonitorConfig } from "./config.ts"
import { discoverStores } from "./discover.ts"
import { listFeatures } from "./features.ts"
import { graphDetail } from "./graph.ts"

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify(body))
}

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
      if (req.method === "GET" && !url.pathname.startsWith("/api/") && (await serveStatic(res, url.pathname))) return
      return send(res, 404, { error: `not found: ${req.method} ${url.pathname}` })
    } catch (cause) {
      return send(res, 500, { error: (cause as Error).message })
    }
  })
  await new Promise<void>((resolvePromise) => server.listen(options.port ?? 0, resolvePromise))
  return server
}
