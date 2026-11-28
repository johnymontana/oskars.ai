.begin
CREATE (f:Feature {
  feature: 'publish-a-sample-site',
  destination: 'Publish a small documentation site after checking its navigation.',
  context: 'An example run for exploring the monitor.',
  out_of_scope: []
})
CREATE (a:Acceptance {id: 'a-1', text: 'Readers can reach each page from the navigation.'})
CREATE (f)-[:HAS_ACCEPTANCE]->(a)
CREATE (draft:GbuildNode:Code {
  slug: 'draft-the-pages', title: 'Draft the documentation pages', type: 'code',
  acceptance: ['The home and getting-started pages exist.'],
  status: 'completed', failure_policy: 'retry', model_tier: 'cheap',
  started_at: '2026-01-01T09:00:00Z', completed_at: '2026-01-01T09:04:00Z'
})
CREATE (draft)-[:OUTPUT]->(pages:Field {name: 'pages', shape: '<list of changed file paths>', value: ['index.md', 'getting-started.md']})
CREATE (draft)-[:REVIEWED]->(:Review {
  attempt: 1, verdict: 'pass', failed_criteria: [], checklist: ['Both documentation pages exist.'],
  at: '2026-01-01T09:05:00Z'
})
CREATE (draft)-[:WROTE]->(:Note {
  topic: 'testing', text: 'Check links from the rendered home page.',
  by_node: 'draft-the-pages', at: '2026-01-01T09:04:00Z'
})
CREATE (links:GbuildNode:Verify {
  slug: 'check-navigation', title: 'Check the navigation links', type: 'verify',
  acceptance: ['The Getting started link opens the guide.'],
  status: 'failed', failure_policy: 'escalate', model_tier: 'cheap', verify: 'draft-the-pages',
  started_at: '2026-01-01T09:06:00Z', completed_at: '2026-01-01T09:08:00Z'
})
CREATE (links)-[:DEPENDS_ON]->(draft)
CREATE (links)-[:INPUT]->(:Field {name: 'pages', shape: '<list of changed file paths>'})-[:FROM]->(pages)
CREATE (links)-[:OUTPUT]->(linkReport:Field {name: 'link-report', shape: '<path to the navigation check report>'})
CREATE (links)-[:SATISFIES]->(a)
CREATE (links)-[:REVIEWED]->(:Review {
  attempt: 1, verdict: 'fail',
  failed_criteria: ['Getting started links to an outdated page address.'],
  checklist: ['The guide exists but its navigation link returns 404.'],
  at: '2026-01-01T09:09:00Z'
})
CREATE (publish:GbuildNode:Code {
  slug: 'publish-the-site', title: 'Publish the documentation site', type: 'code',
  acceptance: ['The site publishes after its navigation passes.'],
  status: 'pending', failure_policy: 'retry', model_tier: 'cheap'
})
CREATE (publish)-[:DEPENDS_ON]->(links)
CREATE (publish)-[:INPUT]->(:Field {name: 'link-report', shape: '<path to the navigation check report>'})-[:FROM]->(linkReport)
CREATE (publish)-[:OUTPUT]->(:Field {name: 'site-url', shape: '<published site URL>'})
CREATE (tidy:GbuildNode:Verify {
  slug: 'check-page-titles', title: 'Check page titles', type: 'verify',
  acceptance: ['Each page has a descriptive title.'],
  status: 'pending', failure_policy: 'retry', model_tier: 'cheap', verify: 'draft-the-pages'
})
CREATE (tidy)-[:DEPENDS_ON]->(draft)
CREATE (tidy)-[:INPUT]->(:Field {name: 'pages', shape: '<list of changed file paths>'})-[:FROM]->(pages)
CREATE (tidy)-[:OUTPUT]->(:Field {name: 'title-report', shape: '<path to the title check report>'});
.commit
