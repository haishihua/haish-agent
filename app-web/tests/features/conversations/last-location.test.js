import test from 'node:test';
import assert from 'node:assert/strict';
import { readLastLocation, saveLastLocation, resolveStoredWorkflowTask } from '../../../src/features/conversations/model/last-location.js';

test('restart restores a workflow selection using only project and task IDs', () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveLastLocation(storage, 'owner', 'workflow', { projectId: 'p', taskId: 'older-task', conversationId: 'stale-link' });
  const location = readLastLocation(storage, 'owner');
  assert.deepEqual(location, { mode: 'workflow', workflowTask: { projectId: 'p', taskId: 'older-task' } });
  assert.equal(readLastLocation(storage, 'other-owner'), null);
  const state = { projects: [{ id: 'p', executionMode: 'bot', conversations: [{ id: 'current-link', tasks: [{ taskId: 'newer-task' }, { taskId: 'older-task' }] }] }] };
  assert.deepEqual(resolveStoredWorkflowTask(state, location), { projectId: 'p', taskId: 'older-task', conversationId: 'current-link' });
  assert.equal(resolveStoredWorkflowTask({ projects: [] }, location), null);
  state.projects[0].conversations[0].tasks = [];
  assert.equal(resolveStoredWorkflowTask(state, location), null);
});

test('malformed storage and cleared selection are safe', () => {
  assert.equal(readLastLocation({ getItem: () => '{broken' }, 'owner'), null);
  const values = new Map();
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  saveLastLocation(storage, 'owner', 'chat', null);
  assert.deepEqual(readLastLocation(storage, 'owner'), { mode: 'chat', workflowTask: null });
});
