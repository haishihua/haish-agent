import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useConversationEventRecovery } from '../../src/features/app/hooks/useConversationEventRecovery.js';

window.IS_REACT_ACT_ENVIRONMENT = true;
const listeners = new Set();
const calls = [];
let subscriptions = 0;
let cleanups = 0;
window.haish = {
  onConversationEvent(listener) {
    subscriptions += 1;
    listeners.add(listener);
    return () => { cleanups += 1; listeners.delete(listener); };
  },
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const event = { type: 'conversation.updated', conversation: { conversation_id: 'a' } };
function Probe({ version }) {
  useConversationEventRecovery({
    ensureConversationRuntime: id => calls.push(`ensure:${version}:${id}`),
    recoverConversationTasks: async id => calls.push(`recover:${version}:${id}`),
  });
  return null;
}
const root = createRoot(document.getElementById('root'));
try {
  await act(async () => root.render(<React.StrictMode><Probe version="old" /></React.StrictMode>));
  assert(listeners.size === 1, 'StrictMode must leave exactly one subscription');
  await act(async () => { for (const listener of listeners) listener(event); });
  assert(calls.join(',') === 'ensure:old:a,recover:old:a', 'Initial recovery order');
  await act(async () => root.render(<React.StrictMode><Probe version="new" /></React.StrictMode>));
  assert(listeners.size === 1, 'Handler replacement must not leak listeners');
  calls.length = 0;
  await act(async () => { for (const listener of listeners) listener(event); });
  assert(calls.join(',') === 'ensure:new:a,recover:new:a', 'Recovery must use committed handlers');
  await act(async () => root.unmount());
  assert(listeners.size === 0 && subscriptions === cleanups, 'Unmount must release every subscription');
  document.getElementById('result').textContent = 'PASS: conversation subscription lifecycle';
} catch (error) {
  document.getElementById('result').textContent = `FAIL: ${error.stack || error}`;
}
