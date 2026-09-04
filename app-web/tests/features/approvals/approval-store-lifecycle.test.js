import test from 'node:test';
import assert from 'node:assert/strict';

test('approval stream is shared and closes after the last subscriber leaves', async (t) => {
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
  const unsubscribeState = approvalStore.subscribe(() => {});
  const unsubscribeEvents = approvalStore.subscribeEvents(() => {});

  assert.equal(streams.length, 1);
  unsubscribeState();
  assert.equal(streams[0].closed, false);
  unsubscribeEvents();
  assert.equal(streams[0].closed, true);

  const unsubscribeAgain = approvalStore.subscribeEvents(() => {});
  assert.equal(streams.length, 2);
  unsubscribeAgain();
  assert.equal(streams[1].closed, true);
});
