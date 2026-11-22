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
  counts for every discovered store.
- `#/features/<slug>` — graph detail: the dependency graph rendered with
  [@neo4j-nvl/react](https://neo4j.com/docs/nvl/current/) (canvas renderer),
  plus nodes grouped by wave with status, acceptance criteria, input/output
  field values, and review verdicts.

Both views poll the API — default every 3000ms — and update in place. Override
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

## Layout

- `index.ts`, `src/` — the node:http API server (`tsx`, no framework).
- `ui/` — the React 19 UI (Vite, `@neo4j-nvl/react`).
- `test/` — node:test suites for the API and the UI (jsdom + mocked fetch).
