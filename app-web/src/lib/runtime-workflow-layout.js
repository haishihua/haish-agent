import React from 'react';

const NODE_WIDTH = 214;
const COLUMN_GAP = 76;
const CANVAS_PADDING_X = 48;
const CANVAS_TOP = 96;
const ROW_GAP = 230;
const BRANCH_OFFSET_Y = 118;

const BRANCH_PRIORITY = {
  true: 1,
  approved: 1,
  false: 3,
  rejected: 3,
  exhausted: 4,
  retry: 5,
};

export function workflowApprovalDecisionStatus(node, result) {
  if (node?.type !== 'human_approval') return '';
  const decision = String(result?.decision || result?.structured?.decision || '').trim().toLowerCase();
  if (decision === 'approve' || decision === 'approved') return 'approved';
  if (decision === 'reject' || decision === 'rejected') return 'rejected';
  return '';
}

export function mergeWorkflowNodeAttempts(persisted, streamed, nodeId) {
  const saved = Array.isArray(persisted) ? persisted : [];
  const live = Array.isArray(streamed) ? streamed : [];
  const completedCount = live.filter((attempt) => attempt.finishedAt).length;
  const prefixCount = Math.max(0, saved.length - completedCount);
  const prefix = saved.slice(0, prefixCount).map((attempt, index) => ({
    id: `${nodeId}-persisted-${attempt.attempt || index + 1}`,
    events: [],
    result: attempt,
    startedAt: attempt.started_at || null,
    finishedAt: attempt.finished_at || null,
  }));
  let savedIndex = prefixCount;
  const merged = live.map((attempt) => ({
    ...attempt,
    // In-progress attempts are not in node_attempts yet. Align only completed
    // stream attempts with the persisted suffix so attempt N never shows N-1.
    result: attempt.finishedAt ? (saved[savedIndex++] || null) : null,
  }));
  return [...prefix, ...merged];
}

/** Infer node outcomes from receipts; selecting an outgoing edge proves its source finished. */
export function workflowNodeOutcomesFromEvents(eventLog = []) {
  const outcomes = new Map();
  for (const event of Array.isArray(eventLog) ? eventLog : []) {
    if (event?.type === 'workflow_edge_selected') {
      const sourceId = String(event.fromNodeId || event.from_node_id || '');
      const current = outcomes.get(sourceId);
      if (sourceId && (!current || current === 'running')) outcomes.set(sourceId, 'done');
    }
    const nodeId = String(
      event?.workflowNodeId || event?.workflow_node_id || event?.nodeId || event?.node_id || '',
    );
    if (!nodeId) continue;
    if (event.type === 'workflow_node_started') outcomes.set(nodeId, 'running');
    if (event.type !== 'workflow_node_finished') continue;
    const decision = String(event.decision || '').trim().toLowerCase();
    const status = String(event.status || '').trim().toLowerCase();
    if (decision === 'approve' || decision === 'approved') outcomes.set(nodeId, 'approved');
    else if (decision === 'reject' || decision === 'rejected') outcomes.set(nodeId, 'rejected');
    else if (event.error || status === 'failed') outcomes.set(nodeId, 'failed');
    else if (status === 'cancelled' || status === 'aborted') outcomes.set(nodeId, 'cancelled');
    else outcomes.set(nodeId, 'done');
  }
  return outcomes;
}

/** Keep every workflow surface on the same responsive column count. */
export function useWorkflowCanvasWidth(ref, observeKey = '') {
  const [width, setWidth] = React.useState(1200);
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    let frame = 0;
    const update = (nextWidth = element.clientWidth) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rounded = Math.round(Number(nextWidth) || element.clientWidth || 1200);
        setWidth((current) => (current === rounded ? current : rounded));
      });
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      const onResize = () => update();
      window.addEventListener('resize', onResize);
      return () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener('resize', onResize);
      };
    }
    const observer = new ResizeObserver(([entry]) => update(entry?.contentRect?.width));
    observer.observe(element);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [observeKey, ref]);
  return width;
}

function nodeX(node) {
  const x = Number(node?.position?.x);
  return Number.isFinite(x) ? x : 0;
}

function edgeEnds(edge) {
  return {
    source: String(edge?.from || edge?.source || ''),
    target: String(edge?.to || edge?.target || ''),
  };
}

function edgePriority(edge) {
  return edge?.branch ? (BRANCH_PRIORITY[edge.branch] ?? 2) : 0;
}

function closestFreeColumn(occupied, preferred, columns) {
  for (let distance = 0; distance < columns; distance += 1) {
    for (const candidate of distance ? [preferred - distance, preferred + distance] : [preferred]) {
      if (candidate >= 0 && candidate < columns && !occupied.has(candidate)) return candidate;
    }
  }
  return preferred;
}

/** Runtime-only layout: keep the primary route readable and wrap overflow into snake rows. */
export function layoutRuntimeWorkflow(nodes = [], edges = [], viewportWidth = 1200) {
  const list = (Array.isArray(nodes) ? nodes : []).filter((node) => node?.id);
  const nodeById = new Map(list.map((node) => [String(node.id), node]));
  const edgeList = (Array.isArray(edges) ? edges : [])
    .map((edge) => ({ ...edge, ...edgeEnds(edge) }))
    .filter((edge) => edge.source && edge.target && nodeById.has(edge.source) && nodeById.has(edge.target));
  const outgoing = new Map();
  const incoming = new Map();
  edgeList.forEach((edge) => {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    outgoing.get(edge.source).push(edge);
    incoming.get(edge.target).push(edge);
  });

  const start = list.find((node) => node.type === 'start')
    || list.find((node) => !incoming.has(String(node.id)))
    || list[0];
  const primaryIds = [];
  const primarySet = new Set();
  let cursor = start ? String(start.id) : '';
  while (cursor && !primarySet.has(cursor)) {
    primaryIds.push(cursor);
    primarySet.add(cursor);
    const next = [...(outgoing.get(cursor) || [])]
      .filter((edge) => !primarySet.has(edge.target))
      .sort((a, b) => edgePriority(a) - edgePriority(b) || nodeX(nodeById.get(a.target)) - nodeX(nodeById.get(b.target)))[0];
    cursor = next?.target || '';
  }

  const width = Number.isFinite(Number(viewportWidth)) ? Number(viewportWidth) : 1200;
  const columns = Math.max(2, Math.min(
    Math.max(primaryIds.length, 2),
    Math.floor((Math.max(width, 480) - (CANVAS_PADDING_X * 2) + COLUMN_GAP) / (NODE_WIDTH + COLUMN_GAP)),
  ));
  const xForColumn = (column) => CANVAS_PADDING_X + (column * (NODE_WIDTH + COLUMN_GAP));
  const positions = new Map();
  const meta = new Map();

  primaryIds.forEach((id, order) => {
    const row = Math.floor(order / columns);
    const offset = order % columns;
    const direction = row % 2 === 0 ? 'right' : 'left';
    const column = direction === 'right' ? offset : columns - 1 - offset;
    positions.set(id, { x: xForColumn(column), y: CANVAS_TOP + (row * ROW_GAP) });
    meta.set(id, { kind: 'primary', order, row, column, direction });
  });

  const occupiedByRow = new Map();
  const secondaryNodes = list
    .filter((node) => !primarySet.has(String(node.id)))
    .sort((a, b) => nodeX(a) - nodeX(b));
  secondaryNodes.forEach((node, index) => {
    const id = String(node.id);
    const parentEdge = (incoming.get(id) || []).find((edge) => primarySet.has(edge.source));
    const targetEdge = (outgoing.get(id) || []).find((edge) => primarySet.has(edge.target));
    const anchorId = parentEdge?.source || targetEdge?.target || primaryIds[Math.min(index, Math.max(primaryIds.length - 1, 0))];
    const anchor = meta.get(anchorId) || { order: index, row: 0, column: index % columns, direction: 'right' };
    if (!occupiedByRow.has(anchor.row)) occupiedByRow.set(anchor.row, new Set());
    const occupied = occupiedByRow.get(anchor.row);
    const column = closestFreeColumn(occupied, anchor.column, columns);
    occupied.add(column);
    positions.set(id, { x: xForColumn(column), y: CANVAS_TOP + (anchor.row * ROW_GAP) + BRANCH_OFFSET_Y });
    meta.set(id, {
      kind: 'secondary',
      order: anchor.order + 0.5,
      row: anchor.row,
      column,
      direction: anchor.direction,
      anchorId,
    });
  });

  return {
    positions,
    meta,
    columns,
    rowCount: Math.max(1, Math.ceil(primaryIds.length / columns)),
  };
}
