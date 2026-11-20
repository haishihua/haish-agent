// An unlimited loop has no reachable exhaustion route. Keep the definition
// intact; both canvases project the same reachable edges for presentation.
export function workflowVisibleEdges(workflow) {
  const nodes = new Map((workflow?.nodes || []).map((node) => [String(node.id), node]));
  return (workflow?.edges || []).filter((edge) => {
    if (edge.branch !== 'exhausted') return true;
    const source = nodes.get(String(edge.from ?? edge.source));
    return source?.type !== 'loop' || source.max_loops != null;
  });
}
