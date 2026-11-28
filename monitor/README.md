# gbuild monitor

A local web UI and REST API for watching [gbuild](../plugins/gbuild/) feature
runs: discovered stores, per-node status, waves, field values, and review
verdicts — live, without reloading.

## Setup

From the repository root:

```sh
npm ci
npm ci --prefix monitor
npm run build --prefix monitor
```

The root install provides `tsx` and TypeScript. The monitor test dependencies require a
current Node.js patch release, such as Node 22.22.2+ or Node 24.15.0+ in their respective series.
The API requires the [`relate` CLI](https://github.com/neo4j-labs/relate) on `PATH` —
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

- `npm start -- <config.json> [port] [--host <address>]` starts the API and
  serves the built UI when `dist/` exists. It binds to `127.0.0.1` by default.
  Without a port, it selects a free port and prints the bound URL. Use `--host`
  explicitly to allow access outside loopback.
- `npm run dev` — Vite dev server with hot reload for UI work. It proxies
  `/api` to a running API server (`MONITOR_API_URL`, default
  `http://127.0.0.1:8420`), so start the API first:
  `npm start -- config.json 8420`.
- `npm run build` — bundles the UI into `dist/`.
- `npm test` — runs the API and UI tests (`node --import tsx --test`). The API
  tests skip when `relate` is not on `PATH`.

## Using the UI

- `#/` — feature list: project path, slug, destination, and per-status node
  counts for every discovered store. The dashboard reports unreadable roots
  or stores and shows when the displayed data was last refreshed.
- `#/features/<store-id>` — feature detail with hash-addressable tabs. The store
  ID identifies the database even when projects reuse a slug. Legacy
  `#/features/<slug>` links work for a single match and show a project chooser for
  ambiguous slugs.
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
    with the element's labels and properties for any other label. The searchable
    graph element list opens the same panels by keyboard, including for fields and
    relationships outside the current canvas layers. Escape closes the panel and
    returns focus to the control that opened it. Nodes are also grouped by wave.
  - **Timeline** (`#/features/<store-id>/timeline`) — each started node as a bar
    on one shared time axis, colored by status, with run durations and the
    idle gaps between nodes visible. Active attempts with a recorded start show
    elapsed time. For older stores, running nodes without timestamps are listed
    separately from nodes that haven't started.
  - **Acceptance** (`#/features/<store-id>/acceptance`) — the feature's
    acceptance criteria, each with its covering nodes as status chips;
    uncovered criteria are flagged.
  - **Repairs** (`#/features/<store-id>/repairs`) — per-node review attempt
    history: verdict, failed criteria and checklist lines per attempt.
  - **Query** (`#/features/<store-id>/query`) — an ad-hoc read-only Cypher console
    against the feature's store: returned rows render as a table, rows carrying
    node/relationship values also render as an NVL graph. Load the example to
    query task slugs and statuses. The console reports when it shows the first
    500 rows of a larger result.
- `#/attention` — failures with their latest failed criteria and count of affected
  nodes, followed by work blocked by failures and work waiting on ordinary
  dependencies. Node links open the corresponding detail panel.
- `#/knowledge` — knowledge browser, topped by the cross-store knowledge
  graph: symbols merged by name+file across projects, connected to every
  defining feature, and notes linked through shared topic hubs. Below it the
  filterable lists of implementer notes grouped by topic and symbols (name,
  file, purpose, author) across all projects.

All views poll the API — default every 3000ms — and update in place. Override
the interval with the `?poll=<ms>` query parameter, e.g.
`http://127.0.0.1:8420/?poll=10000#/`.

## REST API

- `GET /api/overview` — dashboard snapshot with `features`, `attention`,
  `diagnostics`, and `observed_at`.
- `GET /api/features` — one summary per store with `store_id`, `project`, `slug`,
  `destination`, and `status_counts`.
- `GET /api/features/:ref/graph` — full node list of one store: slug, title,
  type, derived status (`pending` splits into `frontier`/`blocked`), wave,
  acceptance, `depends_on`, model tier, failure policy, run timestamps,
  inputs/outputs with recorded values, and reviews with checklists — plus the
  feature's acceptance criteria with the nodes covering each.
- `GET /api/attention` — failed and blocked nodes across all stores. Entries
  include `store_id`, dependency slugs in `waiting_on` and `blocking_failures`,
  `blocked_count`, and `last_failed_criteria`.
- `GET /api/knowledge` — notes and symbols across all stores, each with
  `project`, `feature` and `by_node`.
- `POST /api/features/:ref/query` — read-only Cypher against one store.
  Send `{ cypher }` and receive `{ rows, truncated, limit }`. Node and relationship
  values inside rows serialize the relate jsonl way (`{ id, kind, labels,
  properties }` / `{ id, kind, type, start_node, end_node, properties }`).
  Feature endpoints accept store IDs and unambiguous legacy slugs. Unknown
  references return `404`, and ambiguous slugs return `409` with project matches.
- `GET /api/knowledge/graph` — the same knowledge as a cross-store graph:
  `Symbol` nodes merged by name+file, individual `Note` nodes linked to
  shared `Topic` hubs, one `Feature` node per store, and
  `DEFINES`/`WROTE`/`ABOUT` rels carrying `project`, `feature` and `by_node`
  provenance: `{ nodes: [{ id, labels, properties }], rels: [{ id, type, from, to, properties }] }`.

## Layout

- `index.ts`, `src/` — the node:http API server (`tsx`, no framework).
- `ui/` — the React 19 UI (Vite, `@neo4j-nvl/react`).
- `test/` — node:test suites for the API and the UI (jsdom + mocked fetch).
