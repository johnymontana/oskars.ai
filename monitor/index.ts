// gbuild monitor entry point:
//   node --import tsx monitor/index.ts <config.json> [port]
import { startServer } from "./src/server.ts"

const configPath = process.argv[2]
if (!configPath) {
  console.error("usage: node --import tsx monitor/index.ts <config.json> [port]")
  process.exit(2)
}
try {
  const server = await startServer(configPath, { port: process.argv[3] ? Number(process.argv[3]) : undefined })
  const address = server.address()
  console.log(`gbuild monitor listening on http://localhost:${typeof address === "object" && address ? address.port : "?"}`)
} catch (cause) {
  console.error((cause as Error).message)
  process.exit(1)
}
