import test from 'node:test';
import assert from 'node:assert/strict';

test('application owns one stream across view switches and snapshots replace stale state', async (t) => {
  const originalWindow = globalThis.window;
  const streams = [];

  globalThis.window = { haish: {
    onApprovalEvent(callback) {
      const stream = { callback, closed: false };
      streams.push(stream);
      return () => { stream.closed = true; };
    },
  } };
  t.after(() => {
    globalThis.window = originalWindow;
  });

  const { approvalStore } = await import('../../../src/features/approvals/model/approval-store.js');
  t.after(() => approvalStore.dispose());
  approvalStore.start();
  const unsubscribeState = approvalStore.subscribe(() => {});
  const unsubscribeEvents = approvalStore.subscribeInputs(() => {});

  assert.equal(streams.length, 1);
  unsubscribeState();
  assert.equal(streams[0].closed, false);
  unsubscribeEvents();
  assert.equal(streams[0].closed, false);

  const unsubscribeAgain = approvalStore.subscribeMode('conversation-a', () => {});
  assert.equal(streams.length, 1);
  unsubscribeAgain();
  let approvals, inputs, mode;
  approvalStore.subscribe(value => { approvals = value; });
  approvalStore.subscribeInputs(value => { inputs = value; });
  approvalStore.subscribeMode('conversation-a', value => { mode = value; });
  const emit = payload => streams[0].callback(payload);
  const state = { mode: 'smart', conversation_modes: { 'conversation-a': 'strict' }, pending: [{ request_id: 'a' }],
    pending_workflow_approvals: [], pending_browser_runtime_installs: [],
    pending_computer_runtime_installs: [{
      request_id: 'computer-snapshot', type: 'computer_runtime_install_required',
    }], pending_user_inputs: [{ request_id: 'q' }] };
  emit({ type: 'approval_snapshot', state });
  assert.deepEqual(approvals.map(item => item.request_id), ['a', 'computer-snapshot']);
  assert.equal(inputs.length, 1);
  assert.equal(mode, 'strict');
  emit({ type: 'input_resolved', request_id: 'q' });
  assert.equal(inputs.length, 0);
  emit({ type: 'input_requested', request_id: 'q2' });
  assert.equal(inputs[0].request_id, 'q2');
  emit({ type: 'computer_runtime_install_required', request_id: 'computer-live' });
  assert.deepEqual(approvals.map(item => item.request_id), ['a', 'computer-snapshot', 'computer-live']);
  emit({ type: 'computer_runtime_install_resolved', request_id: 'computer-live' });
  assert.deepEqual(approvals.map(item => item.request_id), ['a', 'computer-snapshot']);
  emit({ type: 'approval_snapshot', state: {
    ...state, pending: [], pending_computer_runtime_installs: [], pending_user_inputs: [],
  } });
  assert.deepEqual(approvals, []);
  assert.deepEqual(inputs, []);
  emit({ type: 'approval_mode_changed', conversation_id: 'conversation-a', mode: 'full' });
  assert.equal(mode, 'full');
  approvalStore.stop();
  assert.equal(streams[0].closed, true);
});
