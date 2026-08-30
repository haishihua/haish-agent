import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  conversationHasRunningTask,
  workflowTaskDisplayStatus,
} from '../panels/conversation-status.js';

globalThis.window = {
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};

const { projectWorkflowTasks } = await import('./workspace-state.js');
const projectNodeSource = fs.readFileSync(new URL('../panels/ProjectNode.jsx', import.meta.url), 'utf8');
const taskCardsSource = fs.readFileSync(new URL('../panels/ConversationTaskCards.jsx', import.meta.url), 'utf8');
const appShellSource = fs.readFileSync(new URL('../features/app/AppShell.jsx', import.meta.url), 'utf8');
const deployHandlersSource = fs.readFileSync(
  new URL('../features/app/hooks/createDeployHandlers.js', import.meta.url),
  'utf8',
);
const draftHandlersSource = fs.readFileSync(
  new URL('../features/app/hooks/createDraftConversationHandlers.js', import.meta.url),
  'utf8',
);
const streamHandlersSource = fs.readFileSync(
  new URL('../features/app/hooks/createTaskStreamHandlers.js', import.meta.url),
  'utf8',
);

test('workflow sidebar flattens conversation storage into newest-first task rows', () => {
  const entries = projectWorkflowTasks({
    conversations: [
      { id: 'conversation-a', tasks: [{ taskId: 'task-a', updatedAt: 10 }] },
      { id: 'conversation-b', tasks: [{ taskId: 'task-b', updatedAt: 20 }] },
      { id: 'conversation-pinned', pinned: true, tasks: [{ taskId: 'task-pinned', updatedAt: 1 }] },
      { id: 'empty', tasks: [] },
    ],
  });

  assert.deepEqual(entries.map(({ conversationId, task }) => [conversationId, task.taskId]), [
    ['conversation-pinned', 'task-pinned'],
    ['conversation-b', 'task-b'],
    ['conversation-a', 'task-a'],
  ]);
});

test('workflow task deletion targets the task instead of its shared conversation', () => {
  assert.match(projectNodeSource, /label="Delete task"/);
  assert.match(projectNodeSource, /onRequestDeleteTask\?\.\(project, conversation, task\)/);
  assert.doesNotMatch(projectNodeSource, /label="Delete conversation"[\s\S]*?onRequestDeleteConversation\?\.\(project, conversation\)/);
  assert.match(appShellSource, /\/api\/tasks\/\$\{encodeURIComponent\(taskId\)\}/);
  assert.match(appShellSource, /delete tasksById\[taskId\]/);
  assert.match(appShellSource, /filter\(\(id\) => id !== taskId\)/);
});

test('running workflow tasks remain selectable and show activity', () => {
  assert.match(appShellSource, /viewedWorkflowTask/);
  assert.match(appShellSource, /return runtimeCurrentTask/);
  assert.match(taskCardsSource, /!showStatusIcon && \['running', 'queued', 'approval', 'waiting_input'\]\.includes\(status\)/);
  assert.match(taskCardsSource, /<TaskStatusIcon statusClass=\{pill\.className\} \/>/);
});

test('workflow wait states do not look like active agent execution', () => {
  const approvalTask = { status: 'running', workflowRun: { status: 'waiting_approval' } };
  const inputTask = { status: 'running', workflowRun: { status: 'waiting_input' } };
  const cancelledTask = { status: 'running', workflowRun: { status: 'cancelled' } };

  assert.equal(workflowTaskDisplayStatus(approvalTask), 'approval');
  assert.equal(workflowTaskDisplayStatus(inputTask), 'waiting_input');
  assert.equal(workflowTaskDisplayStatus(cancelledTask), 'cancelled');
  assert.equal(conversationHasRunningTask({ tasks: [approvalTask] }), false);
  assert.equal(conversationHasRunningTask({ tasks: [inputTask] }), false);
  assert.equal(conversationHasRunningTask({ tasks: [cancelledTask] }), false);
});

test('failed task creation cannot leave a restorable local-only task', () => {
  assert.match(deployHandlersSource, /activeTaskIdBeforeDeploy/);
  assert.match(deployHandlersSource, /currentActiveTaskId !== activeTaskIdBeforeDeploy/);
  assert.match(deployHandlersSource, /removeConversationTaskFromWorkspace\(deployConvId, pendingTaskId\)/);
  assert.match(deployHandlersSource, /showToast\('error', errorMessage\)/);
});

test('first draft send is visible before server conversation materialization', () => {
  assert.match(deployHandlersSource, /stagePendingDeploy\(request, draftConversationId\)/);
  assert.match(deployHandlersSource, /pendingTask\.requestText = request\.text/);
  assert.match(deployHandlersSource, /function failPendingDeploy\(request, error\)/);
  assert.match(streamHandlersSource, /message: pendingTask\.requestText \|\| pendingTask\.title/);
});

test('missing restored tasks are removed and stream errors retain backend detail', () => {
  assert.match(draftHandlersSource, /error\.status = response\.status/);
  assert.match(appShellSource, /if \(error\?\.status === 404\) \{[\s\S]*?removeMissingTask/);
  assert.match(appShellSource, /function removeMissingTask\([\s\S]*?taskRuntimeEventCacheRef\.current\.delete\(taskId\)/);
  assert.match(streamHandlersSource, /payload\?\.detail[\s\S]*?task stream failed/);
});
