// 画布排布：新增节点的落点、拖放吸附与整图自动排版。
import { normalizeWorkflowNode } from './nodes.js';

const WORKFLOW_NODE_LAYOUT_STEP_X = 280;
const WORKFLOW_NODE_LAYOUT_START_X = 48;
const WORKFLOW_NODE_LAYOUT_MAIN_Y = 148;
const WORKFLOW_NODE_LAYOUT_BRANCH_Y = 320;
const WORKFLOW_NODE_LAYOUT_STEP_Y = 150;
const WORKFLOW_NODE_OCCUPY_X = 200;
const WORKFLOW_NODE_OCCUPY_Y = 100;
const WORKFLOW_NODE_DROP_GRID = 20;
const WORKFLOW_NODE_DROP_HALF_WIDTH = 107;
const WORKFLOW_NODE_DROP_HALF_HEIGHT = 31;

function workflowNodeCoord(node, axis = 'x', fallback = 0) {
  const value = Number(node?.position?.[axis]);
  return Number.isFinite(value) ? value : fallback;
}

function workflowNodeOverlaps(a, b, ignoreId = '') {
  if (!a || !b || a.id === ignoreId || b.id === ignoreId || a.id === b.id) return false;
  return Math.abs(workflowNodeCoord(a, 'x') - workflowNodeCoord(b, 'x')) < WORKFLOW_NODE_OCCUPY_X
    && Math.abs(workflowNodeCoord(a, 'y') - workflowNodeCoord(b, 'y')) < WORKFLOW_NODE_OCCUPY_Y;
}

/** Place a newly added node left of End (output), shifting End right when needed. */
export function placeAddedWorkflowNode(nodes = [], newNode) {
  const list = Array.isArray(nodes) ? nodes.filter((node) => node?.id) : [];
  const candidate = newNode && typeof newNode === 'object' ? { ...newNode } : null;
  if (!candidate?.id) {
    return { nodes: list, position: { x: WORKFLOW_NODE_LAYOUT_START_X + WORKFLOW_NODE_LAYOUT_STEP_X, y: WORKFLOW_NODE_LAYOUT_MAIN_Y } };
  }

  const withoutDuplicate = list.filter((node) => node.id !== candidate.id);
  const endNode = withoutDuplicate.find((node) => node.type === 'output');
  const others = withoutDuplicate.filter((node) => node.type !== 'output');

  let insertX = WORKFLOW_NODE_LAYOUT_START_X + WORKFLOW_NODE_LAYOUT_STEP_X;
  let insertY = WORKFLOW_NODE_LAYOUT_MAIN_Y;
  if (others.length) {
    const rightmost = others.reduce((best, node) => {
      const x = workflowNodeCoord(node, 'x', WORKFLOW_NODE_LAYOUT_START_X);
      if (x > best.x) {
        return { x, y: workflowNodeCoord(node, 'y', WORKFLOW_NODE_LAYOUT_MAIN_Y) };
      }
      return best;
    }, { x: -Infinity, y: WORKFLOW_NODE_LAYOUT_MAIN_Y });
    insertX = rightmost.x + WORKFLOW_NODE_LAYOUT_STEP_X;
    insertY = rightmost.y;
  }

  let nextNodes = withoutDuplicate.map((node) => ({ ...node, position: { ...node.position } }));
  if (endNode) {
    const endX = workflowNodeCoord(endNode, 'x', insertX);
    const endY = workflowNodeCoord(endNode, 'y', insertY);
    // Prefer the End slot so the new node sits between Start and End, then push End right.
    if (insertX >= endX - 40) {
      insertX = endX;
      insertY = endY;
      nextNodes = nextNodes.map((node) => (
        node.id === endNode.id
          ? {
            ...node,
            position: {
              x: endX + WORKFLOW_NODE_LAYOUT_STEP_X,
              y: endY,
            },
          }
          : node
      ));
    }
  }

  let guard = 0;
  while (
    nextNodes.some((node) => workflowNodeOverlaps(node, { id: candidate.id, position: { x: insertX, y: insertY } }))
    && guard < 12
  ) {
    insertY += WORKFLOW_NODE_LAYOUT_STEP_Y;
    guard += 1;
  }

  const position = { x: insertX, y: insertY };
  return {
    nodes: [...nextNodes, { ...candidate, position }],
    position,
  };
}

/** Place a dragged toolbar node with its center at the snapped canvas drop point. */
export function placeDroppedWorkflowNode(nodes = [], newNode, dropPosition) {
  const list = Array.isArray(nodes) ? nodes.filter((node) => node?.id) : [];
  const candidate = newNode && typeof newNode === 'object' ? { ...newNode } : null;
  const dropX = Number(dropPosition?.x);
  const dropY = Number(dropPosition?.y);
  if (!candidate?.id || !Number.isFinite(dropX) || !Number.isFinite(dropY)) {
    return placeAddedWorkflowNode(list, candidate);
  }

  const position = {
    x: Math.round((dropX - WORKFLOW_NODE_DROP_HALF_WIDTH) / WORKFLOW_NODE_DROP_GRID) * WORKFLOW_NODE_DROP_GRID,
    y: Math.round((dropY - WORKFLOW_NODE_DROP_HALF_HEIGHT) / WORKFLOW_NODE_DROP_GRID) * WORKFLOW_NODE_DROP_GRID,
  };
  return {
    nodes: [
      ...list.filter((node) => node.id !== candidate.id),
      { ...candidate, position },
    ],
    position,
  };
}

export function layoutWorkflowNodes(nodes = [], edges = []) {
  const list = Array.isArray(nodes) ? nodes.filter((node) => node?.id) : [];
  if (!list.length) return [];

  const nodeIds = new Set(list.map((node) => node.id));
  const edgeList = (Array.isArray(edges) ? edges : [])
    .map((edge) => ({
      from: String(edge?.from || edge?.source || '').trim(),
      to: String(edge?.to || edge?.target || '').trim(),
    }))
    .filter((edge) => edge.from && edge.to && nodeIds.has(edge.from) && nodeIds.has(edge.to) && edge.from !== edge.to);

  const outgoing = new Map();
  const incomingCount = new Map(list.map((node) => [node.id, 0]));
  edgeList.forEach((edge) => {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge.to);
    incomingCount.set(edge.to, (incomingCount.get(edge.to) || 0) + 1);
  });

  const startCandidates = list
    .filter((node) => node.type === 'start' || (incomingCount.get(node.id) || 0) === 0)
    .map((node) => node.id);
  const queue = startCandidates.length ? [...startCandidates] : [list[0].id];
  const rank = new Map();
  const visited = new Set();

  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    const currentRank = rank.get(id) || 0;
    (outgoing.get(id) || []).forEach((nextId) => {
      const nextRank = currentRank + 1;
      if (!rank.has(nextId) || nextRank > rank.get(nextId)) rank.set(nextId, nextRank);
      if (!visited.has(nextId)) queue.push(nextId);
    });
  }

  list.forEach((node, index) => {
    if (!rank.has(node.id)) rank.set(node.id, index);
  });

  const columns = new Map();
  list.forEach((node) => {
    const column = rank.get(node.id) || 0;
    if (!columns.has(column)) columns.set(column, []);
    columns.get(column).push(node);
  });

  const positioned = new Map();
  [...columns.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([column, columnNodes]) => {
      const ordered = [...columnNodes].sort((a, b) => {
        const aY = Number(a?.position?.y);
        const bY = Number(b?.position?.y);
        if (Number.isFinite(aY) && Number.isFinite(bY) && aY !== bY) return aY - bY;
        return String(a.id).localeCompare(String(b.id));
      });
      ordered.forEach((node, row) => {
        positioned.set(node.id, {
          x: WORKFLOW_NODE_LAYOUT_START_X + (column * WORKFLOW_NODE_LAYOUT_STEP_X),
          y: ordered.length === 1
            ? WORKFLOW_NODE_LAYOUT_MAIN_Y
            : WORKFLOW_NODE_LAYOUT_MAIN_Y + (row * (WORKFLOW_NODE_LAYOUT_BRANCH_Y - WORKFLOW_NODE_LAYOUT_MAIN_Y)),
        });
      });
    });

  return list.map((node) => normalizeWorkflowNode({
    ...node,
    position: positioned.get(node.id) || node.position || { x: WORKFLOW_NODE_LAYOUT_START_X, y: WORKFLOW_NODE_LAYOUT_MAIN_Y },
  }, node));
}
