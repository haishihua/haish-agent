import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationRuntime } from '../../../src/features/conversations/hooks/createConversationRuntime.js';

globalThis.window = {};
const {
  normalizeWorkspaceOrdering,
  conversationDetailToWorkspaceConversation,
  compactWorkspaceStateForStorage,
  loadStoredWorkspaceState,
  workspaceStateWithConversationRuntimeTask,
  workspaceStateWithTouchedConversation,
} = await import('../../../src/features/conversations/model/workspace-state.js');
const OLD = 1000;
const RECENT = 2000;
const DRAGGED = 3000;
const COMPLETED = 4000;
const conversation = (id, updatedAt, extra = {}) => ({ id, updatedAt, tasks: [], ...extra });
const workspace = (conversations) => ({ projects: [{ id: 'project', conversations }] });
const ids = (state) => normalizeWorkspaceOrdering(state).projects[0].conversations.map((item) => item.id);

test('switch-time runtime flush does not turn viewing into activity', () => {
  let state = workspace([conversation('old', OLD), conversation('recent', RECENT)]);
  const runtime = createConversationRuntime({
    runtimesRef: { current: new Map([['old', { taskRuntimeState: { taskOrder: [], tasksById: {} } }]]) },
    normalizeWorkspaceOrdering,
    setWorkspaceState: (update) => { state = update(state); },
  });
  runtime.flushRuntimeTasksToWorkspace('old');
  runtime.flushRuntimeTasksToWorkspace('old');
  assert.deepEqual(ids(state), ['recent', 'old']);
  assert.equal(state.projects[0].conversations.find((item) => item.id === 'old').updatedAt, OLD);
});

test('manual order survives normalization and directory hydration until real activity', () => {
  const old = conversation('old', OLD, { manualOrderAt: DRAGGED, sortOrder: 0 });
  const recent = conversation('recent', RECENT, { manualOrderAt: DRAGGED, sortOrder: 1 });
  assert.deepEqual(ids(workspace([recent, old])), ['old', 'recent']);
  const hydrated = conversationDetailToWorkspaceConversation({
    conversation_id: old.id, updated_at: OLD, sort_order: 0, execution_mode: 'chat',
  }, old);
  assert.deepEqual(ids(workspace([recent, hydrated])), ['old', 'recent']);
  assert.deepEqual(ids(workspace([hydrated, { ...recent, updatedAt: COMPLETED }])), ['recent', 'old']);
});

test('manual ordering marker survives local storage without replacing backend ranks', () => {
  const state = workspace([conversation('old', OLD, { executionMode: 'chat', manualOrderAt: DRAGGED })]);
  state.projects[0].executionMode = 'chat';
  globalThis.window.localStorage = { getItem: () => JSON.stringify(compactWorkspaceStateForStorage(state)) };
  const restored = loadStoredWorkspaceState('test-owner');
  assert.equal(restored.projects[0].conversations[0].manualOrderAt, DRAGGED);
});

test('streaming a running task never reshuffles concurrently running conversations', () => {
  const startedA = 10_000;
  const startedB = 11_000;
  let state = workspace([
    conversation('a', startedA, { tasks: [{ taskId: 'a1', status: 'running', createdAt: startedA, updatedAt: startedA }] }),
    conversation('b', startedB, { tasks: [{ taskId: 'b1', status: 'running', createdAt: startedB, updatedAt: startedB }] }),
    conversation('idle', 500),
  ]);
  assert.deepEqual(ids(state), ['b', 'a', 'idle']);
  // Every streamed chunk and every runtime poll rewrites the task's own
  // timestamps; none of that may move the row.
  for (let tick = 1; tick <= 5; tick += 1) {
    state = workspaceStateWithConversationRuntimeTask(state, 'a', {
      taskId: 'a1',
      status: 'running',
      createdAt: startedA,
      updatedAt: startedA + tick * 1_000,
      answerText: `chunk ${tick}`,
    });
    assert.deepEqual(ids(state), ['b', 'a', 'idle']);
  }
  // Polling the other conversation must not drag it above either.
  state = workspaceStateWithConversationRuntimeTask(state, 'b', {
    taskId: 'b1', status: 'running', createdAt: startedB, updatedAt: 999_999,
  });
  assert.deepEqual(ids(state), ['b', 'a', 'idle']);
});

test('a send floats its conversation up once, then the order freezes until the next send', () => {
  const first = 5_000;
  const second = 6_000;
  const sendAt = 50_000;
  const settled = (taskId, at) => ({ taskId, status: 'done', createdAt: at, updatedAt: at, completedAt: at });
  let state = workspace([
    conversation('a', first, { tasks: [settled('a1', first)] }),
    conversation('b', second, { tasks: [settled('b1', second)] }),
  ]);
  assert.deepEqual(ids(state), ['b', 'a']);

  state = workspaceStateWithTouchedConversation(state, 'a', {
    tasks: [settled('a1', first), { taskId: 'a2', status: 'queued', createdAt: sendAt, updatedAt: sendAt }],
  });
  assert.deepEqual(ids(state), ['a', 'b']);

  // The run's own progress (chunks on 'a', a late poll on 'b') leaves both rows alone.
  for (let tick = 1; tick <= 4; tick += 1) {
    state = workspaceStateWithConversationRuntimeTask(state, 'a', {
      taskId: 'a2', status: 'running', createdAt: sendAt, updatedAt: sendAt + tick * 1_000,
    });
    state = workspaceStateWithConversationRuntimeTask(state, 'b', {
      ...settled('b1', second), updatedAt: second + tick * 1_000, completedAt: second + tick * 1_000,
    });
    assert.deepEqual(ids(state), ['a', 'b']);
  }
});

test('completion settles a row in place instead of following every stream tick', () => {
  const started = 20_000;
  let state = workspace([
    conversation('running', 30_000, { tasks: [{ taskId: 'r1', status: 'running', createdAt: 30_000, updatedAt: 30_000 }] }),
    conversation('finishing', 21_000, { tasks: [{ taskId: 'f1', status: 'running', createdAt: started, updatedAt: started }] }),
    conversation('idle', 1_000),
  ]);
  assert.deepEqual(ids(state), ['running', 'finishing', 'idle']);
  state = workspaceStateWithConversationRuntimeTask(state, 'finishing', {
    taskId: 'f1', status: 'done', createdAt: started, updatedAt: 40_000, completedAt: 40_000, serverFinished: true,
  });
  assert.deepEqual(ids(state), ['running', 'finishing', 'idle']);
});

test('running work floats above idle work and completion keeps its actual latest position', () => {
  const idle = conversation('idle', RECENT);
  const running = conversation('running', OLD, { tasks: [{ status: 'running', updatedAt: OLD }] });
  const pinned = conversation('pinned', OLD, { pinned: true });
  assert.deepEqual(ids(workspace([idle, running, pinned])), ['pinned', 'running', 'idle']);
  const completed = { ...running, tasks: [{ status: 'completed', completedAt: COMPLETED }] };
  assert.deepEqual(ids(workspace([idle, completed, pinned])), ['pinned', 'running', 'idle']);
});
