import test from 'node:test';
import assert from 'node:assert/strict';
import { approvalStore } from '../../../src/features/approvals/model/approval-store.js';

test('mode updates and reconnect snapshots keep each conversation independent', t => {
  const originalWindow = globalThis.window;
  let emit;
  globalThis.window = { haish: {
    onApprovalEvent(callback) { emit = callback; return () => {}; },
  } };
  t.after(() => { approvalStore.dispose(); globalThis.window = originalWindow; });
  approvalStore.start();
  let a, b;
  approvalStore.subscribeMode('a', value => { a = value; });
  approvalStore.subscribeMode('b', value => { b = value; });
  assert.equal(a, null);
  assert.equal(b, null);
  approvalStore.setMode('a', 'smart');
  approvalStore.setMode('b', 'full');
  emit({ type: 'approval_mode_changed', conversation_id: 'a', mode: 'strict' });
  assert.equal(a, 'strict');
  assert.equal(b, 'full');
  emit({ type: 'approval_mode_changed', mode: 'smart' });
  assert.equal(a, 'strict');
  assert.equal(b, 'full');
  emit({ type: 'approval_snapshot', state: {
    mode: 'smart', conversation_modes: { a: 'smart', b: 'full' }, pending: [], pending_user_inputs: [],
  } });
  assert.equal(a, 'smart');
  assert.equal(b, 'full');
  const seen = [];
  const stop = approvalStore.subscribeMode('a', value => seen.push(value));
  stop();
  emit({ type: 'approval_mode_changed', conversation_id: 'a', mode: 'full' });
  assert.deepEqual(seen, ['smart']);
});
