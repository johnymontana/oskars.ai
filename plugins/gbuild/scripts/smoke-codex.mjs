import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { access, mkdtemp, readFile, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"

const args = process.argv.slice(2)
const catalogOnly = args[0] === "--catalog-only"
assert.ok(args.length === 0 || (args.length === 1 && catalogOnly),
  "usage: node plugins/gbuild/scripts/smoke-codex.mjs [--catalog-only]")

const repo = fileURLToPath(new URL("../../../", import.meta.url))
const marketplacePath = resolve(repo, ".agents/plugins/marketplace.json")
const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"))
const plugin = marketplace.plugins.find((entry) => entry.name === "gbuild")
assert.equal(plugin.source.path, "./plugins/gbuild")
const pluginId = `gbuild@${marketplace.name}`
const expected = ["cleanup", "design", "plan", "pr", "review", "run", "status"]
  .map((name) => `gbuild:${name}`)

const cwd = await mkdtemp(resolve(tmpdir(), "gbuild-codex-smoke-"))
const server = spawn("codex", ["app-server", "--listen", "stdio://"], {
  cwd, stdio: ["pipe", "pipe", "inherit"],
})
const lines = createInterface({ input: server.stdout })
const output = lines[Symbol.asyncIterator]()
const timeout = setTimeout(() => server.kill(), 20_000)
let id = 0

function send(message) {
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n")
}

async function request(method, params) {
  const requestId = ++id
  send({ id: requestId, method, params })
  let line = await output.next()
  while (!line.done) {
    const response = JSON.parse(line.value)
    if (response.id === requestId) {
      assert.equal(response.error, undefined, `${method}: ${JSON.stringify(response.error)}`)
      return response.result
    }
    line = await output.next()
  }
  throw new Error(`Codex app server closed before replying to ${method}`)
}

try {
  await request("initialize", { clientInfo: { name: "gbuild-smoke", version: "1.0.0" } })
  send({ method: "initialized" })
  const catalog = await request("plugin/read", { marketplacePath, pluginName: "gbuild" })
  assert.deepEqual(catalog.plugin.skills.map((skill) => skill.name).sort(), expected)

  if (!catalogOnly) {
    // Look from a fresh directory so a repo-local source cannot satisfy this check.
    const { data } = await request("skills/list", { cwds: [cwd], forceReload: true })
    const skills = data.flatMap((entry) => entry.skills).filter((skill) => skill.pluginId === pluginId)
    assert.deepEqual(skills.map((skill) => skill.name).sort(), expected)
    for (const skill of skills) {
      assert.equal(skill.enabled, true, skill.name)
      const root = resolve(skill.path, "../../..")
      await access(resolve(root, "reference/codex.md"))
      await access(resolve(root, "cypher/validate.cypher"))
    }
  }
  console.log(`Codex discovered all ${expected.length} ${catalogOnly ? "catalog" : "installed"} gbuild skills`)
} finally {
  clearTimeout(timeout)
  server.stdin.end()
  lines.close()
  server.kill()
  await rmdir(cwd)
}
