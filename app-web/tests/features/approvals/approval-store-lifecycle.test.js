import test from 'node:test';
import assert from 'node:assert/strict';

test('application owns one stream across view switches and snapshots replace stale state', async (t) => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const originalEventSource = globalThis.EventSource;
  const streams = [];

  globalThis.window = {};
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ pending: [] }) });
  globalThis.EventSource = class {
    constructor(url) {
      this.url = url;
      this.closed = false;
      streams.push(this);
    }

    close() {
      this.closed = true;
    }
  };
  t.after(() => {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    globalThis.EventSource = originalEventSource;
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

  const unsubscribeAgain = approvalStore.subscribeMode(() => {});
  assert.equal(streams.length, 1);
  unsubscribeAgain();
  let approvals, inputs, mode;
  approvalStore.subscribe(value => { approvals = value; });
  approvalStore.subscribeInputs(value => { inputs = value; });
  approvalStore.subscribeMode(value => { mode = value; });
  const emit = payload => streams[0].onmessage({ data: JSON.stringify(payload) });
  const state = { mode: 'strict', pending: [{ request_id: 'a' }],
    pending_workflow_approvals: [], pending_browser_runtime_installs: [],
    pending_user_inputs: [{ request_id: 'q' }] };
  emit({ type: 'approval_snapshot', state });
  assert.equal(approvals.length, 1);
  assert.equal(inputs.length, 1);
  assert.equal(mode, 'strict');
  emit({ type: 'input_resolved', request_id: 'q' });
  assert.equal(inputs.length, 0);
  emit({ type: 'input_requested', request_id: 'q2' });
  assert.equal(inputs[0].request_id, 'q2');
  emit({ type: 'approval_snapshot', state: { ...state, pending: [], pending_user_inputs: [] } });
  assert.deepEqual(approvals, []);
  assert.deepEqual(inputs, []);
  emit({ type: 'approval_mode_changed', mode: 'full' });
  assert.equal(mode, 'full');
  approvalStore.stop();
  assert.equal(streams[0].closed, true);
});
