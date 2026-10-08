import test from 'node:test';
import assert from 'node:assert/strict';
import { adoptUserNodes } from '@xyflow/system';
import { reconcileRuntimeFlowNodes } from '../../../src/features/workflow/model/runtime-flow-nodes.js';

const node = (id, status = 'running') => ({ id, type: 'workflowNode', position: { x: 100, y: 50 }, connectable: false, data: { runtimeStatus: status, usedSideHandles: [] } });

test('runtime status updates preserve measured size, handles and unaffected nodes', () => {
  const current = [{ ...node('worker'), measured: { width: 196, height: 64 }, width: 196, height: 64 }, node('end')];
  const next = reconcileRuntimeFlowNodes(current, [node('worker', 'done'), node('end')]);
  assert.equal(next[0].measured, current[0].measured);
  assert.equal(next[0].position, current[0].position);
  assert.equal(next[0].data.runtimeStatus, 'done');
  assert.equal(next[1], current[1]);
  const lookup = new Map();
  const parents = new Map();
  adoptUserNodes(current, lookup, parents);
  const bounds = { source: [], target: [] };
  lookup.get('worker').internals.handleBounds = bounds;
  adoptUserNodes(next, lookup, parents);
  assert.deepEqual(lookup.get('worker').measured, { width: 196, height: 64 });
  assert.equal(lookup.get('worker').internals.handleBounds, bounds);
});

test('streaming with unchanged node data is a no-op', () => {
  const current = [node('worker')];
  assert.equal(reconcileRuntimeFlowNodes(current, [node('worker')]), current);
});

test('graph edits still move, add, remove and replace nodes without mutating old state', () => {
  const current = [{ ...node('worker'), measured: { width: 196, height: 64 } }, node('removed')];
  const moved = { ...node('worker'), position: { x: 400, y: 200 } };
  const next = reconcileRuntimeFlowNodes(current, [moved, node('added')]);
  assert.deepEqual(next.map((item) => item.id), ['worker', 'added']);
  assert.deepEqual(next[0].position, moved.position);
  assert.equal(next[0].measured, current[0].measured);
  assert.deepEqual(current[0].position, { x: 100, y: 50 });
  const replacement = { ...node('worker'), type: 'differentRenderer' };
  assert.equal(reconcileRuntimeFlowNodes(current, [replacement])[0], replacement);
});
