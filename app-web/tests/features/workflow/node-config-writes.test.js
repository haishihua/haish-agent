import test from 'node:test';
import assert from 'node:assert/strict';
import { createNodeConfigWrites } from '../../../src/features/workflow/model/node-config-writes.js';
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('immediate execution waits for saves and sees the newest multi-node selection', async () => {
  const queue = createNodeConfigWrites({});
  const gate = deferred(); const calls = [];
  const first = queue.change('a', { agent_id: 'new' }, async () => { calls.push('a'); await gate.promise; });
  const second = queue.change('b', { model_id: 'model' }, () => { calls.push('b'); });
  let executed = false;
  const execution = queue.flush().then((configs) => { executed = true; return configs; });
  await Promise.resolve(); assert.equal(executed, false); assert.deepEqual(calls, ['a']);
  gate.resolve(); await Promise.all([first, second]);
  assert.deepEqual(await execution, { a: { agent_id: 'new' }, b: { model_id: 'model' } });
  assert.deepEqual(calls, ['a', 'b']);
});
test('a failed edit restores the confirmed model and does not permanently block execution', async () => {
  const queue = createNodeConfigWrites({ a: { model_id: 'confirmed' } });
  await assert.rejects(queue.change('a', { model_id: 'rejected' }, () => { throw Error('save failed'); }));
  await queue.change('b', {}, () => {});
  assert.equal((await queue.flush()).a.model_id, 'confirmed');
  await queue.change('a', { agent_id: 'corrected' }, () => {});
  assert.equal((await queue.flush()).a.agent_id, 'corrected');
});
test('separate task queues cannot leak configuration across task switches', async () => {
  const a = createNodeConfigWrites({ a: {} }); const b = createNodeConfigWrites({ b: {} });
  await a.change('a', { agent_id: 'changed' }, () => {});
  assert.deepEqual(await b.flush(), { b: {} });
});
