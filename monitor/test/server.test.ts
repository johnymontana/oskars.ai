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
// code node whose latest review carries failed criteria. Its second note
// shares alpha's "testing" topic and its second symbol shares alphaValue's
// name+file, so the knowledge graph has something to merge and hub.
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
CREATE (:Note {topic: 'testing', text: 'run beta tests with --grep beta', by_node: 'r-scan', at: '2026-01-02T00:06:00Z'})
CREATE (:Symbol {name: 'scanRepo', file: 'src/scan.ts', purpose: 'scans the repo for beta', by_node: 'r-scan', at: '2026-01-02T00:05:00Z'})
CREATE (:Symbol {name: 'alphaValue', file: 'src/alpha.ts', purpose: 'the alpha constant, reused by beta', by_node: 'r-scan', at: '2026-01-02T00:06:00Z'})
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

  const post = async (path: string, body: unknown) => {
    const res = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
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

    assert.equal(body.notes.length, 3)
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

    assert.equal(body.symbols.length, 3)
    const alphaSymbol = body.symbols.find(
      (s: any) => s.name === "alphaValue" && s.project === join(root, "project-one"),
    )
    assert.deepEqual(
      [alphaSymbol.file, alphaSymbol.purpose, alphaSymbol.by_node, alphaSymbol.project, alphaSymbol.feature],
      ["src/alpha.ts", "the alpha constant", "a-impl", join(root, "project-one"), "alpha"],
    )
    const betaSymbol = body.symbols.find((s: any) => s.name === "scanRepo")
    assert.equal(betaSymbol.file, "src/scan.ts")
    assert.equal(betaSymbol.project, join(root, "project-two"))
    assert.equal(betaSymbol.feature, "beta")
  })

  test("GET /api/features/:slug/store-graph returns every store element with deterministic ids", async () => {
    const { status, body } = await get("/api/features/alpha/store-graph")
    assert.equal(status, 200)

    // every element carries the full raw shape
    assert.equal(body.nodes.length, 13)
    assert.equal(body.rels.length, 11)
    const nodeIds = new Set(body.nodes.map((n: any) => n.id))
    assert.equal(nodeIds.size, body.nodes.length)
    for (const node of body.nodes) {
      assert.equal(typeof node.id, "string")
      assert.ok(Array.isArray(node.labels) && node.labels.length > 0, `labels on ${node.id}`)
      assert.equal(typeof node.properties, "object")
    }
    for (const rel of body.rels) {
      assert.equal(typeof rel.id, "string")
      assert.equal(typeof rel.type, "string")
      assert.ok(nodeIds.has(rel.from), `from of ${rel.id}`)
      assert.ok(nodeIds.has(rel.to), `to of ${rel.id}`)
      assert.equal(typeof rel.properties, "object")
    }

    // all 7 labels are drawable
    const allLabels = new Set(body.nodes.flatMap((n: any) => n.labels))
    for (const label of ["Feature", "Acceptance", "GbuildNode", "Field", "Review", "Note", "Symbol"])
      assert.ok(allLabels.has(label), label)

    // deterministic ids per label, built from identifying properties
    const impl = body.nodes.find((n: any) => n.id === "GbuildNode:a-impl")
    assert.ok(impl.labels.includes("GbuildNode") && impl.labels.includes("Code"))
    assert.equal(impl.properties.slug, "a-impl")
    assert.equal(impl.properties.status, "completed")
    for (const id of [
      "Feature:alpha",
      "Acceptance:a-1",
      "Field:a-impl:output:value",
      "Field:b-use:input:value",
      "Review:a-impl:1",
      "Review:c-fix:1",
      "Note:a-impl:testing:run alpha tests with --grep alpha",
      "Symbol:a-impl:alphaValue",
    ])
      assert.ok(nodeIds.has(id), `missing ${id}`)

    const dep = body.rels.find((r: any) => r.type === "DEPENDS_ON")
    assert.equal(dep.from, "GbuildNode:b-use")
    assert.equal(dep.to, "GbuildNode:a-impl")
    const from = body.rels.find((r: any) => r.type === "FROM")
    assert.equal(from.from, "Field:b-use:input:value")
    assert.equal(from.to, "Field:a-impl:output:value")

    const missing = await get("/api/features/nope/store-graph")
    assert.equal(missing.status, 404)
  })

  test("POST /api/features/:slug/query runs read-only Cypher, rejects writes, caps at 500 rows", async () => {
    const match = await post("/api/features/alpha/query", {
      cypher: "MATCH (n:GbuildNode) RETURN n.slug AS slug ORDER BY slug",
    })
    assert.equal(match.status, 200)
    assert.deepEqual(match.body.rows, [{ slug: "a-impl" }, { slug: "b-use" }, { slug: "c-fix" }, { slug: "d-blocked" }])

    const write = await post("/api/features/alpha/query", {
      cypher:
        "CREATE (n:GbuildNode {slug: 'nope', title: 'Nope', type: 'code', acceptance: [], failure_policy: 'retry', model_tier: 'cheap', status: 'pending'})",
    })
    assert.equal(write.status, 400)
    assert.match(write.body.error, /write operations are not allowed|read-only/i)

    const wide = await post("/api/features/alpha/query", { cypher: "UNWIND range(1, 501) AS i RETURN i" })
    assert.equal(wide.status, 200)
    assert.equal(wide.body.rows.length, 500)
    assert.ok(!wide.body.rows.some((r: any) => r.i === 501))

    const noCypher = await post("/api/features/alpha/query", {})
    assert.equal(noCypher.status, 400)
    assert.match(noCypher.body.error, /cypher/)

    const missing = await post("/api/features/nope/query", { cypher: "RETURN 1" })
    assert.equal(missing.status, 404)
  })

  test("GET /api/knowledge/graph merges symbols by name+file and hubs notes by topic", async () => {
    const { status, body } = await get("/api/knowledge/graph")
    assert.equal(status, 200)

    // 2 merged symbols, 3 notes, 2 topic hubs, 2 features
    assert.equal(body.nodes.length, 9)
    assert.equal(body.rels.length, 9)
    const nodeIds = new Set(body.nodes.map((n: any) => n.id))
    for (const rel of body.rels) {
      assert.ok(nodeIds.has(rel.from), `from of ${rel.id}`)
      assert.ok(nodeIds.has(rel.to), `to of ${rel.id}`)
      assert.ok(rel.properties.project && rel.properties.feature && rel.properties.by_node, `provenance on ${rel.id}`)
    }

    // one node for the symbol both stores define, with one DEFINES edge each
    const alphaValues = body.nodes.filter(
      (n: any) => n.labels.includes("Symbol") && n.properties.name === "alphaValue" && n.properties.file === "src/alpha.ts",
    )
    assert.equal(alphaValues.length, 1)
    const defines = body.rels.filter((r: any) => r.type === "DEFINES" && r.to === alphaValues[0].id)
    assert.deepEqual(
      defines
        .map((r: any) => ({ project: r.properties.project, feature: r.properties.feature, by_node: r.properties.by_node }))
        .sort((a: any, b: any) => a.feature.localeCompare(b.feature)),
      [
        { project: join(root, "project-one"), feature: "alpha", by_node: "a-impl" },
        { project: join(root, "project-two"), feature: "beta", by_node: "r-scan" },
      ],
    )
    const scanRepo = body.nodes.find((n: any) => n.labels.includes("Symbol") && n.properties.name === "scanRepo")
    assert.equal(body.rels.filter((r: any) => r.type === "DEFINES" && r.to === scanRepo.id).length, 1)

    // same-topic notes stay individual but share one topic hub
    const topics = body.nodes.filter((n: any) => n.labels.includes("Topic"))
    assert.deepEqual(topics.map((t: any) => t.properties.topic).sort(), ["gotcha", "testing"])
    const testingNotes = body.nodes.filter((n: any) => n.labels.includes("Note") && n.properties.topic === "testing")
    assert.equal(testingNotes.length, 2)
    const abouts = body.rels.filter((r: any) => r.type === "ABOUT" && r.to === "Topic:testing")
    assert.deepEqual(
      abouts.map((r: any) => r.from).sort(),
      testingNotes.map((n: any) => n.id).sort(),
    )
    assert.deepEqual(
      abouts
        .map((r: any) => ({ project: r.properties.project, feature: r.properties.feature, by_node: r.properties.by_node }))
        .sort((a: any, b: any) => a.feature.localeCompare(b.feature)),
      [
        { project: join(root, "project-one"), feature: "alpha", by_node: "a-impl" },
        { project: join(root, "project-two"), feature: "beta", by_node: "r-scan" },
      ],
    )

    // every note is written by its feature
    const features = body.nodes.filter((n: any) => n.labels.includes("Feature"))
    assert.equal(features.length, 2)
    const wrote = body.rels.filter((r: any) => r.type === "WROTE")
    assert.equal(wrote.length, 3)
    for (const r of wrote) assert.ok(r.from.startsWith("Feature:"))
  })
})
