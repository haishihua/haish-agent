import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkflowTaskSelectionHandler } from '../../../src/features/conversations/hooks/createWorkflowTaskSelectionHandler.js';
import { createDraftConversationHandlers } from '../../../src/features/conversations/hooks/createDraftConversationHandlers.js';
import { normalizeRuntimeEvents } from '../../../src/features/tasks/model/runtime-events.js';

globalThis.window = { HAISH_API_BASE: '', haish: {} };
const { taskDetailToRuntimeTask } = await import('../../../src/features/tasks/model/task-runtime.js');

const tick = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => {} } };
  const liveTask = {
    taskId: 'task', status: 'running', runtimeHydrated: true,
    workflowRun: { status: 'running', nodes: { live: { status: 'running' } } },
    toolCalls: [{ callId: 'live-tool', status: 'running' }],
    eventLog: [{ type: 'llm_answer_delta', delta: 'live answer' }],
  };
  let runtime = {
    runGeneration: 1, busy: true, shellSeeded: false,
    activeRunId: 'run', activeTaskId: 'task', fetchController: new AbortController(),
    answerBuffer: 'live answer',
    taskRuntimeState: { activeTaskId: 'task', taskOrder: ['task'], tasksById: { task: liveTask } },
  };
  const requests = [];
  const conversationIdRef = { current: 'conversation' };
  const ctx = {
    API_BASE: 'http://runtime', conversationIdRef,
    getRuntime: () => runtime,
    apiFetch: (url, options) => {
      const response = deferred();
      requests.push({ url, options, response });
      return response.promise;
    },
    buildApiHeaders: () => ({}),
    taskRuntimeEventCacheRef: { current: new Map() }, taskRuntimeFetchesRef: { current: new Map() },
    normalizeRuntimeEvents, taskDetailToRuntimeTask,
    isTaskActuallyActive: (task) => task.status === 'running',
    updateTaskRuntimeState: (update, owner) => {
      assert.equal(owner, 'conversation');
      runtime.taskRuntimeState = update(runtime.taskRuntimeState);
    },
    latestContextUsageFromTasks: () => null, applyContextUsage: () => {},
  };
  const drafts = createDraftConversationHandlers(ctx);
  const select = createWorkflowTaskSelectionHandler({
    ...ctx, ownerIdRef: { current: 'owner' },
    setTaskCompletionNotices: () => {}, setViewedWorkflowTask: () => {},
    handleSelectConversation: async () => {}, restoreLatestTaskRuntime: drafts.restoreLatestTaskRuntime,
    removeMissingTask: () => assert.fail('not missing'), showToast: () => {},
  });
  const respond = (taskId = 'task', status = 'done') => {
    const value = {
      task_id: taskId, conversation_id: 'conversation', status,
      events: [{ event_id: 'old', type: 'llm_answer_delta', payload: { delta: 'old answer' } }],
      workflow_run: { status: 'done' },
    };
    requests.at(-1).response.resolve({ ok: true, json: async () => requests.at(-1).options.method === 'POST' ? [value] : value });
  };
  return { drafts, select, requests, respond, liveTask, runtime: () => runtime, replace: (value) => { runtime = value; } };
}

test('selecting the locally streaming Workflow row preserves run, tools, events and answer buffer without GET', async () => {
  const h = harness();
  const runtime = h.runtime();
  await h.select('project', 'conversation', { taskId: 'task' });
  assert.equal(h.requests.length, 0);
  assert.equal(h.runtime(), runtime);
  assert.equal(runtime.taskRuntimeState.tasksById.task, h.liveTask);
  assert.equal(runtime.answerBuffer, 'live answer');
  assert.equal(runtime.activeRunId, 'run');
  assert.equal(runtime.fetchController.signal.aborted, false);
});

for (const kind of ['single', 'batch']) {
  for (const race of ['started-and-finished', 'live-started', 'runtime-replaced']) {
    test(`${kind} REST hydration cannot overwrite ${race} while its response is late`, async () => {
      const h = harness();
      const initial = h.runtime();
      initial.activeRunId = null;
      initial.fetchController = null;
      initial.busy = false;
      const restore = kind === 'single'
        ? h.select('project', 'conversation', { taskId: 'task' })
        : h.drafts.restoreTaskRuntimes(['task'], { targetConversationId: 'conversation', isCurrentActivation: () => true });
      await tick();
      assert.equal(h.requests.length, 1);
      if (race === 'runtime-replaced') h.replace({ ...initial, taskRuntimeState: { ...initial.taskRuntimeState } });
      else if (race === 'started-and-finished') initial.runGeneration += 1;
      else { initial.activeRunId = 'new-run'; initial.busy = true; }
      const expectedState = h.runtime().taskRuntimeState;
      h.respond();
      await restore;
      assert.equal(h.runtime().taskRuntimeState, expectedState);
      assert.equal(h.runtime().taskRuntimeState.tasksById.task, h.liveTask);
    });
  }
}

test('historical Workflow selection still hydrates without disturbing the current live turn', async () => {
  const h = harness();
  const selected = h.select('project', 'conversation', { taskId: 'history' });
  await tick();
  h.respond('history', 'running');
  await selected;
  assert.equal(h.runtime().taskRuntimeState.tasksById.history.runtimeHydrated, true);
  assert.equal(h.runtime().taskRuntimeState.tasksById.task, h.liveTask);
  assert.equal(h.runtime().taskRuntimeState.activeTaskId, 'task');
  assert.equal(h.runtime().answerBuffer, 'live answer');
});

test('a stale missing-task response cannot remove a task belonging to a newer generation', async () => {
  const h = harness();
  h.runtime().activeRunId = null;
  h.runtime().fetchController = null;
  h.runtime().busy = false;
  const selected = h.select('project', 'conversation', { taskId: 'task' });
  await tick();
  h.runtime().runGeneration += 1;
  h.requests[0].response.resolve({ ok: false, status: 404, json: async () => ({ detail: 'missing' }) });
  await selected;
  assert.equal(h.runtime().taskRuntimeState.tasksById.task, h.liveTask);
});
