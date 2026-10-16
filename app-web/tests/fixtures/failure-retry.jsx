// Real failure card, composer persistence, retry handler and stream projection.
// All model catalogs, settings, saves and task transport are synthetic/offline.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { SchedulesContext } from '../../src/features/schedules/hooks/useSchedules.js';
import { createRunConfigSync } from '../../src/features/conversations/model/run-config-sync.js';
import { createConversationHandlers } from '../../src/features/conversations/hooks/createConversationHandlers.js';
import { createConversationActivationHandlers } from '../../src/features/conversations/hooks/createConversationActivationHandlers.js';
import { sortTaskIdsForRestore, taskSummaryToRuntimeTask, taskDetailToRuntimeTask } from '../../src/features/tasks/model/task-runtime.js';
import { collapseFullTaskAttempts } from '../../src/features/chat/model/task-attempts.js';
import { createAttemptHarness } from './task-attempt-runtime.js';
import '../../styles.css';

const errors = [];
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
window.__pageErrors = errors;
const root = createRoot(document.getElementById('root'));
const report = document.getElementById('checks');
const checks = [];
function check(ok, label) {
  checks.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  report.textContent = checks.join('\n');
  if (!ok) throw new Error(label);
}
const sleep = () => new Promise(resolve => setTimeout(resolve, 20));
async function until(predicate) {
  for (let index = 0; index < 250; index += 1) {
    if (predicate()) return;
    await sleep();
  }
  throw new Error('Timed out waiting for Retry state');
}
const originalFetch = window.fetch;
let releaseCatalog;
const catalogs = [];
let catalogRequests = 0;
const firstCatalog = new Promise(resolve => { releaseCatalog = resolve; });
window.fetch = (input, init) => {
  if (String(input).includes('/api/')) {
    if (String(input).endsWith('/api/llm/models')) {
      const request = JSON.parse(init.body);
      catalogRequests += 1;
      catalogs.push(request.llm_config_id);
      const response = () => Response.json({ provider: request.provider, models: ['current-model'], default_model: 'current-model' });
      return catalogRequests === 1 ? firstCatalog.then(response) : Promise.resolve(response());
    }
    if (String(input).includes('/api/approvals/state')) return Promise.resolve(Response.json({ mode: 'smart' }));
    return Promise.reject(new Error('Unexpected API call in offline Retry fixture'));
  }
  return originalFetch(input, init);
};
const providers = [{ id: 'current-provider', provider: 'custom', label: 'Synthetic current route',
  defaultModelId: 'current-model', modelOptions: ['current-model'], defaultReasoningEffort: 'none' },
  { id: 'destination-provider', provider: 'custom', label: 'Destination route', defaultModelId: 'destination-model', modelOptions: ['destination-model'] }];
const source = { taskId: 'source', conversationId: 'retry-conversation', userMessageId: 'original-user',
  requestedProvider: 'old-provider', requestedModelId: 'old-model', requestedReasoningEffort: 'high',
  requestedAgentId: 'agent', title: 'Synthetic input', requestText: 'Synthetic input',
  status: 'failed', error: 'Synthetic original model failure', originViewMode: 'chat', executionMode: 'chat' };
const route = { llm_config_id: 'current-provider', model_id: 'current-model', reasoning_effort: 'xhigh',
  agent_id: 'agent', execution_mode: 'chat', use_history: true };
const destinationRoute = { ...route, llm_config_id: 'destination-provider', model_id: 'destination-model' };
const saved = new Map([[source.conversationId, route], ['destination', destinationRoute], ['blocked-conversation', { ...route, llm_config_id: 'removed-record' }]]);
const saves = [];
let releaseConfig;
let configReleased = false;
const configLoads = [];
const firstConfig = new Promise(resolve => { releaseConfig = resolve; });
const sync = createRunConfigSync({ get: async id => {
  configLoads.push(id);
  if (id === source.conversationId && !configReleased) await firstConfig;
  return structuredClone(saved.get(id));
}, save: async (id, config) => {
  saves.push({ id, config: structuredClone(config) });
  saved.set(id, structuredClone(config));
} });
let transportCount = 0;
let releaseStart;
const startup = new Promise(resolve => { releaseStart = resolve; });
let restoreStatus = 'failed';
const harness = createAttemptHarness(source, { transport: async (_command, onEvent) => {
  transportCount += 1;
  const id = `attempt-${transportCount}`;
  if (transportCount === 1) await startup;
  const start = { task_id: id, conversation_id: source.conversationId, user_message_id: source.userMessageId,
    source_task_id: transportCount === 1 ? source.taskId : `attempt-${transportCount - 1}` };
  onEvent({ ...start, type: 'run_started', message: source.title });
  if (transportCount === 1) throw new Error('Synthetic interrupted model stream');
  onEvent({ ...start, type: 'run_finished', status: 'done', task: { ...start, title: source.title, status: 'done', answer_text: 'Synthetic recovered reply' } });
} });
const toasts = [];
const serverRecord = id => ({ task_id: id, conversation_id: source.conversationId,
  user_message_id: source.userMessageId, title: source.title, status: restoreStatus,
  error: restoreStatus === 'failed' ? source.error : null, answer_text: restoreStatus === 'done' ? 'Recovered server answer' : '',
  execution_mode: 'chat', updated_at: '2026-01-01T00:00:00Z', events: [] });
const recovery = createConversationActivationHandlers({ getRuntime: () => harness.runtime, API_BASE: '',
  apiFetch: async () => {
    const id = harness.runtime.taskRuntimeState.latestTaskId || source.taskId;
    return Response.json({ conversation_id: source.conversationId, last_task_id: id, tasks: [serverRecord(id)] });
  },
  sortTaskIdsForRestore, taskSummaryToRuntimeTask,
  restoreTaskRuntimes: async (ids, options) => {
    if (!options.isCurrentActivation()) return;
    for (const id of ids) harness.runtime.taskRuntimeState.tasksById[id] = taskDetailToRuntimeTask(serverRecord(id));
  },
  updateTaskRuntimeState: update => { harness.runtime.taskRuntimeState = update(harness.runtime.taskRuntimeState); },
  mutateRuntime: (_id, update) => update(harness.runtime), isTaskActuallyActive: task => task.status === 'running',
  flushRuntimeTasksToWorkspace: () => {},
});
const handlers = createConversationHandlers({ executeQuest: harness.executeQuest,
  configSync: sync, getRuntime: () => harness.runtime, recoverConversationTasks: recovery.recoverConversationTasks,
  showToast: (kind, message) => toasts.push([kind, message]) });
function projectRows() {
  const state = harness.runtime.taskRuntimeState;
  const tasks = collapseFullTaskAttempts(state.taskOrder.map(id => state.tasksById[id]), state.pendingTask);
  return tasks.flatMap(task => [
    { id: `${task.taskId}-user`, taskId: task.taskId, role: 'user', status: task.status, text: task.title },
    { id: `${task.taskId}-agent`, taskId: task.taskId, role: 'agent', status: task.status,
      text: task.error || task.answerText, traceTimeline: [] },
  ]);
}
let displayedConversation;
function draw(conversationId = source.conversationId, rows = projectRows(), onRetryTask = (id, config) =>
  handlers.handleRetryTask(harness.runtime.taskRuntimeState.tasksById[id], null, config)) {
  displayedConversation = conversationId;
  flushSync(() => root.render(<AppTooltipProvider>
    <SchedulesContext.Provider value={{ configSync: sync, currentConversationId: conversationId }}>
      <ChatPanel key={conversationId} conversationId={conversationId} messages={rows} draft="Synthetic draft"
        running={conversationId === source.conversationId && harness.runtime.busy} onRetryTask={onRetryTask}
        retryPendingTaskId={conversationId === source.conversationId && harness.runtime.pendingRetry?.editedMessage === null ? harness.runtime.pendingRetry.sourceTaskId : null}
        taskActionsPending={conversationId === source.conversationId && Boolean(harness.runtime.pendingRetry)}
        providerOptions={providers} agentOptions={[{ id: 'agent', label: 'Synthetic Agent' }]}
        defaultAgentId="agent" />
    </SchedulesContext.Provider>
  </AppTooltipProvider>));
}
const retry = () => document.querySelector('.chat-message-row.agent .aui-error-state button');
async function run() {
  draw();
  await until(() => retry());
  check(!retry().disabled, 'latest failed turn has an enabled Retry even before configuration loads');
  const originalCard = retry().closest('.aui-error-state');
  const originalButton = retry();
  const originalHeight = originalCard.getBoundingClientRect().height;
  retry().click(); retry()?.click();
  await sleep(); await sleep(); await sleep();
  check(retry() === originalButton && originalCard === retry().closest('.aui-error-state')
    && retry().disabled && retry().getAttribute('aria-busy') === 'true' && harness.requests.length === 0,
    'Retry spins inside the existing button while configuration restores; repeated clicks send nothing');
  check(originalCard.textContent.includes(source.error) && originalCard.textContent.includes('Task failed')
    && originalCard.getBoundingClientRect().height === originalHeight && !document.querySelector('.aui-error-retrying'),
    'Retry keeps the original error and card height without a separate loading row');
  check(!document.querySelector('.aui-error-state').textContent.includes('not ready'), 'a slow configuration load does not reject the click');
  draw('destination', []);
  await sleep(); await sleep(); await sleep();
  check(Boolean(harness.runtime.pendingRetry) && harness.requests.length === 0, 'switching away and unmounting the composer does not cancel the original Retry');
  draw(); await sleep();
  check(retry().disabled && retry().getAttribute('aria-busy') === 'true', 'returning while Retry waits keeps the original button loading and cannot start a duplicate');
  draw('destination', []); await sleep();
  const originLoads = () => configLoads.filter(id => id === source.conversationId).length;
  const originCatalogs = () => catalogs.filter(id => id === route.llm_config_id).length;
  const loadsBeforeRelease = originLoads(), catalogsBeforeRelease = originCatalogs();
  configReleased = true;
  releaseConfig();
  await until(() => harness.requests.length === 1);
  check(originLoads() === loadsBeforeRelease && originCatalogs() === catalogsBeforeRelease, 'background waiting adds no originating configuration or catalog requests');
  draw(); await sleep();
  check(retry().getAttribute('aria-busy') === 'true' && retry().disabled, 'Retry remains loading on its original button until server confirmation');
  check(document.querySelector('.aui-error-detail')?.textContent.includes(source.error)
    && document.querySelectorAll('.chat-message-row.agent').length === 1,
    'Waiting for run_started keeps the original failed row, not a new loading attempt');
  draw('destination', []); await sleep();
  const loadsBeforeStart = originLoads(), catalogsBeforeStart = originCatalogs();
  releaseStart();
  await until(() => !harness.runtime.busy && !harness.runtime.pendingRetry);
  check(displayedConversation === 'destination' && document.querySelectorAll('.chat-message-row').length === 0, 'Retry finishes under the original conversation without switching the destination display');
  check(originLoads() === loadsBeforeStart && originCatalogs() === catalogsBeforeStart, 'background stream startup adds no originating configuration or catalog requests');
  releaseCatalog();
  draw(); await sleep();
  check(harness.requests.length === 1, 'double click starts exactly one attempt');
  const request = harness.requests[0];
  check(request.operation === 'rerun' && request.body.message === undefined, 'Retry sends rerun, not an edited or duplicated input');
  check(request.body.llm_config_id === route.llm_config_id && request.body.model_id === route.model_id
    && request.body.reasoning_effort === 'xhigh', 'Retry carries the current saved record, model and Xhigh, never the old route');
  check(source.requestedProvider === 'old-provider' && source.status === 'failed', 'original task remains unchanged');
  check(harness.runtime.taskRuntimeState.tasksById['attempt-1'].status === 'failed'
    && !harness.runtime.activeRunId && !harness.runtime.activeTaskId, 'interrupted confirmed attempt is failed and releases runtime ownership');
  check(document.querySelectorAll('.chat-message-row.agent .aui-error-state').length === 1
    && !document.querySelector('.chat-message-row.agent .aui-error-state.is-inline'), 'failure has one card, with no extra hint below it');
  check(document.querySelector('.aui-error-detail').textContent.includes('Synthetic interrupted model stream'), 'actual model error stays visible');
  check(!retry().disabled, 'Retry remains enabled after a stream failure');
  retry().click();
  await until(() => harness.requests.length === 2 && !harness.runtime.busy);
  draw(); await sleep();
  check(harness.runtime.taskRuntimeState.tasksById['attempt-2'].status === 'done', 'a second click retries the failed attempt successfully');
  check(document.querySelectorAll('.chat-message-row.agent').length === 1, 'successful retry replaces the failed turn without duplicating it');
  restoreStatus = 'done';
  harness.runtime.taskRuntimeState = { ...harness.runtime.taskRuntimeState,
    taskOrder: [source.taskId], latestTaskId: source.taskId, tasksById: { [source.taskId]: { ...source, error: 'Local runtime connection closed.' } } };
  draw(); await sleep();
  retry().click();
  await until(() => !harness.runtime.pendingRetry);
  draw(); await sleep();
  check(harness.requests.length === 2 && document.body.textContent.includes('Recovered server answer')
    && !document.querySelector('.chat-message-row.agent .aui-error-state'),
    'Retry of a connection-only failure restores the completed server answer without another run or eligibility error');
  check(!toasts.some(([, text]) => text.includes('not eligible')), 'State recovery does not emit the obsolete eligibility toast');
  const blocked = { id: 'blocked-agent', taskId: 'blocked', role: 'agent', status: 'failed', text: 'Synthetic original failure', traceTimeline: [] };
  let blockedRequests = 0;
  const blockedHandlers = createConversationHandlers({ getRuntime: () => harness.runtime, showToast: () => {},
    startDeploy: () => { blockedRequests += 1; } });
  draw('blocked-conversation', [blocked], (_id, config) => blockedHandlers.handleRetryTask({ taskId: 'blocked', conversationId: 'blocked-conversation', executionMode: 'chat' }, null, config));
  await sleep(); await sleep(); await sleep();
  retry().click();
  await until(() => document.querySelector('.aui-error-detail')?.textContent.includes('unavailable'));
  check(blockedRequests === 0 && !saves.some(call => call.id === 'blocked-conversation'), 'removed route rejects without sending or overwriting identity');
  check(saved.get('blocked-conversation').llm_config_id === 'removed-record', 'invalid identity is preserved, not replaced by the first route');
  check(document.querySelectorAll('.chat-message-row.agent .aui-error-state').length === 1
    && !document.querySelector('.chat-message-row.agent .aui-error-state.is-inline'), 'blocked Retry also adds no lower hint or second error card');
  check(document.querySelector('.aui-error-detail').textContent.includes('Synthetic original failure'), 'blocked Retry does not erase original model error');
  check(errors.length === 0, 'no page errors');
}
run().catch(error => {
  checks.push(`FAIL ${error.message}`);
  report.textContent = checks.join('\n');
}).finally(() => {
  window.fetch = originalFetch;
  report.dataset.result = checks.some(line => line.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
