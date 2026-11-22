# Design: monitor-upgrade

## Destination

The monitor is a polished, dark-themed AI-dev-tool UI where the NVL graph is the primary navigation
surface — status-colored, wave-layered, interactive (zoom, click for detail panel, double-click to
focus a neighborhood) — and the store's richer data (durations, review history, acceptance coverage,
notes/symbols) is explorable across projects.

## Scope

- NVL graph upgrade: hierarchical-by-wave layout (toggle to force-directed), status-colored nodes,
  zoom/pan/fit controls, click → node detail side panel, double-click → focus transitive
  neighborhood (dim the rest), double-click canvas → reset.
- Hand-rolled dark theme: consistent status color language, monospace identifiers, dense scannable
  layout, relative timestamps, keyboard shortcuts, empty/loading/error states.
- New data surfaces (all server-extractable from existing stores):
  - Timeline & durations (from `started_at`/`completed_at`) — per-feature tab
  - Failure & repair history (review verdicts, `failed_criteria`, `checklist` lines) — Repairs tab
  - Acceptance coverage (feature `Acceptance` nodes + `SATISFIES` edges) — Acceptance tab
  - Notes & symbols browser (across projects) — `#/knowledge` route
  - Attention dashboard (failed / needs-decision nodes across all stores) — landing summary section
    + `#/attention` route

## Out of scope

- Live activity feed (declined in round 1)
- Writing to or mutating any store — the monitor stays read-only
- Server-push transports (SSE/websockets) — polling stays
- Auth, multi-user, hosted deployment

## Analysis findings

- Current app is ~830 lines: bare `InteractiveNvlWrapper` (no callbacks, no status colors,
  force-directed default), unstyled HTML cards, hash routing, 3s polling.
- NVL provides everything needed: `onNodeDoubleClick`/`onCanvasDoubleClick`, `hierarchical` layout
  (waves become layers), per-node color/caption styling, `fit()`, box/lasso select, keyboard.
- Unfetched store data: node `started_at`/`completed_at`, review `checklist` (fail detail),
  `Note`/`Symbol` nodes, feature-level `Acceptance` + `SATISFIES`, attention (failed nodes).

## Decisions

1. **Destination confirmed** (round 1) — graph as primary navigation surface, richer run data
   explorable across projects.
2. **Double-click = focus neighborhood**, not expand/collapse (round 1). All nodes are already
   loaded; graphs are small. Double-click a node → it plus its transitive upstream+downstream stay
   lit, everything else dims; double-click canvas resets. Alternative ruled out: collapse/expand
   subtree (useful at 10k nodes, noise at 30).
3. **Hierarchical-by-wave default layout** with a force-directed toggle (round 1). gbuild explains
   runs in waves; the graph should draw them. Alternative ruled out: force-directed default
   (current — produces a shapeless blob for DAGs).
4. **Hand-rolled dark theme, no new dependencies** (round 1). The repo's convention is dep-light
   (node:http, no framework). Alternative ruled out: @neo4j-ndl/react Needle design system (adds a
   dependency and a design language the repo doesn't otherwise use).
5. **Information architecture: tabs + two top-level routes** (round 2). Feature detail gets tabs —
   Graph | Timeline | Acceptance | Repairs — keeping per-feature context together. The attention
   dashboard and the knowledge browser are top-level routes (`#/attention`, `#/knowledge`).
   Alternatives ruled out: all-separate-routes (too many navigation hops) and one-long-page
   (heavy scrolling, and the graph is the primary surface, not a section of a page).
6. **Attention placement: landing summary + dedicated route** (round 2). The feature list landing
   gains a "needs attention" section on top (failed/blocked nodes across all stores); `#/attention`
   carries the full detail. Alternatives ruled out: route-only (hides urgency) and
   attention-as-landing (demotes the feature list, which is the app's hub).
7. **Timeline: per-feature only** (round 2), as a tab in the feature detail. Alternative ruled out:
   a cross-project global timeline (concurrent runs on one axis) — no evidence anyone compares runs
   across projects in time; revisit if asked.
8. **Node cards → side panel + compact wave list** (round 3). Clicking a graph node opens the side
   panel with full detail (properties, acceptance, fields, reviews, timestamps, duration). The
   wave-grouped cards shrink to a compact summary list under the graph — names + status chips;
   clicking one opens its panel. Alternatives ruled out: panel-only (loses the at-a-glance wave
   overview) and panel-plus-full-cards (two competing detail surfaces).

## Mechanism notes (settled, for plan to decompose)

- **API**: extend `GET /api/features/:slug/graph` with per-node `started_at`/`completed_at`,
  `model_tier`, `failure_policy`, review `checklist`, and the feature's acceptance criteria with
  `covered_by`. Add `GET /api/attention` (failed and blocked nodes across all discovered stores)
  and `GET /api/knowledge` (notes and symbols across all discovered stores). All store reads stay
  `relate query --read-only --mode jsonl`; parallelize per-store queries with `Promise.all`.
- **Status color language** (one set used everywhere — graph nodes, chips, timeline bars):
  completed green, in_progress amber, frontier blue, blocked gray, failed red, cancelled dimmed.
- **Side panel contents**: slug, title, type, status, wave, model_tier, failure_policy,
  started/completed + duration, acceptance criteria, input/output fields with values, review
  history with failed criteria and checklists, notes and symbols left by the node.
- **Keyboard**: Esc closes the panel / resets neighborhood focus; otherwise native tab order.
- **Neighborhood focus** is a restyle (dim non-neighborhood nodes/rels), not a data refetch.
- **Testing**: extend the existing node:test suites — server tests against fixture stores built
  with the relate CLI; UI render tests (jsdom, mocked fetch) mounting the NVL wrapper for real.
