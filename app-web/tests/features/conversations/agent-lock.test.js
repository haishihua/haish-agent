import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { conversationHasSentMessage, sentTaskSummaries } from '../../../src/features/conversations/model/agent-binding.js';
import { createDeployHandlers } from '../../../src/features/tasks/hooks/createDeployHandlers.js';

test('a conversation that has sent a message locks the agent', () => {
  assert.equal(conversationHasSentMessage({ tasks: [{ taskId: 'task-1' }] }), true);
  // 按发送那一刻就锁：本地已经渲染出这一轮的用户消息，不用等服务端回话。
  assert.equal(conversationHasSentMessage({ tasks: [], hasUserTurn: true }), true);
});

test('a conversation that only carried a parsed document stays unlocked', () => {
  // 传文件只会把会话落成实体（后端追加一条导入记录，不写 agent 绑定）。
  assert.equal(conversationHasSentMessage({ tasks: [], hasUserTurn: false }), false);
  assert.equal(conversationHasSentMessage({}), false);
  assert.equal(conversationHasSentMessage(), false);
});

test('a turn the server never accepted does not count as a sent message', () => {
  // 发送时前端会先把本地 pending 那一笔乐观写进会话行 / 时间线；服务端接受前它
  // 哪儿都没到，不能拿来锁选择器。
  const pendingTask = { id: 'queued-1', taskId: null, status: 'failed', title: 'hello' };
  assert.deepEqual(sentTaskSummaries([pendingTask], pendingTask), []);
  assert.equal(conversationHasSentMessage({ tasks: sentTaskSummaries([pendingTask], pendingTask) }), false);
  // 服务端接过的任务照旧算数，不管它后来是成了还是失败了。
  const accepted = { taskId: 'task-1', status: 'failed' };
  assert.deepEqual(sentTaskSummaries([pendingTask, accepted], pendingTask), [accepted]);
  assert.equal(conversationHasSentMessage({ tasks: sentTaskSummaries([pendingTask, accepted], pendingTask) }), true);
  assert.deepEqual(sentTaskSummaries([{ task_id: 'task-2' }], pendingTask), [{ task_id: 'task-2' }]);
  // 没有本地 pending 时原样返回（不白抄一份）。
  const summaries = [{ taskId: 'task-1' }];
  assert.equal(sentTaskSummaries(summaries, null), summaries);
  assert.deepEqual(sentTaskSummaries(null, pendingTask), []);
});

test('the time line only locks on turns the server accepted', () => {
  const source = fs.readFileSync(
    new URL('../../../src/features/app/AppShell.jsx', import.meta.url),
    'utf8',
  );
  // 本地 pending 的用户气泡带 unaccepted 标记，锁的判据跳过它。
  assert.match(source, /unaccepted: true,/);
  assert.match(
    source,
    /hasUserTurn: chatMessages\.some\(\(message\) => message\.role === 'user' && !message\.unaccepted\)/,
  );
  assert.match(
    source,
    /tasks: sentTaskSummaries\(currentConversation\?\.tasks, taskRuntimeState\.pendingTask\)/,
  );
});

test('the agent lock reads sent messages, not the optimistic agentId write', () => {
  const source = fs.readFileSync(
    new URL('../../../src/features/app/AppShell.jsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /const agentSelectionLocked = conversationHasSentMessage\(\{/);
  // 发送时乐观写进会话行的 agentId 没被服务端确认，不能拿来锁（发送失败、会话已删时
  // 它会留下一个假的「已绑定」，就是那次「没发消息却改不了 agent」的来源）。
  assert.doesNotMatch(source, /agentSelectionLocked = Boolean\(lockedAgentId/);
});

test('a message that never left the machine cannot lock the picker', () => {
  // 发出去之前就挂了（建会话失败 / 传图失败）：那一笔只存在本地，服务端什么都没收到，
  // 所以本地也要把它从会话行上摘掉——否则它会一直挂在行上，把选择器锁到重启。
  const CONVERSATION_ID = 'conversation-1';
  const pendingTask = { taskId: 'pending-1', status: 'queued', title: 'hello' };
  let state = {
    activeProjectId: 'project-1',
    activeConversationId: CONVERSATION_ID,
    projects: [{
      id: 'project-1',
      conversations: [{ id: CONVERSATION_ID, tasks: [pendingTask] }],
    }],
  };
  let runtimeState = { activeTaskId: null, pendingTask, taskOrder: [], tasksById: {} };
  const handlers = createDeployHandlers({
    getRuntime: () => ({ taskRuntimeState: runtimeState }),
    normalizeWorkspaceOrdering: (next) => next,
    setWorkspaceState: (updater) => {
      state = updater(state);
    },
    updateTaskRuntimeState: (updater) => {
      runtimeState = updater(runtimeState);
    },
  });

  handlers.failPendingDeploy(
    { runtimeConversationId: CONVERSATION_ID, pendingTask },
    new Error('image upload response is incomplete'),
  );

  const tasks = state.projects[0].conversations[0].tasks;
  assert.deepEqual(tasks, []);
  // 摘掉之后，锁的判据回到「发过消息」为假——选择器能用。
  assert.equal(conversationHasSentMessage({ tasks }), false);
  // 失败本身照旧留在运行时里（时间线/重试还要用它）。
  assert.equal(runtimeState.pendingTask.status, 'failed');
  assert.match(runtimeState.pendingTask.error, /image upload response is incomplete/);
});
