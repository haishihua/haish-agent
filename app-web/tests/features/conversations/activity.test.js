import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {};
const { activityEntries, filterActivityEntries, ACTIVITY_PAGE_SIZE } = await import('../../../src/features/conversations/model/activity.js');
const { buildWorkspaceStateFromProjects } = await import('../../../src/features/conversations/model/workspace-state.js');
const { taskSummaryToRuntimeTask } = await import('../../../src/core/task-runtime.js');

const project = (id, mode, tasks) => ({ id, name: id, executionMode: mode, conversations: [{ id: `c-${id}`, name: `Conversation ${id}`, tasks }] });

test('chat activity groups terminal tasks by conversation and puts live work before idle work', () => {
  const projects = [
    project('a', 'chat', [
      { taskId: 'done', status: 'done', completedAt: 100, updatedAt: 500 },
      { taskId: 'running', status: 'running', updatedAt: 999 },
      { taskId: 'failed', status: 'failed', completedAt: 300 },
    ]),
    project('b', 'chat', [{ taskId: 'cancelled', status: 'cancelled', completedAt: 200 }]),
    project('c', 'chat', [{ taskId: 'running-only', status: 'running', updatedAt: 1000 }]),
    project('d', 'bot', [{ taskId: 'bot', status: 'done', completedAt: 400 }]),
  ];
  const entries = activityEntries(projects, { 'c-a:done': { status: 'done' } }, 'chat');
  assert.deepEqual(entries.map((entry) => entry.conversation.name), ['Conversation a', 'Conversation c', 'Conversation b']);
  assert.deepEqual(entries.map((entry) => entry.taskId), ['failed', '', 'cancelled']);
  assert.deepEqual(entries.map((entry) => entry.unread), [true, false, false]);
  assert.equal(ACTIVITY_PAGE_SIZE, 20);
  assert.equal(activityEntries(projects, {}, 'chat').length, 3);
  assert.equal(activityEntries(projects, {}, 'chat')[0].unread, false);
});

test('workflow activity preserves separate tasks including running work and excludes chat', () => {
  const projects = [
    project('a', 'chat', [{ taskId: 'chat', status: 'done', completedAt: 900 }]),
    project('b', 'bot', [
      { taskId: 'old', status: 'done', completedAt: 100 },
      { taskId: 'new', status: 'failed', completedAt: 300 },
      { taskId: 'marker', status: 'running', completedAt: 200 },
      { taskId: 'running', status: 'running', updatedAt: 500 },
    ]),
  ];
  const entries = activityEntries(projects, { 'c-b:old': { status: 'done' } }, 'bot');
  assert.deepEqual(entries.map((entry) => entry.taskId), ['running', 'new', 'marker', 'old']);
  assert.deepEqual(entries.map((entry) => entry.unread), [false, false, false, true]);
});

test('activity overlays workspace pins, live runtime and selected empty conversations', () => {
  const history = [project('a', 'chat', [{ taskId: 'a', status: 'done', completedAt: 300 }]),
    project('b', 'chat', [{ taskId: 'b', status: 'done', completedAt: 100 }])];
  const workspace = [project('a', 'chat', [{ taskId: 'a', status: 'done', completedAt: 300 },
    { taskId: 'live', status: 'running', createdAt: 400 }]),
  { ...project('b', 'chat', []), conversations: [{ id: 'c-b', name: 'Conversation b', pinned: true, tasks: [] }] },
  project('c', 'chat', [{ taskId: 'first', status: 'running', createdAt: 500 }]),
  project('d', 'chat', [])];
  const entries = activityEntries(history, {}, 'chat', workspace, 'c-d');
  assert.deepEqual(entries.map((entry) => entry.conversation.id), ['c-b', 'c-c', 'c-a', 'c-d']);
  assert.equal(entries[2].taskId, 'a');
  assert.equal(entries[2].conversation.tasks.at(-1).taskId, 'live');
  assert.equal(entries[1].task, null);
  assert.equal(entries[3].task, null);
  workspace[1].conversations[0].pinned = false;
  assert.deepEqual(activityEntries(history, {}, 'chat', workspace, 'c-d').map((entry) => entry.conversation.id),
    ['c-c', 'c-a', 'c-b', 'c-d']);
});

test('chat activity shares sidebar ordering across pins, live transitions, and stream updates', () => {
  const conversation = (id, tasks, extra = {}) => ({ id, name: id, tasks, ...extra });
  const done = (id, at) => ({ taskId: id, status: 'done', completedAt: at, updatedAt: at });
  const live = (id, at) => ({ taskId: id, status: 'running', createdAt: at, updatedAt: at });
  const conversations = [
    conversation('idle-new', [done('idle', 900)]),
    conversation('live-old', [done('old-done', 100), live('old-live', 200)]),
    conversation('live-new', [live('new-live', 300)]),
    conversation('pinned-idle', [done('pinned', 50)], { pinned: true }),
  ];
  const history = [{ id: 'p', name: 'project', executionMode: 'chat', conversations }];
  const ids = () => activityEntries(history, {}, 'chat').map((entry) => entry.conversation.id);
  assert.deepEqual(ids(), ['pinned-idle', 'live-new', 'live-old', 'idle-new']);
  conversations[1].tasks[1].updatedAt = 2000;
  assert.deepEqual(ids(), ['pinned-idle', 'live-new', 'live-old', 'idle-new']);
  conversations[2].tasks[0] = done('new-live', 400);
  assert.deepEqual(ids(), ['pinned-idle', 'live-old', 'idle-new', 'live-new']);
  conversations[0].tasks.push(live('fresh', 1000));
  assert.deepEqual(ids(), ['pinned-idle', 'idle-new', 'live-old', 'live-new']);
  conversations[3].pinned = false;
  assert.deepEqual(ids(), ['idle-new', 'live-old', 'live-new', 'pinned-idle']);
});

test('activity search matches the current mode title and project across the whole history', () => {
  const projects = [
    project('Alpha', 'chat', [{ taskId: '1', title: 'Secret task', status: 'done', completedAt: 100 }]),
    project('Beta', 'bot', [{ taskId: '2', title: 'Workflow report', status: 'done', completedAt: 200 }]),
  ];
  const chat = activityEntries(projects, {}, 'chat');
  const bot = activityEntries(projects, {}, 'bot');
  assert.equal(filterActivityEntries(chat, '  CONVERSATION ALPHA ', 'chat').length, 1);
  assert.equal(filterActivityEntries(chat, 'secret task', 'chat').length, 0);
  assert.equal(filterActivityEntries(chat, 'alpha', 'chat').length, 1);
  assert.equal(filterActivityEntries(bot, 'REPORT', 'bot').length, 1);
  assert.equal(filterActivityEntries(bot, 'alpha', 'bot').length, 0);
  assert.equal(filterActivityEntries(bot, '  ', 'bot'), bot);
});

test('project projection retains tasks in each mode for activity', () => {
  const task = (id, mode, date) => ({ task_id: id, conversation_id: `c-${mode}`, execution_mode: mode,
    title: id, status: 'done', created_at: date, updated_at: date, completed_at: date });
  const chat = task('chat-task', 'chat', '2025-01-01T00:00:00Z');
  const bot = task('bot-task', 'bot', '2026-01-01T00:00:00Z');
  const state = buildWorkspaceStateFromProjects([
    { project_id: 'p-chat', name: 'Chat', execution_mode: 'chat', conversations: [{ conversation_id: 'c-chat', execution_mode: 'chat', title: 'Chat conversation', tasks: [chat] }] },
    { project_id: 'p-bot', name: 'Bot', execution_mode: 'bot', conversations: [{ conversation_id: 'c-bot', execution_mode: 'bot' }], tasks: [bot] },
  ], undefined, taskSummaryToRuntimeTask);
  assert.deepEqual(activityEntries(state.projects, {}, 'chat').map((entry) => entry.conversation.name), ['Chat conversation']);
  assert.deepEqual(activityEntries(state.projects, {}, 'bot').map((entry) => entry.taskId), ['bot-task']);
});
