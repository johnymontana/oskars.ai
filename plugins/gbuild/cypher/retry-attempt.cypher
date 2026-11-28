// Allocate a distinct timing marker for a retry after recording its previous verdict.
//   relate query --database DB --mode jsonl --param 'slug="a"' < cypher/retry-attempt.cypher
MATCH (n:GbuildNode {slug: $slug, status: 'in_progress'})
WHERE n.active_attempt_id IS NULL
SET n.active_attempt_id = randomUUID()
RETURN n.active_attempt_id AS attempt_id;
