import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { access, mkdtemp, readFile, rmdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"

const targets = {
  gbuild: {
    skills: ["cleanup", "design", "plan", "pr", "review", "run", "status"],
    files: ["reference/codex.md", "cypher/validate.cypher"],
  },
  "stellar-review": {
    skills: ["review"],
    files: [
      "codex/review/agents/openai.yaml",
      "skills/stellar-review/SKILL.md",
      "scripts/stellar-prep.sh",
      "skills/stellar-review/tools/ledger.py",
      ...["structure", "branching", "boundaries", "comparison"].map((pass) => `agents/stellar-${pass}.md`),
    ],
  },
}
const [name, ...flags] = process.argv.slice(2)
const catalogOnly = flags.includes("--catalog-only")
assert.ok(Object.hasOwn(targets, name) && flags.length === Number(catalogOnly),
  "usage: node scripts/smoke-codex.mjs <gbuild|stellar-review> [--catalog-only]")

const repo = fileURLToPath(new URL("../", import.meta.url))
const marketplacePath = resolve(repo, ".agents/plugins/marketplace.json")
const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"))
const plugin = marketplace.plugins.find((entry) => entry.name === name)
assert.ok(plugin, `${name} is missing from the marketplace`)
assert.equal(plugin.source.path, `./plugins/${name}`)
const pluginId = `${name}@${marketplace.name}`
const target = targets[name]
const expected = target.skills.map((skill) => `${name}:${skill}`)

async function checkSkills(skills) {
  assert.deepEqual(skills.map((skill) => skill.name).sort(), expected)
  for (const skill of skills) {
    assert.equal(skill.enabled, true, skill.name)
    const root = resolve(skill.path, "../../..")
    for (const file of target.files) await access(resolve(root, file))
  }
}

const cwd = await mkdtemp(resolve(tmpdir(), "oskars-codex-smoke-"))
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
  await request("initialize", { clientInfo: { name: "oskars-ai-smoke", version: "1.0.0" } })
  send({ method: "initialized" })
  const catalog = await request("plugin/read", { marketplacePath, pluginName: name })
  await checkSkills(catalog.plugin.skills)

  if (!catalogOnly) {
    // Look from a fresh directory so a repo-local source cannot satisfy this check.
    const { data } = await request("skills/list", { cwds: [cwd], forceReload: true })
    const skills = data.flatMap((entry) => entry.skills).filter((skill) => skill.pluginId === pluginId)
    await checkSkills(skills)
  }
  console.log(`Codex discovered ${expected.length} ${catalogOnly ? "catalog" : "installed"} skills for ${name}`)
} finally {
  clearTimeout(timeout)
  server.stdin.end()
  lines.close()
  server.kill()
  await rmdir(cwd)
}
