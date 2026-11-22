// Tests for the monitor REST API: config loading, store discovery, and the two
// routes. Builds a fixture root with two project dirs, each holding a real
// gbuild store (.git/gbuild/<slug>/db — schema plus a small graph) created
// through the relate CLI. Skips when relate is not on PATH. Run from the repo
// root:  node --import tsx --test monitor/test/server.test.ts
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, test } from "node:test"
import { fileURLToPath } from "node:url"
import { loadConfig } from "../src/config.ts"
import { startServer } from "../src/server.ts"
import type { Server } from "node:http"

const hasRelate = spawnSync("relate", ["--version"]).status === 0
const schema = readFileSync(fileURLToPath(new URL("../../plugins/gbuild/cypher/schema.cypher", import.meta.url)), "utf8")

// Writes go through the CLI without --read-only, exactly as plan would.
const run = (db: string, input: string, extra: string[] = []) => {
  const r = spawnSync("relate", ["query", "--database", db, ...extra], { input, encoding: "utf8" })
  assert.equal(r.status, 0, `relate failed: ${r.stderr}${r.stdout}`)
}

const buildStore = (project: string, slug: string, graph: string) => {
  const db = join(project, ".git", "gbuild", slug, "db")
  mkdirSync(db, { recursive: true })
  run(db, schema, ["--snapshot-format", "json"])
  run(db, graph)
}

// alpha: a-impl completed with a recorded output value and a passing review,
// b-use pending behind it (frontier) consuming the value.
const ALPHA = `
.begin
CREATE (f:Feature {feature: 'alpha', destination: 'Alpha feature done.', context: 'Fixture.', out_of_scope: []})
CREATE (a1:Acceptance {id: 'a-1', text: 'alpha works'})
CREATE (f)-[:HAS_ACCEPTANCE]->(a1)
CREATE (a:GbuildNode:Code {slug: 'a-impl', title: 'Implement alpha', type: 'code', acceptance: ['alpha implemented'],
  failure_policy: 'retry', model_tier: 'cheap', status: 'completed',
  started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T00:10:00Z'})
CREATE (a)-[:OUTPUT]->(av:Field {name: 'value', shape: '<integer>', value: 21})
CREATE (a)-[:SATISFIES]->(a1)
CREATE (a)-[:REVIEWED]->(:Review {attempt: 1, verdict: 'pass', failed_criteria: [], checklist: [], at: '2026-01-01T00:11:00Z'})
CREATE (b:GbuildNode:Code {slug: 'b-use', title: 'Use alpha value', type: 'code', acceptance: ['uses the value'],
  failure_policy: 'retry', model_tier: 'cheap', status: 'pending'})
CREATE (b)-[:DEPENDS_ON]->(a)
CREATE (b)-[:INPUT]->(:Field {name: 'value', shape: '<integer>'})-[:FROM]->(av)
CREATE (b)-[:OUTPUT]->(:Field {name: 'result', shape: '<integer>'})
CREATE (b)-[:SATISFIES]->(a1);
.commit
`

// beta: a single in_progress research node.
const BETA = `
.begin
CREATE (f:Feature {feature: 'beta', destination: 'Beta feature done.', context: 'Fixture.', out_of_scope: []})
CREATE (a1:Acceptance {id: 'a-1', text: 'beta works'})
CREATE (f)-[:HAS_ACCEPTANCE]->(a1)
CREATE (n:GbuildNode:Research {slug: 'r-scan', title: 'Scan the repo', type: 'research', acceptance: ['scanned'],
  failure_policy: 'retry', model_tier: 'cheap', status: 'in_progress', started_at: '2026-01-02T00:00:00Z'})
CREATE (n)-[:OUTPUT]->(:Field {name: 'findings', shape: '<string>'})
CREATE (n)-[:SATISFIES]->(a1);
.commit
`

describe("monitor server", { skip: !hasRelate }, () => {
  let root: string
  let configPath: string
  let server: Server
  let base: string

  before(async () => {
    root = mkdtempSync(join(tmpdir(), "gbuild-monitor-"))
    buildStore(join(root, "project-one"), "alpha", ALPHA)
    buildStore(join(root, "project-two"), "beta", BETA)
    mkdirSync(join(root, "not-a-project")) // no .git/gbuild — discovery must skip it
    configPath = join(root, "monitor.json")
    writeFileSync(configPath, JSON.stringify({ roots: [root] }))
    server = await startServer(configPath, { port: 0 })
    const address = server.address()
    base = `http://localhost:${typeof address === "object" && address ? address.port : 0}`
  })

  after(async () => {
    server.close()
    rmSync(root, { recursive: true, force: true })
  })

  const get = async (path: string) => {
    const res = await fetch(`${base}${path}`)
    return { status: res.status, body: (await res.json()) as any }
  }

  test("config: missing or malformed file produces a clear error, not a crash", async () => {
    await assert.rejects(loadConfig(join(root, "missing.json")), /monitor config not readable/)
    const badJson = join(root, "bad.json")
    writeFileSync(badJson, "{ nope")
    await assert.rejects(loadConfig(badJson), /is not valid JSON/)
    const wrongShape = join(root, "wrong.json")
    writeFileSync(wrongShape, JSON.stringify({ root }))
    await assert.rejects(loadConfig(wrongShape), /non-empty "roots" array/)
  })

  test("GET /api/features lists one entry per discovered store with counts", async () => {
    const { status, body } = await get("/api/features")
    assert.equal(status, 200)
    assert.equal(body.length, 2)
    const alpha = body.find((f: any) => f.slug === "alpha")
    assert.equal(alpha.project, join(root, "project-one"))
    assert.equal(alpha.destination, "Alpha feature done.")
    assert.deepEqual(alpha.status_counts, { completed: 1, frontier: 1 })
    const beta = body.find((f: any) => f.slug === "beta")
    assert.equal(beta.project, join(root, "project-two"))
    assert.deepEqual(beta.status_counts, { in_progress: 1 })
  })

  test("GET /api/features/:slug/graph returns nodes with fields and reviews", async () => {
    const { status, body } = await get("/api/features/alpha/graph")
    assert.equal(status, 200)
    assert.equal(body.slug, "alpha")
    assert.equal(body.destination, "Alpha feature done.")
    assert.equal(body.nodes.length, 2)

    const impl = body.nodes.find((n: any) => n.slug === "a-impl")
    assert.equal(impl.title, "Implement alpha")
    assert.equal(impl.type, "code")
    assert.equal(impl.status, "completed")
    assert.equal(impl.wave, 0)
    assert.deepEqual(impl.acceptance, ["alpha implemented"])
    assert.deepEqual(impl.outputs, [{ name: "value", shape: "<integer>", from: null, value: 21 }])
    assert.equal(impl.reviews.length, 1)
    assert.equal(impl.reviews[0].verdict, "pass")

    const use = body.nodes.find((n: any) => n.slug === "b-use")
    assert.equal(use.status, "frontier")
    assert.equal(use.wave, 1)
    assert.deepEqual(use.depends_on, ["a-impl"])
    assert.deepEqual(use.inputs, [{ name: "value", shape: "<integer>", from: "a-impl.output.value", value: 21 }])
    assert.deepEqual(use.outputs, [{ name: "result", shape: "<integer>", from: null, value: null }])
    assert.deepEqual(use.reviews, [])
  })

  test("GET /api/features/:slug/graph 404s for an unknown feature", async () => {
    const { status, body } = await get("/api/features/nope/graph")
    assert.equal(status, 404)
    assert.match(body.error, /nope/)
  })
})
