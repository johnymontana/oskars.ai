// Shared fixtures and the fetch mock for the monitor UI render tests. The
// mock routes every monitor API path to the fixtures below; fetchCalls
// records the requested paths (clear it with `fetchCalls.length = 0`).

export const FEATURES = [
  { project: "/repo/project-one", slug: "alpha", destination: "Alpha feature done.", status_counts: { completed: 1, frontier: 1 } },
  { project: "/repo/project-two", slug: "beta", destination: "Beta feature done.", status_counts: { in_progress: 1 } },
]

export const GRAPH = {
  project: "/repo/project-one",
  slug: "alpha",
  destination: "Alpha feature done.",
  nodes: [
    {
      slug: "a-impl",
      title: "Implement alpha",
      type: "code",
      status: "completed",
      wave: 0,
      acceptance: ["alpha implemented"],
      depends_on: [],
      model_tier: "fast",
      failure_policy: "retry",
      started_at: "2026-01-01T00:10:00Z",
      completed_at: "2026-01-01T00:13:05Z",
      inputs: [],
      outputs: [{ name: "value", shape: "<integer>", from: null, value: 21 }],
      reviews: [
        {
          attempt: 1,
          verdict: "fail",
          failed_criteria: ["alpha implemented"],
          checklist: ["build red", "alpha implemented — FAIL"],
          at: "2026-01-01T00:11:00Z",
        },
        {
          attempt: 2,
          verdict: "pass",
          failed_criteria: [],
          checklist: ["build green"],
          at: "2026-01-01T00:12:00Z",
        },
      ],
    },
    {
      slug: "b-use",
      title: "Use alpha value",
      type: "code",
      status: "frontier",
      wave: 1,
      acceptance: ["uses the value"],
      depends_on: ["a-impl"],
      model_tier: "standard",
      failure_policy: "halt",
      started_at: null,
      completed_at: null,
      inputs: [{ name: "value", shape: "<integer>", from: "a-impl.output.value", value: 21 }],
      outputs: [{ name: "result", shape: "<integer>", from: null, value: null }],
      reviews: [],
    },
  ],
  acceptance: [
    { id: "a1", text: "alpha works end to end", covered_by: ["a-impl", "b-use"] },
    { id: "a2", text: "no regressions", covered_by: [] },
  ],
}

export const ATTENTION = [
  {
    project: "/repo/project-one",
    feature: "alpha",
    node: "b-use",
    state: "failed",
    waiting_on: [],
    last_failed_criteria: ["uses the value"],
  },
  {
    project: "/repo/project-two",
    feature: "beta",
    node: "c-wire",
    state: "blocked",
    waiting_on: ["b-prep"],
    last_failed_criteria: [],
  },
]

export const KNOWLEDGE = {
  notes: [
    { topic: "setup", text: "run npm ci at the worktree root", by_node: "a-impl", project: "/repo/project-one", feature: "alpha" },
    { topic: "testing", text: "node --test runs the suite", by_node: "b-use", project: "/repo/project-one", feature: "alpha" },
    { topic: "setup", text: "relate must be on PATH", by_node: "c-wire", project: "/repo/project-two", feature: "beta" },
    { topic: "testing", text: "layout settles asynchronously in jsdom", by_node: "a-impl", project: "/repo/project-one", feature: "alpha" },
    { topic: "setup", text: "unrelated note from another node", by_node: "other-node", project: "/repo/project-one", feature: "alpha" },
  ],
  symbols: [
    { name: "listAttention", file: "src/attention.ts", purpose: "failed and blocked nodes across stores", by_node: "a-impl", project: "/repo/project-one", feature: "alpha" },
    { name: "toNvlGraph", file: "monitor/ui/NvlGraph.tsx", purpose: "maps graph nodes to NVL nodes/rels", by_node: "a-impl", project: "/repo/project-one", feature: "alpha" },
  ],
}

export const QUERY_SCALAR_ROWS = [
  { slug: "a-impl", status: "completed" },
  { slug: "b-use", status: "frontier" },
]

// Node/rel row values serialize the relate jsonl way.
export const QUERY_GRAPH_ROWS = [
  {
    n: { id: 1, kind: "node", labels: ["Node"], properties: { slug: "a-impl" } },
    r: { id: 9, kind: "relationship", type: "DEPENDS_ON", start_node: 2, end_node: 1, properties: {} },
    m: { id: 2, kind: "node", labels: ["Node"], properties: { slug: "b-use" } },
  },
]

// The knowledge graph for the same stores: the symbol both features define is
// one merged node, and the two setup notes share one topic hub.
export const KNOWLEDGE_GRAPH = {
  nodes: [
    { id: "Feature:/repo/project-one:alpha", labels: ["Feature"], properties: { project: "/repo/project-one", feature: "alpha" } },
    { id: "Feature:/repo/project-two:beta", labels: ["Feature"], properties: { project: "/repo/project-two", feature: "beta" } },
    {
      id: "Note:/repo/project-one:alpha:setup:run npm ci at the worktree root",
      labels: ["Note"],
      properties: { topic: "setup", text: "run npm ci at the worktree root", by_node: "a-impl" },
    },
    {
      id: "Note:/repo/project-two:beta:setup:relate must be on PATH",
      labels: ["Note"],
      properties: { topic: "setup", text: "relate must be on PATH", by_node: "c-wire" },
    },
    {
      id: "Symbol:toNvlGraph:monitor/ui/NvlGraph.tsx",
      labels: ["Symbol"],
      properties: { name: "toNvlGraph", file: "monitor/ui/NvlGraph.tsx", purpose: "maps graph nodes to NVL nodes/rels" },
    },
    { id: "Topic:setup", labels: ["Topic"], properties: { topic: "setup" } },
  ],
  rels: [
    {
      id: "DEFINES:Feature:/repo/project-one:alpha->Symbol:toNvlGraph:monitor/ui/NvlGraph.tsx:a-impl",
      type: "DEFINES",
      from: "Feature:/repo/project-one:alpha",
      to: "Symbol:toNvlGraph:monitor/ui/NvlGraph.tsx",
      properties: { project: "/repo/project-one", feature: "alpha", by_node: "a-impl" },
    },
    {
      id: "DEFINES:Feature:/repo/project-two:beta->Symbol:toNvlGraph:monitor/ui/NvlGraph.tsx:c-wire",
      type: "DEFINES",
      from: "Feature:/repo/project-two:beta",
      to: "Symbol:toNvlGraph:monitor/ui/NvlGraph.tsx",
      properties: { project: "/repo/project-two", feature: "beta", by_node: "c-wire" },
    },
    {
      id: "WROTE:Feature:/repo/project-one:alpha->Note:/repo/project-one:alpha:setup:run npm ci at the worktree root:a-impl",
      type: "WROTE",
      from: "Feature:/repo/project-one:alpha",
      to: "Note:/repo/project-one:alpha:setup:run npm ci at the worktree root",
      properties: { project: "/repo/project-one", feature: "alpha", by_node: "a-impl" },
    },
    {
      id: "WROTE:Feature:/repo/project-two:beta->Note:/repo/project-two:beta:setup:relate must be on PATH:c-wire",
      type: "WROTE",
      from: "Feature:/repo/project-two:beta",
      to: "Note:/repo/project-two:beta:setup:relate must be on PATH",
      properties: { project: "/repo/project-two", feature: "beta", by_node: "c-wire" },
    },
    {
      id: "ABOUT:Note:/repo/project-one:alpha:setup:run npm ci at the worktree root->Topic:setup:a-impl",
      type: "ABOUT",
      from: "Note:/repo/project-one:alpha:setup:run npm ci at the worktree root",
      to: "Topic:setup",
      properties: { project: "/repo/project-one", feature: "alpha", by_node: "a-impl" },
    },
    {
      id: "ABOUT:Note:/repo/project-two:beta:setup:relate must be on PATH->Topic:setup:c-wire",
      type: "ABOUT",
      from: "Note:/repo/project-two:beta:setup:relate must be on PATH",
      to: "Topic:setup",
      properties: { project: "/repo/project-two", feature: "beta", by_node: "c-wire" },
    },
  ],
}

// The raw store elements of feature alpha, matching GRAPH above: every label
// and relationship type the store schema uses.
export const STORE_GRAPH = {
  nodes: [
    { id: "Acceptance:a1", labels: ["Acceptance"], properties: { id: "a1", text: "alpha works end to end" } },
    { id: "Acceptance:a2", labels: ["Acceptance"], properties: { id: "a2", text: "no regressions" } },
    { id: "Feature:alpha", labels: ["Feature"], properties: { feature: "alpha", destination: "Alpha feature done." } },
    { id: "Field:a-impl:output:value", labels: ["Field"], properties: { name: "value", shape: "<integer>", value: 21 } },
    { id: "Field:b-use:input:value", labels: ["Field"], properties: { name: "value", shape: "<integer>" } },
    { id: "Field:b-use:output:result", labels: ["Field"], properties: { name: "result", shape: "<integer>" } },
    {
      id: "GbuildNode:a-impl",
      labels: ["GbuildNode", "Code"],
      properties: { slug: "a-impl", title: "Implement alpha", type: "code", status: "completed" },
    },
    {
      id: "GbuildNode:b-use",
      labels: ["GbuildNode", "Code"],
      properties: { slug: "b-use", title: "Use alpha value", type: "code", status: "pending" },
    },
    {
      id: "Note:a-impl:testing:layout settles asynchronously in jsdom",
      labels: ["Note"],
      properties: { topic: "testing", text: "layout settles asynchronously in jsdom", by_node: "a-impl" },
    },
    {
      id: "Review:a-impl:1",
      labels: ["Review"],
      properties: { attempt: 1, verdict: "fail", failed_criteria: ["alpha implemented"], checklist: ["build red"], at: "2026-01-01T00:11:00Z" },
    },
    {
      id: "Review:a-impl:2",
      labels: ["Review"],
      properties: { attempt: 2, verdict: "pass", failed_criteria: [], checklist: ["build green"], at: "2026-01-01T00:12:00Z" },
    },
    {
      id: "Symbol:a-impl:toNvlGraph",
      labels: ["Symbol"],
      properties: { name: "toNvlGraph", file: "monitor/ui/NvlGraph.tsx", purpose: "maps graph nodes to NVL nodes/rels", by_node: "a-impl" },
    },
  ],
  rels: [
    { id: "DEFINES:GbuildNode:a-impl->Symbol:a-impl:toNvlGraph", type: "DEFINES", from: "GbuildNode:a-impl", to: "Symbol:a-impl:toNvlGraph", properties: {} },
    { id: "DEPENDS_ON:GbuildNode:b-use->GbuildNode:a-impl", type: "DEPENDS_ON", from: "GbuildNode:b-use", to: "GbuildNode:a-impl", properties: { reason: "charted order" } },
    { id: "FROM:Field:b-use:input:value->Field:a-impl:output:value", type: "FROM", from: "Field:b-use:input:value", to: "Field:a-impl:output:value", properties: {} },
    { id: "HAS_ACCEPTANCE:Feature:alpha->Acceptance:a1", type: "HAS_ACCEPTANCE", from: "Feature:alpha", to: "Acceptance:a1", properties: {} },
    { id: "HAS_ACCEPTANCE:Feature:alpha->Acceptance:a2", type: "HAS_ACCEPTANCE", from: "Feature:alpha", to: "Acceptance:a2", properties: {} },
    { id: "INPUT:GbuildNode:b-use->Field:b-use:input:value", type: "INPUT", from: "GbuildNode:b-use", to: "Field:b-use:input:value", properties: {} },
    { id: "OUTPUT:GbuildNode:a-impl->Field:a-impl:output:value", type: "OUTPUT", from: "GbuildNode:a-impl", to: "Field:a-impl:output:value", properties: {} },
    { id: "OUTPUT:GbuildNode:b-use->Field:b-use:output:result", type: "OUTPUT", from: "GbuildNode:b-use", to: "Field:b-use:output:result", properties: {} },
    { id: "REVIEWED:GbuildNode:a-impl->Review:a-impl:1", type: "REVIEWED", from: "GbuildNode:a-impl", to: "Review:a-impl:1", properties: {} },
    { id: "REVIEWED:GbuildNode:a-impl->Review:a-impl:2", type: "REVIEWED", from: "GbuildNode:a-impl", to: "Review:a-impl:2", properties: {} },
    { id: "SATISFIES:GbuildNode:a-impl->Acceptance:a1", type: "SATISFIES", from: "GbuildNode:a-impl", to: "Acceptance:a1", properties: {} },
    { id: "SATISFIES:GbuildNode:b-use->Acceptance:a1", type: "SATISFIES", from: "GbuildNode:b-use", to: "Acceptance:a1", properties: {} },
    { id: "WROTE:GbuildNode:a-impl->Note:a-impl:testing:layout settles asynchronously in jsdom", type: "WROTE", from: "GbuildNode:a-impl", to: "Note:a-impl:testing:layout settles asynchronously in jsdom", properties: {} },
  ],
}

export const STATUS_BY_SLUG = new Map([
  ["a-impl", "completed"],
  ["b-use", "frontier"],
])

// gamma: a three-node skeleton where c-solo sits outside a-impl/b-use's
// dependency neighborhood, for the Graph tab focus test.
export const GAMMA_GRAPH = {
  project: "/repo/project-one",
  slug: "gamma",
  destination: "Gamma feature done.",
  nodes: [
    { slug: "a-impl", title: "Implement gamma", type: "code", status: "completed", wave: 0, acceptance: [], depends_on: [], model_tier: "fast", failure_policy: "retry", started_at: null, completed_at: null, inputs: [], outputs: [], reviews: [] },
    { slug: "b-use", title: "Use gamma value", type: "code", status: "frontier", wave: 1, acceptance: [], depends_on: ["a-impl"], model_tier: "standard", failure_policy: "halt", started_at: null, completed_at: null, inputs: [], outputs: [], reviews: [] },
    { slug: "c-solo", title: "Solo gamma", type: "code", status: "blocked", wave: 0, acceptance: [], depends_on: [], model_tier: "fast", failure_policy: "retry", started_at: null, completed_at: null, inputs: [], outputs: [], reviews: [] },
  ],
  acceptance: [],
}

export const GAMMA_STORE = {
  nodes: [
    { id: "GbuildNode:a-impl", labels: ["GbuildNode", "Code"], properties: { slug: "a-impl", title: "Implement gamma", type: "code", status: "completed" } },
    { id: "GbuildNode:b-use", labels: ["GbuildNode", "Code"], properties: { slug: "b-use", title: "Use gamma value", type: "code", status: "frontier" } },
    { id: "GbuildNode:c-solo", labels: ["GbuildNode", "Code"], properties: { slug: "c-solo", title: "Solo gamma", type: "code", status: "blocked" } },
  ],
  rels: [
    { id: "DEPENDS_ON:GbuildNode:b-use->GbuildNode:a-impl", type: "DEPENDS_ON", from: "GbuildNode:b-use", to: "GbuildNode:a-impl", properties: {} },
  ],
}

export const fetchCalls: string[] = []
globalThis.fetch = (async (input: any, init?: any) => {
  const path = String(input)
  fetchCalls.push(path)
  if (path === "/api/features") return Response.json(FEATURES)
  if (path === "/api/features/alpha/graph") return Response.json(GRAPH)
  if (path === "/api/features/alpha/query") {
    const { cypher } = JSON.parse(String(init?.body ?? "{}")) as { cypher?: string }
    if (String(cypher).includes("BROKEN"))
      return Response.json({ error: "relate exited 1: Variable `nope` not defined" }, { status: 400 })
    if (String(cypher).includes("MATCH")) return Response.json({ rows: QUERY_GRAPH_ROWS })
    return Response.json({ rows: QUERY_SCALAR_ROWS })
  }
  if (path === "/api/features/alpha/store-graph") return Response.json(STORE_GRAPH)
  if (path === "/api/features/gamma/graph") return Response.json(GAMMA_GRAPH)
  if (path === "/api/features/gamma/store-graph") return Response.json(GAMMA_STORE)
  if (path === "/api/attention") return Response.json(ATTENTION)
  if (path === "/api/knowledge") return Response.json(KNOWLEDGE)
  if (path === "/api/knowledge/graph") return Response.json(KNOWLEDGE_GRAPH)
  return new Response("not found", { status: 404 })
}) as typeof fetch
