import test from 'node:test';
import assert from 'node:assert/strict';

// workspace-state 在模块加载时读 localStorage，所以先给出最小 window 再动态 import。
globalThis.window = { localStorage: { getItem: () => null, setItem: () => {} } };
const { panelWorkspaceStateFor, visiblePanelWorkspaceStateFor } = await import(
  '../../../src/features/app/model/panel-workspace-state.js'
);

const project = (id, executionMode, conversations) => ({
  id, executionMode, name: id, type: 'custom', conversations,
});

const conversation = (id, executionMode, overrides = {}) => ({
  id, executionMode, name: id, tasks: [], updatedAt: 10, ...overrides,
});

test('panel projection merges live tasks into the open conversation only', () => {
  const workspaceState = {
    activeProjectId: 'p-bot',
    activeConversationId: 'c1',
    projects: [project('p-bot', 'bot', [
      conversation('c1', 'bot', { tasks: [{ taskId: 'old', status: 'done', updatedAt: 5 }] }),
      conversation('c2', 'bot'),
    ])],
  };
  const quests = [
    { taskId: 'old', status: 'running', updatedAt: 99 },
    { taskId: 'new', status: 'queued', createdAt: 50, updatedAt: 60 },
  ];

  const next = panelWorkspaceStateFor({ workspaceState, conversationId: 'c1', quests });
  const [open, other] = next.projects[0].conversations;

  assert.deepEqual(open.tasks.map((task) => task.taskId).sort(), ['new', 'old']);
  assert.equal(open.tasks.find((task) => task.taskId === 'old').status, 'running');
  assert.equal(open.updatedAt, 99, '会话时间戳取最新任务的时间');
  assert.equal(other.tasks.length, 0, '别的会话不受当前会话的实时任务影响');
  assert.equal(workspaceState.projects[0].conversations[0].tasks[0].status, 'done', '不改输入快照');
});

test('panel projection ignores tasks of other conversations entirely', () => {
  const workspaceState = {
    activeProjectId: 'p-bot',
    activeConversationId: 'c2',
    projects: [project('p-bot', 'bot', [conversation('c1', 'bot'), conversation('c2', 'bot')])],
  };
  const next = panelWorkspaceStateFor({
    workspaceState, conversationId: 'c1', quests: [{ taskId: 't', status: 'running', updatedAt: 7 }],
  });
  assert.equal(next.projects[0].conversations[1].tasks.length, 0);
  assert.equal(next.projects[0].conversations[1].updatedAt, 10);
});

test('mode projection hides the other mode and drops a mismatched selection', () => {
  const panelWorkspaceState = {
    activeProjectId: 'p-chat',
    activeConversationId: 'c-bot',
    projects: [
      project('p-chat', 'chat', [conversation('c-chat', 'chat'), conversation('c-mixed', 'chat')]),
      project('p-bot', 'bot', [conversation('c-bot', 'bot')]),
    ],
  };

  const chat = visiblePanelWorkspaceStateFor({ panelWorkspaceState, conversationId: 'c-bot', viewMode: 'chat' });
  assert.deepEqual(chat.projects.map((item) => item.id), ['p-chat']);
  assert.deepEqual(chat.projects[0].conversations.map((item) => item.id), ['c-chat', 'c-mixed']);
  // 当前会话属于另一个模式：侧边栏不能把它标成选中。
  assert.equal(chat.activeConversationId, null);

  const bot = visiblePanelWorkspaceStateFor({ panelWorkspaceState, conversationId: 'c-bot', viewMode: 'bot' });
  assert.deepEqual(bot.projects.map((item) => item.id), ['p-bot']);
  assert.equal(bot.activeConversationId, 'c-bot', '同一模式下的当前会话保持选中');
});

test('unknown view mode falls back to bot and never leaks chat projects', () => {
  const panelWorkspaceState = {
    activeProjectId: 'p-chat',
    activeConversationId: null,
    projects: [
      project('p-chat', 'chat', [conversation('c-chat', 'chat')]),
      project('p-bot', 'bot', [conversation('c-bot', 'bot')]),
    ],
  };
  const view = visiblePanelWorkspaceStateFor({ panelWorkspaceState, conversationId: '', viewMode: 'unknown' });
  assert.deepEqual(view.projects.map((item) => item.id), ['p-bot']);
});
