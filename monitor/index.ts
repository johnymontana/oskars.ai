import { parseArgs } from "node:util"
import { checkRelate, loadConfig, loadProjectConfig } from "./src/config.ts"
import { startServer } from "./src/server.ts"

const usage = `Usage:
  npm start --prefix monitor
  npm start --prefix monitor -- --project <checkout> [port]
  npm start --prefix monitor -- <config.json> [port]

Start without a project to try the sample. All modes accept --host <address>.`

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { host: { type: "string" }, project: { type: "string" }, help: { type: "boolean", short: "h" } },
  })
  if (values.help) {
    console.log(usage)
    process.exit(0)
  }
  if (positionals.length > (values.project === undefined ? 2 : 1) || values.project === "") throw new Error(usage)

  const [source, configPort] = positionals
  const config = values.project !== undefined
    ? await loadProjectConfig(values.project, process.env.INIT_CWD)
    : source ? await loadConfig(source) : { roots: [] }
  const port = values.project !== undefined ? source : configPort
  await checkRelate()
  const server = await startServer(config, { host: values.host, port: port === undefined ? undefined : Number(port) })
  const address = server.address()
  if (address && typeof address === "object") {
    const host = address.address.includes(":") ? `[${address.address}]` : address.address
    console.log(`gbuild monitor listening on http://${host}:${address.port}`)
  }
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => server.close())
  }
} catch (cause) {
  console.error((cause as Error).message)
  process.exit(1)
}
