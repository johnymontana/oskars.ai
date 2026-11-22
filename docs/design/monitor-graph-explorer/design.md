# Design: monitor-graph-explorer

## Destination

The monitor renders the entire gbuild store as an inspectable graph — every node label
(`Feature`, `Acceptance`, `GbuildNode`, `Field`, `Review`, `Note`, `Symbol`), every relationship
type (`DEPENDS_ON`, `INPUT`, `OUTPUT`, `FROM`, `SATISFIES`, `HAS_ACCEPTANCE`, `REVIEWED`, `WROTE`,
`DEFINES`), properties on any element — with the dependency skeleton as the default layer.

## Scope

- Full-store graph rendering in the feature detail: all 7 node labels and 9 relationship types
  drawable, not just `GbuildNode` + `DEPENDS_ON`.
- Layer toggles to manage density: dependency skeleton by default; toggleable layers for
  contract/dataflow (`Field`, `INPUT`/`OUTPUT`/`FROM`), acceptance (`Acceptance`, `HAS_ACCEPTANCE`,
  `SATISFIES`), reviews (`Review`, `REVIEWED`), knowledge (`Note`/`Symbol`, `WROTE`/`DEFINES`).
- Dataflow overlay: with the contract layer on, `FROM` edges are highlighted and show the actual
  recorded values flowing node-to-node.
- Relationship types visible: distinct color per type, on-screen legend, type caption on the
  selected edge.
- Generalized side panel: clicking any graph element — any node label or a relationship — shows
  its label/type, all properties, and its connections.
- Read-only Cypher console in the UI against a store.
- Cross-feature knowledge graph: symbols and notes linked across all discovered stores.

## Out of scope

- Writing to or mutating any store — the monitor stays read-only (the Cypher console too:
  `relate query --read-only`).
- Changing the renderer (NVL canvas stays), the polling model, or adding server-push transports.
- Auth, multi-user, hosted deployment.
- Run replay/animation of a feature's history (declined — not selected in round 1).

## Analysis findings

- The store model is far richer than what is drawn: `Field`/`FROM` carry the dataflow,
  `SATISFIES`/`HAS_ACCEPTANCE` carry coverage, `WROTE`/`DEFINES` carry what the run learned.
  All of it is invisible in the graph view today (skeleton only: `GbuildNode` + `DEPENDS_ON`,
  slug captions, status colors — `monitor/ui/NvlGraph.tsx`).
- The API already extracts most of this (`monitor/src/graph.ts`: fields with `FROM` provenance
  and values, reviews, acceptance coverage) but flattens it into per-node JSON for the text side
  panel — never as graph elements.
- `Note`/`Symbol` are fetched cross-store by `GET /api/knowledge` (`monitor/src/knowledge.ts`),
  rendered as a filterable table at `#/knowledge` — not as a graph.
- NVL already provides what's needed: per-element captions/colors, rel styling, click callbacks
  for nodes and rels, box select, hierarchical + force-directed layouts.
- Read-only querying is a solved pattern: `queryStore` shells out to
  `relate query --read-only --mode jsonl`; the same path serves an ad-hoc console.

## Decisions

1. **Destination confirmed** (round 1) — the whole store as an inspectable graph; the dependency
   skeleton is the default layer, not the whole picture. Alternative ruled out: a separate
   explorer view (splits one mental model into two screens) and enrich-current-only (keeps
   `Field`/`Review`/`Note`/`Symbol` forever invisible as graph structure).
2. **Layer toggles for density** (round 1). Skeleton-only default; four toggleable layers
   (contract/dataflow, acceptance, reviews, knowledge). Alternatives ruled out: zoom-dependent
   detail (imprecise, hard to test) and two fixed modes (all-or-nothing hairball).
3. **Generalized side panel for property inspection** (round 1). Click any element — any node
   label or a relationship — and the side panel shows its label/type, all properties, and its
   connections. Alternatives ruled out: hover-only tooltips (NVL canvas tooltips are limited, bad
   for long values); hover+panel (nice-to-have, not worth two inspection paths).
4. **Rel types shown as color + legend** (round 1). One color per relationship type, an on-screen
   legend, and the type caption on the selected edge. Alternatives ruled out: captions always on
   (noisy once the contract layer is visible) and selection-only (types stay invisible until
   clicked).
5. **Brainstorm extras in scope** (round 1): read-only Cypher console, dataflow overlay (folded
   into the contract layer), and cross-feature knowledge graph. Run replay/animation is out.
6. **Cross-feature knowledge graph lives on `#/knowledge` as a graph mode** (round 2), keeping the
   filterable table below it — one home for "what runs learned". Alternative ruled out: a separate
   route (splits knowledge across two screens).
7. **Cross-store linkage: Symbol by name+file, Notes by shared topic** (round 2). Symbols with the
   same name and file across features are one merged node, edged to each defining feature/node;
   notes stay individual (their texts differ) and connect through a shared topic hub node.
   Alternatives ruled out: file-only (couples unrelated helpers in one file) and name-only
   (false-merges common identifiers like `formatValue`).
8. **Cypher console is a store-scoped feature tab** (round 2) — a `Query` tab on the feature
   detail, running against that feature's store. Alternative ruled out: a top-level route with a
   store picker (stores are separate DBs; cross-store queries are impossible anyway, so the picker
   buys nothing).
9. **Query results render as a table, plus a mini NVL graph when rows contain nodes/rels**
   (round 2). Alternative ruled out: table-only (the graph structure of a result — the whole point
   of the console — stays invisible).
10. **Layout auto-switches to force-directed when any extra layer is on** (round 2); skeleton-only
    keeps hierarchical-by-wave, and the manual layout toggle still works. Alternatives ruled out:
    hierarchical-always with satellites pinned to their owner (cramped wave lanes) and
    manual-only (a bad default exactly when density arrives).

## Mechanism notes (settled, for plan to decompose)

- **The Graph tab becomes the explorer.** The existing feature-detail Graph tab gains the layer
  toggles; its default layers (skeleton only) render exactly today's view. No new route for the
  full-store graph.
- **Full store graph API** — new endpoint `GET /api/features/:slug/store-graph` returning raw
  elements: `nodes: [{ id, labels, properties }]`, `rels: [{ id, type, from, to }]`. `GET
  /api/features/:slug/graph` stays unchanged (the curated view feeding the existing tabs). Element
  ids are deterministic, built from each label's identifying properties (`slug` for `GbuildNode`,
  `id` for `Acceptance`, owner+`name`+direction for `Field`, node+`attempt` for `Review`,
  node+topic+text for `Note`, node+`name` for `Symbol`, `feature` for `Feature`) — stable across
  polls without relying on engine-internal ids.
- **Query console API** — `POST /api/features/:slug/query`, body `{ cypher: string }`, executed
  through the same `relate query --read-only --mode jsonl` path as every other store read
  (writes are rejected engine-side). Results capped server-side (500 rows). The UI detects
  node/rel-shaped values in result rows (`labels`+`properties` maps) and renders them as a mini
  NVL graph beside the table.
- **Knowledge graph API** — new endpoint `GET /api/knowledge/graph`: merged Symbol nodes
  (name+file), individual Note nodes linked to shared topic hubs, Feature nodes, and
  `DEFINES`/`WROTE`/`ABOUT` edges carrying `project`, `feature`, `by_node` provenance. Built
  server-side from the same per-store reads `knowledge.ts` already does.
- **Generalized element panel** — today's `NodePanel` becomes an element panel: for a
  `GbuildNode` it renders exactly what `NodePanel` shows today (properties, acceptance, fields,
  reviews, notes, symbols); for other labels it renders label, all properties, and connected
  elements; for a relationship it renders type, endpoints, and properties.
- **Legend doubles as the layer control** — the on-screen legend lists relationship types with
  their colors; the layer toggles sit with it as one "layers & legend" overlay on the graph frame.
- **Rel-type color palette** joins the theme tokens (`--rel-*` alongside `--status-*`), resolved
  at render time like the status colors.
- **Dataflow overlay detail** — with the contract layer on, `FROM` edges get a distinct
  emphasized color and their caption shows the recorded value (truncated); `Field` node captions
  show `name: value`.
