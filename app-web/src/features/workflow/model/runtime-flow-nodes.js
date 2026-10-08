function sameValue(left, right) {
  return left === right || (Array.isArray(left) && Array.isArray(right)
    && left.length === right.length && left.every((value, index) => value === right[index]));
}

function sameData(left, right) {
  const keys = Object.keys(right || {});
  return keys.length === Object.keys(left || {}).length
    && keys.every((key) => sameValue(left[key], right[key]));
}

// Runtime updates must retain React Flow's measurements. Dropping measured
// makes NodeWrapper hide every card and invalidates its handle bounds.
export function reconcileRuntimeFlowNodes(current, incoming) {
  const byId = new Map(current.map((node) => [node.id, node]));
  const next = incoming.map((node) => {
    const previous = byId.get(node.id);
    if (!previous || previous.type !== node.type) return node;
    const position = previous.position.x === node.position.x && previous.position.y === node.position.y
      ? previous.position : node.position;
    const data = sameData(previous.data, node.data) ? previous.data : node.data;
    if (position === previous.position && data === previous.data
      && node.connectable === previous.connectable) return previous;
    return { ...previous, ...node, position, data };
  });
  return next.length === current.length && next.every((node, index) => node === current[index]) ? current : next;
}
