import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { conversationHasSentMessage, sentTaskSummaries } from '../../../src/features/conversations/model/agent-binding.js';
import { createDeployHandlers } from '../../../src/features/tasks/hooks/createDeployHandlers.js';

test('accepted history requires an Agent-switch impact notice, not a permanent lock', () => {
  assert.equal(conversationHasSentMessage({ tasks: [{ taskId: 'task-1' }] }), true);
  // 已接受的用户轮次用于影响提示；锁定只看运行/排队状态。
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

test('the impact notice only counts turns the server accepted', () => {
  const source = fs.readFileSync(
    new URL('../../../src/features/conversations/hooks/useConversationAgentSelection.js', import.meta.url),
    'utf8',
  );
  // Local unaccepted turns do not require the Agent-switch notice.
  assert.match(
    source,
    /hasUserTurn: messages\.some\(\(message\) => message\.role === 'user' && !message\.unaccepted\)/,
  );
  assert.match(
    source,
    /tasks: sentTaskSummaries\(conversation\?\.tasks, pendingTask\)/,
  );
});

test('the picker only locks during live execution or submission, not after prior messages', () => {
  const source = fs.readFileSync(new URL('../../../src/features/conversations/hooks/useConversationAgentSelection.js', import.meta.url), 'utf8');
  assert.match(source, /const locked = running \|\| Boolean\(queued\);/);
  assert.match(source, /hasSentMessage: conversationHasSentMessage/);
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
  // 没有服务端接受的历史时，不展示切换影响提示。
  assert.equal(conversationHasSentMessage({ tasks }), false);
  // 失败本身照旧留在运行时里（时间线/重试还要用它）。
  assert.equal(runtimeState.pendingTask.status, 'failed');
  assert.match(runtimeState.pendingTask.error, /image upload response is incomplete/);
});
