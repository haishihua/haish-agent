import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  conversationHasRunningTask,
  workflowTaskDisplayStatus,
} from '../../src/features/conversations/model/conversation-status.js';

globalThis.window = {
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};

const {
  buildWorkspaceStateFromProjects,
  projectWorkflowTasks,
  withDefaultExpansion,
} = await import('../../src/features/conversations/model/workspace-state.js');
const projectNodeSource = fs.readFileSync(new URL('../../src/features/conversations/components/ProjectNode.jsx', import.meta.url), 'utf8');
const taskCardsSource = fs.readFileSync(new URL('../../src/features/conversations/components/ConversationTaskCards.jsx', import.meta.url), 'utf8');
const appShellSource = fs.readFileSync(new URL('../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
const deployHandlersSource = fs.readFileSync(
  new URL('../../src/features/tasks/hooks/createDeployHandlers.js', import.meta.url),
  'utf8',
);
const streamHandlersSource = fs.readFileSync(
  new URL('../../src/features/tasks/hooks/createTaskStreamHandlers.js', import.meta.url),
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

test('workflow projects reveal a three-task preview until the user collapses them', () => {
  assert.equal(withDefaultExpansion({ executionMode: 'bot', conversations: [] }).expanded, true);
  assert.equal(withDefaultExpansion({ executionMode: 'bot', userExpanded: false, conversations: [] }).expanded, false);
  assert.match(appShellSource, /taskPreviewLimit=\{3\}/);
  assert.match(projectNodeSource, /allWorkflowTasks\.slice\(0, taskLimit\)/);
  assert.match(projectNodeSource, /Show \$\{workflowTaskMode \? hiddenWorkflowTaskCount : hiddenConversationCount\} more/);
});

test('project directory maps bot project tasks without exposing bot conversations in the sidebar', () => {
  const state = buildWorkspaceStateFromProjects(
    [{
      project_id: 'bot-project',
      execution_mode: 'bot',
      name: 'Bot project',
      conversations: [{
        conversation_id: 'bot-runtime-conversation',
        project_id: 'bot-project',
        execution_mode: 'bot',
        title: 'Internal runtime',
        label: 'Internal runtime',
        tasks: [],
      }],
      tasks: [{
        task_id: 'bot-task',
        conversation_id: 'bot-runtime-conversation',
        execution_mode: 'bot',
        title: 'Visible task',
        status: 'done',
        stage: 'done',
        created_at: '2026-09-02T00:00:00Z',
        updated_at: '2026-09-02T00:00:00Z',
      }],
    }],
    { projects: [], activeProjectId: null, activeConversationId: null },
    (task) => ({
      taskId: task.task_id,
      conversationId: task.conversation_id,
      executionMode: task.execution_mode,
      title: task.title,
      status: task.status,
      stage: task.stage,
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    }),
  );

  const entries = projectWorkflowTasks(state.projects[0]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].task.taskId, 'bot-task');
  assert.equal(entries[0].conversationId, 'bot-runtime-conversation');
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
