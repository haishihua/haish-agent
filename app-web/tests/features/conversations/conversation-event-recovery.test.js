import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleHookHarness } from '../schedules/hook-harness.js';

const path = '../../../src/features/app/hooks/useConversationEventRecovery.js';

function setup(props, haish) {
  return scheduleHookHarness(path, 'useConversationEventRecovery', props, { window: { haish } });
}

test('conversation updates initialize runtime before recovery and ignore unrelated events', async () => {
  let listener;
  const calls = [];
  const harness = setup({
    ensureConversationRuntime: id => calls.push(['ensure', id]),
    recoverConversationTasks: async id => calls.push(['recover', id]),
  }, { onConversationEvent: callback => { listener = callback; return () => {}; } });
  listener(null);
  listener({ type: 'other', conversation: { conversation_id: 'a' } });
  listener({ type: 'conversation.updated', conversation: {} });
  assert.deepEqual(calls, []);
  listener({ type: 'conversation.updated', conversation: { conversation_id: 'a' } });
  await harness.settle();
  assert.deepEqual(calls, [['ensure', 'a'], ['recover', 'a']]);
  harness.unmount();
});

test('handler replacement unsubscribes the old listener and unmount releases the new one', () => {
  const listeners = new Set();
  const calls = [];
  const ensureConversationRuntime = () => {};
  const harness = setup({ ensureConversationRuntime, recoverConversationTasks: async () => calls.push('old') }, {
    onConversationEvent(callback) {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  });
  const oldListener = [...listeners][0];
  harness.update({ recoverConversationTasks: async () => calls.push('new') });
  assert.equal(listeners.size, 1);
  assert.equal(listeners.has(oldListener), false);
  [...listeners][0]({ type: 'conversation.updated', conversation: { conversation_id: 'a' } });
  assert.deepEqual(calls, ['new']);
  harness.unmount();
  assert.equal(listeners.size, 0);
});

test('conversation event recovery tolerates an unavailable desktop bridge', () => {
  const harness = setup({ ensureConversationRuntime() {}, recoverConversationTasks: async () => {} });
  harness.unmount();
});
