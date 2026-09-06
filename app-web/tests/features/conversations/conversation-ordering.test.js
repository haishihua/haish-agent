import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationRuntime } from '../../../src/features/conversations/hooks/createConversationRuntime.js';

globalThis.window = {};
const { normalizeWorkspaceOrdering, conversationDetailToWorkspaceConversation, compactWorkspaceStateForStorage, loadStoredWorkspaceState } = await import('../../../src/features/conversations/model/workspace-state.js');
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

test('running work floats above idle work and completion keeps its actual latest position', () => {
  const idle = conversation('idle', RECENT);
  const running = conversation('running', OLD, { tasks: [{ status: 'running', updatedAt: OLD }] });
  const pinned = conversation('pinned', OLD, { pinned: true });
  assert.deepEqual(ids(workspace([idle, running, pinned])), ['pinned', 'running', 'idle']);
  const completed = { ...running, tasks: [{ status: 'completed', completedAt: COMPLETED }] };
  assert.deepEqual(ids(workspace([idle, completed, pinned])), ['pinned', 'running', 'idle']);
});
