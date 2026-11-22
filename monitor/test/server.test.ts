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

// alpha: a-impl completed with a recorded output value, a passing review, a
// note and a symbol; b-use pending behind it (frontier) consuming the value;
// c-fix failed with a failed review; d-blocked pending behind c-fix.
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
CREATE (a)-[:REVIEWED]->(:Review {attempt: 1, verdict: 'pass', failed_criteria: [],
  checklist: ['alpha implemented: pass'], at: '2026-01-01T00:11:00Z'})
CREATE (:Note {topic: 'testing', text: 'run alpha tests with --grep alpha', by_node: 'a-impl', at: '2026-01-01T00:10:00Z'})
CREATE (:Symbol {name: 'alphaValue', file: 'src/alpha.ts', purpose: 'the alpha constant', by_node: 'a-impl', at: '2026-01-01T00:10:00Z'})
CREATE (b:GbuildNode:Code {slug: 'b-use', title: 'Use alpha value', type: 'code', acceptance: ['uses the value'],
  failure_policy: 'retry', model_tier: 'cheap', status: 'pending'})
CREATE (b)-[:DEPENDS_ON]->(a)
CREATE (b)-[:INPUT]->(:Field {name: 'value', shape: '<integer>'})-[:FROM]->(av)
CREATE (b)-[:OUTPUT]->(:Field {name: 'result', shape: '<integer>'})
CREATE (b)-[:SATISFIES]->(a1)
CREATE (c:GbuildNode:Code {slug: 'c-fix', title: 'Fix alpha edge case', type: 'code', acceptance: ['edge case fixed'],
  failure_policy: 'retry', model_tier: 'cheap', status: 'failed',
  started_at: '2026-01-01T01:00:00Z', completed_at: '2026-01-01T01:05:00Z'})
CREATE (c)-[:REVIEWED]->(:Review {attempt: 1, verdict: 'fail', failed_criteria: ['edge case still broken'],
  checklist: ['edge case fixed: fail — still broken'], at: '2026-01-01T01:06:00Z'})
CREATE (d:GbuildNode:Code {slug: 'd-blocked', title: 'Polish alpha', type: 'code', acceptance: ['polished'],
  failure_policy: 'retry', model_tier: 'cheap', status: 'pending'})
CREATE (d)-[:DEPENDS_ON]->(c);
.commit
`

// beta: an in_progress research node with a note and a symbol, plus a failed
// code node whose latest review carries failed criteria.
const BETA = `
.begin
CREATE (f:Feature {feature: 'beta', destination: 'Beta feature done.', context: 'Fixture.', out_of_scope: []})
CREATE (a1:Acceptance {id: 'a-1', text: 'beta works'})
CREATE (f)-[:HAS_ACCEPTANCE]->(a1)
CREATE (n:GbuildNode:Research {slug: 'r-scan', title: 'Scan the repo', type: 'research', acceptance: ['scanned'],
  failure_policy: 'retry', model_tier: 'cheap', status: 'in_progress', started_at: '2026-01-02T00:00:00Z'})
CREATE (n)-[:OUTPUT]->(:Field {name: 'findings', shape: '<string>'})
CREATE (n)-[:SATISFIES]->(a1)
CREATE (:Note {topic: 'gotcha', text: 'beta store needs relate >= 1.2', by_node: 'r-scan', at: '2026-01-02T00:05:00Z'})
CREATE (:Symbol {name: 'scanRepo', file: 'src/scan.ts', purpose: 'scans the repo for beta', by_node: 'r-scan', at: '2026-01-02T00:05:00Z'})
CREATE (t:GbuildNode:Code {slug: 't-impl', title: 'Implement beta', type: 'code', acceptance: ['beta implemented'],
  failure_policy: 'retry', model_tier: 'capable', status: 'failed',
  started_at: '2026-01-02T01:00:00Z', completed_at: '2026-01-02T01:20:00Z'})
CREATE (t)-[:REVIEWED]->(:Review {attempt: 1, verdict: 'fail', failed_criteria: ['beta not implemented'],
  checklist: ['beta implemented: fail'], at: '2026-01-02T01:21:00Z'})
CREATE (t)-[:REVIEWED]->(:Review {attempt: 2, verdict: 'fail', failed_criteria: ['beta not implemented', 'beta tests missing'],
  checklist: ['beta implemented: fail', 'tests: fail'], at: '2026-01-02T01:30:00Z'});
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
    assert.deepEqual(alpha.status_counts, { completed: 1, frontier: 1, failed: 1, blocked: 1 })
    const beta = body.find((f: any) => f.slug === "beta")
    assert.equal(beta.project, join(root, "project-two"))
    assert.deepEqual(beta.status_counts, { in_progress: 1, failed: 1 })
  })

  test("GET /api/features/:slug/graph returns nodes with fields and reviews", async () => {
    const { status, body } = await get("/api/features/alpha/graph")
    assert.equal(status, 200)
    assert.equal(body.slug, "alpha")
    assert.equal(body.destination, "Alpha feature done.")
    assert.equal(body.nodes.length, 4)
    assert.deepEqual(body.acceptance, [
      { id: "a-1", text: "alpha works", covered_by: ["a-impl", "b-use"] },
    ])

    const impl = body.nodes.find((n: any) => n.slug === "a-impl")
    assert.equal(impl.title, "Implement alpha")
    assert.equal(impl.type, "code")
    assert.equal(impl.status, "completed")
    assert.equal(impl.wave, 0)
    assert.equal(impl.model_tier, "cheap")
    assert.equal(impl.failure_policy, "retry")
    assert.equal(impl.started_at, "2026-01-01T00:00:00Z")
    assert.equal(impl.completed_at, "2026-01-01T00:10:00Z")
    assert.deepEqual(impl.acceptance, ["alpha implemented"])
    assert.deepEqual(impl.outputs, [{ name: "value", shape: "<integer>", from: null, value: 21 }])
    assert.equal(impl.reviews.length, 1)
    assert.equal(impl.reviews[0].verdict, "pass")
    assert.deepEqual(impl.reviews[0].checklist, ["alpha implemented: pass"])

    const use = body.nodes.find((n: any) => n.slug === "b-use")
    assert.equal(use.status, "frontier")
    assert.equal(use.wave, 1)
    assert.equal(use.started_at, null)
    assert.equal(use.completed_at, null)
    assert.deepEqual(use.depends_on, ["a-impl"])
    assert.deepEqual(use.inputs, [{ name: "value", shape: "<integer>", from: "a-impl.output.value", value: 21 }])
    assert.deepEqual(use.outputs, [{ name: "result", shape: "<integer>", from: null, value: null }])
    assert.deepEqual(use.reviews, [])

    const fix = body.nodes.find((n: any) => n.slug === "c-fix")
    assert.equal(fix.status, "failed")
    assert.equal(fix.reviews.length, 1)
    assert.deepEqual(fix.reviews[0].failed_criteria, ["edge case still broken"])
    assert.deepEqual(fix.reviews[0].checklist, ["edge case fixed: fail — still broken"])

    const blocked = body.nodes.find((n: any) => n.slug === "d-blocked")
    assert.equal(blocked.status, "blocked")
    assert.deepEqual(blocked.depends_on, ["c-fix"])
  })

  test("GET /api/features/:slug/graph 404s for an unknown feature", async () => {
    const { status, body } = await get("/api/features/nope/graph")
    assert.equal(status, 404)
    assert.match(body.error, /nope/)
  })

  test("GET /api/attention lists failed and blocked nodes across all stores", async () => {
    const { status, body } = await get("/api/attention")
    assert.equal(status, 200)
    assert.equal(body.length, 3)

    const fix = body.find((i: any) => i.node === "c-fix")
    assert.equal(fix.project, join(root, "project-one"))
    assert.equal(fix.feature, "alpha")
    assert.equal(fix.state, "failed")
    assert.deepEqual(fix.waiting_on, [])
    assert.deepEqual(fix.last_failed_criteria, ["edge case still broken"])

    const blocked = body.find((i: any) => i.node === "d-blocked")
    assert.equal(blocked.project, join(root, "project-one"))
    assert.equal(blocked.feature, "alpha")
    assert.equal(blocked.state, "blocked")
    assert.deepEqual(blocked.waiting_on, ["c-fix"])
    assert.deepEqual(blocked.last_failed_criteria, [])

    // beta's failed node: the last failed criteria come from the latest review.
    const t = body.find((i: any) => i.node === "t-impl")
    assert.equal(t.project, join(root, "project-two"))
    assert.equal(t.feature, "beta")
    assert.equal(t.state, "failed")
    assert.deepEqual(t.last_failed_criteria, ["beta not implemented", "beta tests missing"])

    // frontier and in_progress nodes never need attention
    assert.equal(body.find((i: any) => i.node === "b-use"), undefined)
    assert.equal(body.find((i: any) => i.node === "r-scan"), undefined)
  })

  test("GET /api/knowledge lists notes and symbols across all stores", async () => {
    const { status, body } = await get("/api/knowledge")
    assert.equal(status, 200)

    assert.equal(body.notes.length, 2)
    const alphaNote = body.notes.find((n: any) => n.text === "run alpha tests with --grep alpha")
    assert.equal(alphaNote.topic, "testing")
    assert.equal(alphaNote.by_node, "a-impl")
    assert.equal(alphaNote.project, join(root, "project-one"))
    assert.equal(alphaNote.feature, "alpha")
    const betaNote = body.notes.find((n: any) => n.text === "beta store needs relate >= 1.2")
    assert.equal(betaNote.topic, "gotcha")
    assert.equal(betaNote.by_node, "r-scan")
    assert.equal(betaNote.project, join(root, "project-two"))
    assert.equal(betaNote.feature, "beta")

    assert.equal(body.symbols.length, 2)
    const alphaSymbol = body.symbols.find((s: any) => s.name === "alphaValue")
    assert.deepEqual(
      [alphaSymbol.file, alphaSymbol.purpose, alphaSymbol.by_node, alphaSymbol.project, alphaSymbol.feature],
      ["src/alpha.ts", "the alpha constant", "a-impl", join(root, "project-one"), "alpha"],
    )
    const betaSymbol = body.symbols.find((s: any) => s.name === "scanRepo")
    assert.equal(betaSymbol.file, "src/scan.ts")
    assert.equal(betaSymbol.project, join(root, "project-two"))
    assert.equal(betaSymbol.feature, "beta")
  })
})
