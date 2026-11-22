# gbuild monitor

A local web UI and REST API for watching [gbuild](../plugins/gbuild/) feature
runs: discovered stores, per-node status, waves, field values, and review
verdicts — live, without reloading.

## Setup

```sh
npm install
```

Requires the [`relate` CLI](https://github.com/neo4j-labs/relate) on `PATH` —
the API shells out to it to read each store read-only.

### Config file

The monitor takes one JSON config file listing the root directories to scan.
Any `<root>/<project>/.git/gbuild/<slug>/db` store found below a root becomes
one feature in the UI:

```json
{ "roots": ["~/code", "/abs/path/to/repos"] }
```

`~/` and relative paths resolve to absolute paths. Worktree checkouts (where
`.git` is a file) are skipped by design.

## Scripts

Run from this directory:

- `npm start -- <config.json> [port]` — starts the API server. When
  `dist/` exists (see `build`), the same server also serves the built UI, so
  this is the production entry point. Without a port, a random free port is
  chosen and printed.
- `npm run dev` — Vite dev server with hot reload for UI work. It proxies
  `/api` to a running API server (`MONITOR_API_URL`, default
  `http://localhost:8420`), so start the API first:
  `npm start -- config.json 8420`.
- `npm run build` — bundles the UI into `dist/`.
- `npm test` — runs the API and UI tests (`node --import tsx --test`). The API
  tests skip when `relate` is not on `PATH`.

## Using the UI

- `#/` — feature list: project path, slug, destination, and per-status node
  counts for every discovered store, topped by a needs-attention section
  listing the failed and blocked nodes across all stores (each links to its
  feature).
- `#/features/<slug>` — feature detail with hash-addressable tabs:
  - **Graph** (default) — the whole store as an inspectable graph, rendered
    with [@neo4j-nvl/react](https://neo4j.com/docs/nvl/current/) (canvas
    renderer): the dependency skeleton (`GbuildNode` + `DEPENDS_ON`, status
    colors, hierarchical by wave) is always on, and four layer toggles —
    **contract** (`Field` nodes, `INPUT`/`OUTPUT`/`FROM`), **acceptance**
    (`Acceptance`, `HAS_ACCEPTANCE`/`SATISFIES`), **reviews** (`Review`,
    `REVIEWED`) and **knowledge** (`Note`/`Symbol`, `WROTE`/`DEFINES`) — add
    their elements. A legend below the canvas lists every relationship type
    present in the store with its color; the layout switches to force-directed
    while any layer is on and back to hierarchical for skeleton-only. With the
    contract layer on, `FROM` edges caption the recorded value flowing through
    them. Clicking a graph element or wave entry opens a side panel: the full
    node detail (status, acceptance criteria, input/output field values, review
    verdicts, notes and symbols) for a `GbuildNode`, or a generic element panel
    with the element's labels and properties for any other label. Nodes are
    also grouped by wave below the graph.
  - **Timeline** (`#/features/<slug>/timeline`) — each started node as a bar
    on one shared time axis, colored by status, with run durations and the
    idle gaps between nodes visible; unstarted nodes are listed below.
  - **Acceptance** (`#/features/<slug>/acceptance`) — the feature's
    acceptance criteria, each with its covering nodes as status chips;
    uncovered criteria are flagged.
  - **Repairs** (`#/features/<slug>/repairs`) — per-node review attempt
    history: verdict, failed criteria and checklist lines per attempt.
  - **Query** (`#/features/<slug>/query`) — an ad-hoc read-only Cypher console
    against the feature's store: returned rows render as a table, rows carrying
    node/relationship values also render as an NVL graph, and a rejected
    statement shows the server's error message.
- `#/attention` — attention dashboard: every failed and blocked node across
  all stores with project, feature, state, the dependencies it waits on, and
  its last failed criteria.
- `#/knowledge` — knowledge browser, topped by the cross-store knowledge
  graph: symbols merged by name+file across projects, connected to every
  defining feature, and notes linked through shared topic hubs. Below it the
  filterable lists of implementer notes grouped by topic and symbols (name,
  file, purpose, author) across all projects.

All views poll the API — default every 3000ms — and update in place. Override
the interval with the `?poll=<ms>` query parameter, e.g.
`http://localhost:8420/?poll=10000#/`.

## REST API

- `GET /api/features` — one summary per store: `{ project, slug, destination, status_counts }`.
- `GET /api/features/:slug/graph` — full node list of one store: slug, title,
  type, derived status (`pending` splits into `frontier`/`blocked`), wave,
  acceptance, `depends_on`, model tier, failure policy, run timestamps,
  inputs/outputs with recorded values, and reviews with checklists — plus the
  feature's acceptance criteria with the nodes covering each.
- `GET /api/attention` — failed and blocked nodes across all stores:
  `{ project, feature, node, state, waiting_on, last_failed_criteria }`.
- `GET /api/knowledge` — notes and symbols across all stores, each with
  `project`, `feature` and `by_node`.
- `POST /api/features/:slug/query` — read-only Cypher against one store:
  request `{ cypher }`, response `{ rows }` with rows capped at 500; node/rel
  values inside rows serialize the relate jsonl way (`{ id, kind, labels,
  properties }` / `{ id, kind, type, start_node, end_node, properties }`).
  `400` for an invalid body, invalid Cypher or a rejected write, `404` for an
  unknown feature slug.
- `GET /api/knowledge/graph` — the same knowledge as a cross-store graph:
  `Symbol` nodes merged by name+file, individual `Note` nodes linked to
  shared `Topic` hubs, one `Feature` node per store, and
  `DEFINES`/`WROTE`/`ABOUT` rels carrying `project`, `feature` and `by_node`
  provenance: `{ nodes: [{ id, labels, properties }], rels: [{ id, type, from, to, properties }] }`.

## Layout

- `index.ts`, `src/` — the node:http API server (`tsx`, no framework).
- `ui/` — the React 19 UI (Vite, `@neo4j-nvl/react`).
- `test/` — node:test suites for the API and the UI (jsdom + mocked fetch).
