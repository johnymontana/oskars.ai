//   node --import tsx monitor/index.ts <config.json> [port] [--host <address>]
import { parseArgs } from "node:util"
import { startServer } from "./src/server.ts"

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { host: { type: "string" } },
  })
  const [configPath, port] = positionals
  if (!configPath || positionals.length > 2) {
    console.error("usage: node --import tsx monitor/index.ts <config.json> [port] [--host <address>]")
    process.exit(2)
  }
  const server = await startServer(configPath, { host: values.host, port: port === undefined ? undefined : Number(port) })
  const address = server.address()
  if (address && typeof address === "object") {
    const host = address.address.includes(":") ? `[${address.address}]` : address.address
    console.log(`gbuild monitor listening on http://${host}:${address.port}`)
  }
} catch (cause) {
  console.error((cause as Error).message)
  process.exit(1)
}
