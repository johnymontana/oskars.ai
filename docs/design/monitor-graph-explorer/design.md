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

## Open questions

- Placement and shape of the cross-feature knowledge graph (route vs. tab; what links symbols and
  notes across stores).
- Cypher console placement (feature tab vs. top-level route) and result rendering (table vs.
  table + graph when rows contain nodes).
- Layout behavior when extra layers are on: hierarchical-by-wave suits the `DEPENDS_ON` DAG;
  what happens when Fields/Reviews/Notes join the canvas.
- API shape: extend `GET /api/features/:slug/graph` vs. new endpoints for the full store graph,
  the ad-hoc query, and the knowledge graph.
