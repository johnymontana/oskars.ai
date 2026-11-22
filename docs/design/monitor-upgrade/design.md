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
  - Timeline & durations (from `started_at`/`completed_at`)
  - Failure & repair history (review verdicts, `failed_criteria`, `checklist` lines)
  - Acceptance coverage (feature `Acceptance` nodes + `SATISFIES` edges)
  - Notes & symbols browser (across projects)
  - Attention dashboard (failed / needs-decision nodes across all stores)

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

## Open questions

- Information architecture: tabs inside the feature detail vs separate top-level pages for the new
  surfaces (timeline, acceptance, repairs, knowledge, attention).
- Where the attention dashboard surfaces: landing-page section vs its own route.
- Timeline scope: per-feature only, or also a cross-project view.
