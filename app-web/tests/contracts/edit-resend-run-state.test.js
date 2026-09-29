import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const streamSource = fs.readFileSync(
  new URL('../../src/features/tasks/hooks/createTaskStreamHandlers.js', import.meta.url),
  'utf8',
);
const conversationSource = fs.readFileSync(
  new URL('../../src/features/conversations/hooks/createConversationHandlers.js', import.meta.url),
  'utf8',
);
const appShellSource = fs.readFileSync(
  new URL('../../src/features/app/AppShell.jsx', import.meta.url),
  'utf8',
);
const ackSource = fs.readFileSync(
  new URL('../../src/features/tasks/model/quest-ack.js', import.meta.url),
  'utf8',
);

function handleRetryTaskBranch() {
  const start = conversationSource.indexOf('async function handleRetryTask');
  assert.ok(start >= 0, 'handleRetryTask must exist');
  return conversationSource.slice(start, conversationSource.indexOf('\n\n  return {', start));
}

test('an accepted run announces itself before the stream is awaited', () => {
  // 校验收下、状态摆好、请求就要出手——这一档才算“发出去了”。再往后就是整段流，
  // 可能跑几分钟，调用方（编辑框）不能等到那里。
  const accepted = streamSource.indexOf('streamRequest?.onAccepted?.();');
  const awaited = streamSource.indexOf('await runTaskStream(command');
  assert.ok(accepted > 0, 'executeQuest must expose the acceptance point');
  assert.ok(accepted < awaited, 'acceptance fires before the run is awaited');
  assert.match(ackSource, /export function createQuestAck\(\) \{/);
  assert.match(ackSource, /accept\(\) \{/);
  assert.match(ackSource, /follow\(run, onLateError\) \{/);
});

test('editing and rerunning a turn keep the editor in charge, not the run', () => {
  const branch = handleRetryTaskBranch();
  assert.match(branch, /const ack = createQuestAck\(\);/);
  assert.match(branch, /onAccepted: ack\.accept,/);
  assert.match(branch, /return ack\.follow\(executeQuest\(/);
  // 老写法：把整段流的 promise 直接交给这一行（编辑框会一直顶在「Sending…」上）。
  assert.doesNotMatch(branch, /return executeQuest\(source/, 'the editor must not wait for the whole run');
  // 接下之后的失败不进编辑框：交给提示条，任务行自己回滚。
  assert.match(branch, /showToast\('error', String\(error\?\.message \|\| error\)\)/);
  // 启动前的校验照旧原样抛出：编辑框留在原地、草稿不丢。
  assert.match(branch, /throw new Error\('Conversation is still loading\. Your changes have not been sent\.'\)/);
});

test('the turn an accepted edit replaces yields at the same moment', () => {
  // 旧的取消态（连同里面那支编辑框）和新一轮的运行态不能同时占位：pendingTurn 一在
  // 时间线上渲染，被它顶掉的那一轮就让位（见 chat/model/task-attempts.js）。
  assert.match(appShellSource, /const pendingTurn = taskRuntimeState\.pendingTask;/);
  assert.match(appShellSource, /const pendingTurnVisible = Boolean\(pendingTurn/);
  assert.match(appShellSource, /pendingTurnVisible \? pendingTurn : null,/);
  assert.match(appShellSource, /const orderedTasks = collapseFullTaskAttempts\(\n\s*taskRuntimeState\.taskOrder\.map/);
  // 同一份可见性判据同时管「渲染 pending 那一轮」和「顶掉 source turn」，两处不会走散。
  assert.match(appShellSource, /if \(pendingTurnVisible\) \{\n\s*\/\/ 服务端还没接下这一笔/);
  assert.match(appShellSource, /id: `\$\{pendingTurn\.id \|\| 'pending'\}-user`/);
  assert.match(appShellSource, /id: `\$\{pendingTurn\.id \|\| 'pending'\}-agent`/);
  assert.doesNotMatch(appShellSource, /if \(taskRuntimeState\.pendingTask && !taskRuntimeState\.activeTaskId\) \{/,
    'the pending row gate must be shared with the collapse');
});
