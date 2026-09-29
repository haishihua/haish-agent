import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowSnapPosition, workflowRouteKey, workflowRouteHandles, workflowUsedSideHandles, workflowReconnectRoute } from '../../../src/features/workflow/model/workflow-canvas-editing.js';
import { saveWorkflowCanvasPreferences, workflowFitOptions } from '../../../src/features/workflow/model/workflow-canvas-preferences.js';

const node = (id, x, y, width = 160, height = 64) => ({ id, position: { x, y }, measured: { width, height } });
test('snap aligns to non-grid coordinates and previews the exact release position', () => {
  const a = node('a', 48, 96); const b = node('b', 300, 102);
  const snap = workflowSnapPosition(b, [a, b]);
  assert.deepEqual(snap.position, { x: 300, y: 96 });
  assert.equal(snap.guides.length, 1);
  assert.equal(snap.guides[0].value, 128);
});
test('snap tolerance stays ten screen pixels at different zooms', () => {
  const a = node('a', 48, 96); const b = node('b', 300, 110);
  assert.equal(workflowSnapPosition(b, [a, b], [], { zoom: 1 }).position.y, 110);
  assert.equal(workflowSnapPosition(b, [a, b], [], { zoom: 0.5 }).position.y, 96);
});
test('measured ports align even when node dimensions differ', () => {
  const a = node('a', 0, 96, 160, 80); const b = node('b', 300, 99);
  const internalNode = (id) => ({ internals: { handleBounds: id === 'a'
    ? { source: [{ id: null, position: 'right', y: 36, height: 8 }] }
    : { target: [{ id: null, position: 'left', y: 28, height: 8 }] } } });
  const snap = workflowSnapPosition(b, [a, b], [{ source: 'a', target: 'b' }], { internalNode });
  assert.equal(snap.position.y, 104);
});
test('unrelated nodes and multi-selected peers do not force distant snaps', () => {
  const b = node('b', 300, 150);
  assert.deepEqual(workflowSnapPosition(b, [node('a', 0, 96), b]).guides, []);
  assert.deepEqual(workflowSnapPosition(b, [{ ...node('a', 0, 150), selected: true }, b]).guides, []);
});
test('reconnect only changes a visual side, preserving the branch and opposite endpoint', () => {
  const edge = { source: 'loop', target: 'worker', sourceHandle: 'retry', targetHandle: 'runtime-feedback' };
  const next = { ...edge, targetHandle: 'visual-target-top' };
  assert.deepEqual(workflowReconnectRoute(edge, next, 'target', { source: 'left' }), { source: 'left', target: 'top' });
  assert.equal(workflowReconnectRoute(edge, { ...next, target: 'other' }, 'target'), null);
  assert.equal(workflowReconnectRoute(edge, { ...next, sourceHandle: 'exhausted' }, 'target'), null);
  assert.equal(workflowReconnectRoute(edge, { ...next, targetHandle: 'visual-source-top' }, 'target'), null);
});
test('route keys include branch; both pages resolve the same stored handles', () => {
  const edge = { from: 'loop', to: 'worker', branch: 'retry' };
  const routes = { [workflowRouteKey(edge)]: { source: 'top', target: 'left' } };
  assert.deepEqual(workflowRouteHandles(edge, routes), { sourceHandle: 'visual-source-top', targetHandle: 'visual-target-left' });
  assert.deepEqual(workflowRouteHandles({ ...edge, branch: 'exhausted' }, routes), {});
  assert.deepEqual(workflowUsedSideHandles('worker', [edge], routes), ['visual-target-left']);
});
test('zoom and port preferences persist independently per workflow without editing definitions', () => {
  const previous = globalThis.window;
  const storage = new Map();
  globalThis.window = { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) }, dispatchEvent() {} };
  try {
    assert.equal(saveWorkflowCanvasPreferences('w', { routes: { edge: { target: 'top' } } }), true);
    assert.equal(saveWorkflowCanvasPreferences('w', { zoom: 0.87 }), true);
    assert.deepEqual(workflowFitOptions('w', { padding: 0.2 }), { padding: 0.2, minZoom: 0.87, maxZoom: 0.87 });
    assert.deepEqual(workflowFitOptions('other', { maxZoom: 0.9 }), { maxZoom: 0.9 });
    assert.match([...storage.values()][0], /"target":"top"/);
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; }
});
