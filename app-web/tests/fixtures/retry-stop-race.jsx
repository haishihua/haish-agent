// Offline browser check through real Retry, Stop, stream and ChatPanel handlers.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { SchedulesContext } from '../../src/features/schedules/hooks/useSchedules.js';
import { createRunConfigSync } from '../../src/features/conversations/model/run-config-sync.js';
import { createConversationHandlers } from '../../src/features/conversations/hooks/createConversationHandlers.js';
import { createDeployHandlers } from '../../src/features/tasks/hooks/createDeployHandlers.js';
import { applyTerminalTaskState } from '../../src/features/tasks/model/task-runtime.js';
import { collapseFullTaskAttempts } from '../../src/features/chat/model/task-attempts.js';
import { createAttemptHarness } from './task-attempt-runtime.js';
import '../../styles.css';

const root = createRoot(document.getElementById('root'));
const report = document.getElementById('checks');
const checks = [];
function check(ok, label) {
  checks.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  report.textContent = checks.join('\n');
  if (!ok) throw new Error(label);
}
const sleep = () => new Promise((resolve) => setTimeout(resolve, 20));
async function until(predicate) {
  for (let index = 0; index < 200; index += 1) { if (predicate()) return; await sleep(); }
  throw new Error('Timed out waiting for Retry / Stop');
}
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
const errors = [];
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
window.addEventListener('error', (event) => errors.push(event.message));
const originalFetch = window.fetch;
window.fetch = (input, init) => {
  if (String(input).endsWith('/api/llm/models')) return Promise.resolve(Response.json({ provider: JSON.parse(init.body).provider,
    models: ['current-model'], default_model: 'current-model' }));
  if (String(input).includes('/api/approvals/state')) return Promise.resolve(Response.json({ mode: 'smart' }));
  if (String(input).includes('/api/')) return Promise.reject(new Error('Unexpected live API request'));
  return originalFetch(input, init);
};
const source = { taskId: 'source', conversationId: 'stop-fixture', userMessageId: 'user', title: 'Offline question',
  requestedProvider: 'current-provider', requestedModelId: 'current-model', executionMode: 'chat', originViewMode: 'chat',
  status: 'failed', error: 'Original upstream 503' };
const route = { llm_config_id: 'current-provider', model_id: 'current-model', reasoning_effort: 'high', agent_id: 'agent' };
const sync = createRunConfigSync({ get: async () => route, save: async (_id, config) => config });
const start = deferred();
const finish = deferred();
const cancel = deferred();
let onEvent;
const harness = createAttemptHarness(source, { transport: async (_command, callback) => {
  onEvent = callback;
  await start.promise;
  callback({ type: 'run_started', task_id: 'server-attempt', conversation_id: source.conversationId,
    source_task_id: source.taskId, user_message_id: source.userMessageId });
  await finish.promise;
} });
const runtime = harness.runtime;
const handlers = createConversationHandlers({ executeQuest: harness.executeQuest, configSync: sync,
  getRuntime: () => runtime, canStartDeployForConversation: () => true, showToast: () => {} });
let cancelCalls = 0;
let failCancel = false;
const stop = createDeployHandlers({ applyTerminalTaskState, conversationIdRef: { current: source.conversationId },
  draftConversationRef: { current: null }, getRuntime: () => runtime, mutateRuntime: (_id, update) => update(runtime),
  updateTaskRuntimeState: (update) => { runtime.taskRuntimeState = update(runtime.taskRuntimeState); },
  updateTaskById: (id, update) => { if (runtime.taskRuntimeState.tasksById[id]) runtime.taskRuntimeState.tasksById[id] = update(runtime.taskRuntimeState.tasksById[id]); },
  isTaskActuallyActive: (task) => ['running', 'queued'].includes(task.status), taskUpdatedTimestamp: () => 0,
  chatFinalizedTaskIdsRef: { current: new Set() }, userCancelledTaskIdsRef: { current: new Set() },
  cancelActiveConversationTask: () => {
    cancelCalls += 1;
    if (failCancel) return Promise.resolve(Response.json({}, { status: 500 }));
    return cancelCalls === 1 ? cancel.promise : Promise.resolve(Response.json({ cancelled: false, conversation_id: source.conversationId }));
  },
  recoverConversationTasks: async () => {}, flushRuntimeTasksToWorkspace: () => {}, setWorkspaceState: () => {},
});
function draw() {
  const state = runtime.taskRuntimeState;
  const tasks = collapseFullTaskAttempts(state.taskOrder.map((id) => state.tasksById[id]), state.pendingTask);
  if (state.pendingTask) tasks.push(state.pendingTask);
  const rows = tasks.flatMap((task) => [
    { id: `${task.taskId}-user`, taskId: task.taskId, role: 'user', status: task.status, text: task.title },
    { id: `${task.taskId}-agent`, taskId: task.taskId, role: 'agent', status: task.status, text: task.error || task.answerText || '', streaming: task.status === 'running', traceTimeline: [] },
  ]);
  flushSync(() => root.render(<AppTooltipProvider><SchedulesContext.Provider value={{ configSync: sync, currentConversationId: source.conversationId }}>
    <ChatPanel conversationId={source.conversationId} messages={rows} running={runtime.busy}
      latestTaskId={state.latestTaskId} taskActionsPending={Boolean(runtime.stopPromise || runtime.stopError)} submitPending={Boolean(runtime.stopPromise)}
      stopError={runtime.stopError || ''}
      providerOptions={[{ id: 'current-provider', provider: 'custom', modelOptions: ['current-model'] }]}
      agentOptions={[{ id: 'agent', label: 'Offline Agent' }]} defaultAgentId="agent"
      onStop={() => { const text = stop.handleStop(); draw(); return text; }}
      onRetryTask={(id, config) => handlers.handleRetryTask(state.tasksById[id], null, config)} />
  </SchedulesContext.Provider></AppTooltipProvider>));
}
async function run() {
  draw();
  await until(() => document.querySelector('.aui-error-state button'));
  await sleep(); await sleep(); await sleep();
  document.querySelector('.aui-error-state button').click();
  await until(() => harness.requests.length === 1);
  draw(); await sleep();
  document.querySelector('.chat-send.stop').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  check(cancelCalls === 1 && Boolean(runtime.stopPromise), 'real Stop starts one conversation-scoped reconciliation barrier');
  check(!document.querySelector('.aui-error-state'), 'early Stop never exposes the replaced failed bubble');
  start.resolve(); await sleep();
  onEvent({ type: 'llm_answer_delta', task_id: 'server-attempt', conversation_id: source.conversationId, text: 'LATE OUTPUT' });
  draw(); await sleep();
  check(runtime.taskRuntimeState.tasksById['server-attempt']?.status === 'cancelled', 'late startup preserves the real cancelled attempt');
  check(!document.body.textContent.includes('LATE OUTPUT'), 'late generated content stays suppressed');
  check(!document.querySelector('.aui-error-state') && document.querySelectorAll('.chat-message-row.user').length === 1, 'one replacement user turn stays visible without old Retry');
  check(!document.querySelector('[aria-label="Edit message"]') || document.querySelector('[aria-label="Edit message"]').disabled, 'task actions cannot bypass stopping');
  const barrier = runtime.stopPromise;
  cancel.resolve(Response.json({ cancelled: true, task_id: 'server-attempt', conversation_id: source.conversationId }));
  await sleep();
  check(runtime.stopPromise === barrier, 'cancel acknowledgement does not release the still-open stream');
  finish.resolve(); await barrier; draw(); await sleep();
  check(!runtime.stopPromise && !runtime.busy && runtime.taskRuntimeState.latestTaskId === 'server-attempt', 'settled state retains authoritative latest identity');
  // Simulate a second Stop whose cancellation fails after all task flags are idle.
  // The production composer must expose recovery without pretending a task is running.
  failCancel = true;
  stop.handleStop();
  await runtime.stopPromise;
  draw(); await sleep();
  check(!runtime.busy && Boolean(runtime.stopError), 'Stop failure is independent of task busy state');
  const errorCard = document.querySelector('.chat-composer .aui-error-state');
  check(errorCard?.textContent.includes('Stop not verified') && errorCard?.textContent.includes('Stop again'), 'the composer displays the failure with an explicit Stop again action');
  check(document.querySelector('.chat-send.stop[aria-label="Stop again"]'), 'the circle action remains a keyboard-accessible Stop retry instead of Send');
  const beforeSubmit = harness.requests.length;
  document.querySelector('.chat-composer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await sleep();
  check(harness.requests.length === beforeSubmit, 'form submission cannot bypass a failed Stop');
  check(!document.querySelector('[aria-label="Edit message"]') || document.querySelector('[aria-label="Edit message"]').disabled, 'edit remains blocked while Stop is unverified');
  failCancel = false;
  errorCard.querySelector('button').click();
  const retryBarrier = runtime.stopPromise;
  check(Boolean(retryBarrier) && cancelCalls === 3, 'the visible retry action starts another cancellation');
  await retryBarrier;
  draw(); await sleep();
  check(!runtime.stopError && !runtime.stopPromise && !document.querySelector('.chat-composer .aui-error-state'), 'successful reconciliation clears the error and releases actions');
  check(document.querySelector('button[aria-label="Send"]'), 'normal Send returns only after reconciliation succeeds');
  check(errors.length === 0, 'no page errors');
}
run().catch((error) => { checks.push(`FAIL ${error.message}`); report.textContent = checks.join('\n'); }).finally(() => {
  window.fetch = originalFetch;
  report.dataset.result = checks.some((line) => line.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
