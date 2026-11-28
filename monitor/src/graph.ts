// GET /api/features/:slug/graph: the node list of one store — per node its
// slug, title, type, derived status, wave, acceptance, dependencies, input and
// output fields (with recorded values), review verdicts, model tier, failure
// policy and run timestamps — plus the feature's acceptance criteria with the
// nodes covering each.
import type { Store } from "./discover.ts"
import { queryStore } from "./query.ts"

const FEATURE_QUERY = `MATCH (f:Feature) RETURN f.feature AS slug, f.destination AS destination`

// Status and wave derive exactly as in gbuild's status.cypher: wave is the
// longest DEPENDS_ON chain below the node; pending splits into
// frontier/blocked by whether every dependency is completed or cancelled.
const NODES_QUERY = `MATCH (n:GbuildNode)
OPTIONAL MATCH p = (n)-[:DEPENDS_ON*]->()
WITH n, coalesce(max(length(p)), 0) AS wave
OPTIONAL MATCH (n)-[:DEPENDS_ON]->(d:GbuildNode)
WITH n, wave, [x IN collect(d) | x.slug] AS depends_on,
     [x IN collect(d) WHERE NOT x.status IN ['completed', 'cancelled'] | x.slug] AS waiting_on
WITH n, wave, depends_on, CASE
  WHEN n.status = 'pending' AND size(waiting_on) = 0 THEN 'frontier'
  WHEN n.status = 'pending' THEN 'blocked'
  ELSE n.status
END AS state
RETURN n.slug AS slug, n.title AS title, n.type AS type, state AS status, wave,
       n.acceptance AS acceptance, depends_on,
       n.model_tier AS model_tier, n.failure_policy AS failure_policy,
       n.started_at AS started_at, n.completed_at AS completed_at
ORDER BY wave, slug`

// An input's recorded value is the upstream output's value through its FROM
// edge (null when external); an output's is its own recorded value.
const FIELDS_QUERY = `MATCH (n:GbuildNode)-[e:INPUT|OUTPUT]->(f:Field)
OPTIONAL MATCH (f)-[:FROM]->(o:Field)<-[:OUTPUT]-(u:GbuildNode)
RETURN n.slug AS node, type(e) AS direction, f.name AS name, f.shape AS shape,
       CASE WHEN u IS NULL THEN null ELSE u.slug + '.output.' + o.name END AS from,
       CASE WHEN type(e) = 'INPUT' THEN o.value ELSE f.value END AS value
ORDER BY node, direction, name`

const REVIEWS_QUERY = `MATCH (n:GbuildNode)-[:REVIEWED]->(r:Review)
RETURN n.slug AS node, r.attempt AS attempt, r.verdict AS verdict,
       r.failed_criteria AS failed_criteria, r.checklist AS checklist, r.at AS at
ORDER BY node, attempt`

// Feature-level acceptance criteria, each with the slugs of the nodes whose
// SATISFIES edges cover it.
const ACCEPTANCE_QUERY = `MATCH (f:Feature)-[:HAS_ACCEPTANCE]->(a:Acceptance)
OPTIONAL MATCH (n:GbuildNode)-[:SATISFIES]->(a)
RETURN a.id AS id, a.text AS text,
       [x IN collect(n.slug) WHERE x IS NOT NULL] AS covered_by
ORDER BY id`

export interface FieldValue {
  name: string
  shape: string
  from: string | null
  value: unknown
}

export interface GraphNode {
  slug: string
  title: string
  type: string
  status: string
  wave: number
  acceptance: string[]
  depends_on: string[]
  model_tier: string
  failure_policy: string
  started_at: string | null
  completed_at: string | null
  inputs: FieldValue[]
  outputs: FieldValue[]
  reviews: { attempt: number; verdict: string; failed_criteria: string[]; checklist: string[]; at: string }[]
}

export interface AcceptanceCriterion {
  id: string
  text: string
  covered_by: string[]
}

export interface GraphDetail {
  store_id: string
  project: string
  slug: string
  destination: string
  acceptance: AcceptanceCriterion[]
  nodes: GraphNode[]
}

export async function graphDetail(store: Store): Promise<GraphDetail> {
  const [feature] = await queryStore(store.db, FEATURE_QUERY)
  if (!feature) throw new Error(`store ${store.db} has no Feature node`)
  const nodeRows = await queryStore(store.db, NODES_QUERY)
  const fieldRows = await queryStore(store.db, FIELDS_QUERY)
  const reviewRows = await queryStore(store.db, REVIEWS_QUERY)
  const acceptanceRows = await queryStore(store.db, ACCEPTANCE_QUERY)
  const nodes: GraphNode[] = nodeRows.map((row) => {
    const slug = String(row.slug)
    const fields = fieldRows.filter((f) => f.node === slug)
    const field = (f: (typeof fieldRows)[number]): FieldValue => ({
      name: String(f.name),
      shape: String(f.shape),
      from: f.from == null ? null : String(f.from),
      value: f.value ?? null,
    })
    return {
      slug,
      title: String(row.title),
      type: String(row.type),
      status: String(row.status),
      wave: Number(row.wave),
      acceptance: (row.acceptance as string[]) ?? [],
      depends_on: (row.depends_on as string[]) ?? [],
      model_tier: String(row.model_tier),
      failure_policy: String(row.failure_policy),
      started_at: row.started_at == null ? null : String(row.started_at),
      completed_at: row.completed_at == null ? null : String(row.completed_at),
      inputs: fields.filter((f) => f.direction === "INPUT").map(field),
      outputs: fields.filter((f) => f.direction === "OUTPUT").map(field),
      reviews: reviewRows
        .filter((r) => r.node === slug)
        .map((r) => ({
          attempt: Number(r.attempt),
          verdict: String(r.verdict),
          failed_criteria: (r.failed_criteria as string[]) ?? [],
          checklist: (r.checklist as string[]) ?? [],
          at: String(r.at),
        })),
    }
  })
  return {
    store_id: store.store_id,
    project: store.project,
    slug: String(feature.slug),
    destination: String(feature.destination),
    acceptance: acceptanceRows.map((row) => ({
      id: String(row.id),
      text: String(row.text),
      covered_by: ((row.covered_by as string[]) ?? []).sort(),
    })),
    nodes,
  }
}
