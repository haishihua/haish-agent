// Visual editing only: never change workflow topology or branch semantics.
export const WORKFLOW_PORT_SIDES = ['left', 'right', 'top', 'bottom'];
export const workflowRouteKey = (edge) => JSON.stringify([
  String(edge.from || edge.source || ''), String(edge.to || edge.target || ''), String(edge.branch || ''),
]);
export const workflowSideHandle = (type, side) => `visual-${type}-${side}`;
function workflowHandleSide(handle, type) {
  return WORKFLOW_PORT_SIDES.find((side) => handle === workflowSideHandle(type, side)) || '';
}

export function workflowRouteHandles(edge, routes) {
  const route = routes[workflowRouteKey(edge)] || {};
  return {
    ...(WORKFLOW_PORT_SIDES.includes(route.source) ? { sourceHandle: workflowSideHandle('source', route.source) } : {}),
    ...(WORKFLOW_PORT_SIDES.includes(route.target) ? { targetHandle: workflowSideHandle('target', route.target) } : {}),
  };
}

export function workflowUsedSideHandles(nodeId, edges, routes) {
  const handles = new Set();
  for (const edge of edges || []) {
    const resolved = workflowRouteHandles(edge, routes);
    if (String(edge.from || edge.source) === String(nodeId) && resolved.sourceHandle) handles.add(resolved.sourceHandle);
    if (String(edge.to || edge.target) === String(nodeId) && resolved.targetHandle) handles.add(resolved.targetHandle);
  }
  return [...handles];
}

/** Reject changing nodes, the opposite endpoint, or invalid handle types on reconnect. */
export function workflowReconnectRoute(edge, connection, type, previous = {}) {
  if (!edge || !connection || !['source', 'target'].includes(type)) return null;
  if (edge.source !== connection.source || edge.target !== connection.target) return null;
  const opposite = type === 'source' ? 'target' : 'source';
  if ((edge[`${opposite}Handle`] || null) !== (connection[`${opposite}Handle`] || null)) return null;
  const side = workflowHandleSide(connection[`${type}Handle`], type);
  if (!side) return null;
  return { ...previous, [type]: side };
}

const size = (node, axis) => node.measured?.[axis === 'x' ? 'width' : 'height']
  || node[axis === 'x' ? 'width' : 'height'] || (axis === 'x' ? 160 : 64);

/** Closest axis alignment in screen-space tolerance. Connected port axes win ties.
 * Internal handle bounds let differently sized cards/branch ports align exactly. */
export function workflowSnapPosition(node, nodes, edges = [], { zoom = 1, internalNode = () => null } = {}) {
  const tolerance = 10 / Math.max(0.1, zoom);
  const position = { ...node.position };
  const best = { x: null, y: null };
  const offer = (axis, value, other, priority = 1, offset = size(node, axis) / 2) => {
    const delta = Math.abs(value - node.position[axis]);
    if (delta > tolerance) return;
    const current = best[axis];
    if (!current || priority < current.priority || (priority === current.priority && delta < current.delta - 0.01)) {
      best[axis] = { value, delta, other, priority, offset };
    }
  };
  for (const other of nodes) {
    if (other.id === node.id || other.selected || other.id.startsWith('__')) continue;
    for (const axis of ['x', 'y']) {
      // Centers first, then matching leading/trailing edges.
      for (const ratio of [0.5, 0, 1]) {
        offer(axis, other.position[axis] + size(other, axis) * ratio - size(node, axis) * ratio, other, 1, size(node, axis) * ratio);
      }
    }
  }
  const handle = (id, type, handleId) => internalNode(id)?.internals?.handleBounds?.[type]
    ?.find((item) => handleId ? item.id === handleId : !item.id);
  for (const edge of edges) {
    const type = edge.source === node.id ? 'source' : edge.target === node.id ? 'target' : '';
    if (!type) continue;
    const opposite = type === 'source' ? 'target' : 'source';
    const other = nodes.find((item) => item.id === edge[opposite]);
    if (!other || other.selected) continue;
    const from = handle(node.id, type, edge[`${type}Handle`]);
    const to = handle(other.id, opposite, edge[`${opposite}Handle`]);
    if (!from || !to) continue;
    const horizontal = ['left', 'right'];
    const vertical = ['top', 'bottom'];
    const axis = horizontal.includes(from.position) && horizontal.includes(to.position) ? 'y'
      : vertical.includes(from.position) && vertical.includes(to.position) ? 'x' : null;
    if (axis) {
      const dimension = axis === 'x' ? 'width' : 'height';
      offer(axis, other.position[axis] + to[axis] + to[dimension] / 2 - from[axis] - from[dimension] / 2, other, 0, from[axis] + from[dimension] / 2);
    }
  }
  for (const axis of ['x', 'y']) if (best[axis]) position[axis] = best[axis].value;
  const guides = Object.entries(best).filter(([, match]) => match).map(([axis, match]) => ({
    axis,
    value: position[axis] + match.offset,
    start: Math.min(position[axis === 'x' ? 'y' : 'x'], match.other.position[axis === 'x' ? 'y' : 'x']) - 24,
    end: Math.max(position[axis === 'x' ? 'y' : 'x'] + size(node, axis === 'x' ? 'y' : 'x'),
      match.other.position[axis === 'x' ? 'y' : 'x'] + size(match.other, axis === 'x' ? 'y' : 'x')) + 24,
  }));
  return { position, guides, width: size(node, 'x'), height: size(node, 'y') };
}
