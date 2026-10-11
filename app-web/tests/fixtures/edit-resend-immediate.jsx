// 编辑消息重发的浏览器回归：真实 handleRetryTask / executeQuest（传输层换成离线 harness，
// 并按需把流挂住）+ 真实 ChatPanel / EditMessage / chat.css。
//
// 背景：编辑框原来等的是整段流（executeQuest 的 promise 到 SSE 结束才 resolve），于是按下
// Send 之后编辑框一直顶在「Sending…」上，而这一轮早就在下面以运行态渲染出来了——看起来就
// 是编辑框留在原地、错位在新消息上面。现在「服务端接下这一笔」就是收工点（tasks/model/
// quest-ack.js），并且被顶掉的那一轮在同一刻让位（chat/model/task-attempts.js）。
//
// 断言：
//   1. 取消的那一轮上编辑框能打开、带着原文；
//   2. 按 Send、请求出去（流还没跑完）→ 编辑框立刻消失，页面上再也找不到「Sending…」；
//   3. 同一时刻只有一轮：用户气泡里就是刚编辑的正文，助手行是运行态（Thinking）；
//   4. 流挂着的这些帧里编辑框不会回来，也不会多出第二轮（错位的根源）；
//   5. 流跑完后仍是同一轮、正文仍是编辑后的文本，运行态收起；
//   6. 启动前被拦下（上一轮还在跑）时，编辑框留在原地、草稿不丢、行内给出原因。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { collapseFullTaskAttempts } from '../../src/features/chat/model/task-attempts.js';
import { createConversationHandlers } from '../../src/features/conversations/hooks/createConversationHandlers.js';
import { createAttemptHarness } from './task-attempt-runtime.js';
import '../../styles/chat.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`));

const report = document.getElementById('checks');
const lines = [];
const failures = [];
const log = (line) => { lines.push(line); report.textContent = lines.join('\n'); };
function check(condition, name) {
  log(`${condition ? 'PASS' : 'FAIL'} ${name}`);
  if (!condition) failures.push(name);
}
// 后台标签页也跑得完：不靠 requestAnimationFrame（隐藏时它根本不触发，fixture 会永远停在
// 「Running checks…」），只等 React 的调度队列（MessageChannel）+ 一个宏任务。
const flush = () => new Promise((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
  channel.port2.postMessage(0);
});
const tick = async (rounds = 3) => {
  for (let round = 0; round < rounds; round += 1) await flush();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const root = createRoot(document.getElementById('root'));
const render = (content) => flushSync(() => root.render(<AppTooltipProvider>{content}</AppTooltipProvider>));
const originalFetch = window.fetch;
const modelCacheKey = 'haish_provider_models_v1';
const previousModelCache = localStorage.getItem(modelCacheKey);
window.fetch = (input, init) => {
  if (String(input).includes('/api/')) {
    if (String(input).endsWith('/api/llm/models')) {
      const model = JSON.parse(init.body).model;
      return Promise.resolve(Response.json({ models: [model], default_model: model }));
    }
    return Promise.reject(new Error('Unexpected API call in offline fixture'));
  }
  return originalFetch(input, init);
};

// 行投影：AppShell 的 chatMessages 只差在这一段（见 tests/contracts/edit-resend-run-state.test.js
// 钉住的 pendingTurnVisible / collapseFullTaskAttempts 两处），行本身交给真实 ChatPanel。
const projectRows = (state) => {
  const rows = [];
  const pendingTurn = state.pendingTask;
  const pendingStatus = pendingTurn ? (pendingTurn.status || 'queued') : '';
  const pendingTurnVisible = Boolean(pendingTurn && !state.activeTaskId && pendingStatus !== 'cancelled');
  const tasks = collapseFullTaskAttempts(
    state.taskOrder.map((taskId) => state.tasksById[taskId]).filter(Boolean),
    pendingTurnVisible ? pendingTurn : null,
  );
  const pushTurn = (task, taskId, status, streaming) => {
    rows.push({
      id: `${taskId}-user`, taskId, role: 'user', status,
      text: task.displayText ?? task.title, createdAt: task.createdAt,
    });
    rows.push({
      id: `${taskId}-agent`, taskId, role: 'agent', status, agentName: 'Simple Agent',
      text: '', streaming, traceTimeline: [], createdAt: task.createdAt,
    });
  };
  for (const task of tasks) {
    pushTurn(task, task.taskId || task.id, task.status, task.status === 'running');
  }
  if (pendingTurnVisible) pushTurn(pendingTurn, pendingTurn.id, pendingStatus, true);
  return rows;
};

const rowsOnScreen = () => [...document.querySelectorAll('.chat-message-row')];
const userRows = () => [...document.querySelectorAll('.chat-message-row.user')];
const agentRows = () => [...document.querySelectorAll('.chat-message-row.agent')];
const editorNode = () => document.querySelector('.aui-edit-message textarea');
const editorButtons = () => [...document.querySelectorAll('.aui-edit-actions button')].map((button) => button.textContent.trim());
const sendButton = () => [...document.querySelectorAll('.aui-edit-actions button')].find((button) => button.textContent.trim() !== 'Cancel');
const pencil = () => document.querySelector('[aria-label="Edit message"]');
const typeInto = (node, value) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event('input', { bubbles: true }));
};

const sourceTurn = (conversationId) => ({
  taskId: 'source', conversationId, userMessageId: 'user-original',
  title: '继续', displayText: '继续', requestText: '继续',
  status: 'cancelled', originViewMode: 'chat', answerText: '',
  createdAt: Date.now() - 60_000, completedAt: Date.now() - 30_000,
});

function panelProps(harness, conversationId, rows, running) {
  const handlers = createConversationHandlers({
    executeQuest: harness.executeQuest,
    canStartDeployForConversation: () => true,
    getRuntime: () => harness.runtime,
    showToast: () => {},
  });
  const selectedKey = `haish_run_config_v1:fixture:chat:${conversationId}`;
  localStorage.setItem(selectedKey, JSON.stringify({ providerId: 'fixture', modelId: 'fixture-model', reasoningEffort: null }));
  return (
    <ChatPanel conversationId={conversationId} selectionStorageKey={selectedKey} messages={rows} running={running}
      providerOptions={[{ id: 'fixture', provider: 'fixture', defaultModelId: 'fixture-model', modelOptions: ['fixture-model'] }]}
      onEditMessage={(taskId, text, config) => handlers.handleRetryTask(sourceTurn(conversationId), text, config)} />
  );
}

async function checkAcceptedEdit() {
  const conversationId = 'edit-resend-accepted';
  const source = sourceTurn(conversationId);
  const harness = createAttemptHarness(source, { hold: true });
  let running = false;
  const draw = () => render(panelProps(harness, conversationId, projectRows(harness.runtime.taskRuntimeState), running));
  draw();
  await tick();
  await tick();

  check(rowsOnScreen().length === 2 && Boolean(pencil()), 'the cancelled turn offers its edit affordance');
  pencil().click();
  await tick();
  const editor = editorNode();
  check(Boolean(editor) && editor.value === '继续', 'the editor opens on the original message');
  typeInto(editor, '继续（改过）');
  await tick();
  check(editorNode()?.value === '继续（改过）', 'the draft carries the edited text');

  sendButton().click();
  running = true;
  await tick();
  draw();
  await tick();
  check(Boolean(harness.requests.length), 'the resend left the client');
  check(harness.runtime.taskRuntimeState.pendingTask?.status === 'running', 'the run is still in flight while we look at the page');
  check(!editorNode() && !editorButtons().includes('Sending…'), `the editor is gone the moment the send is taken (buttons: ${editorButtons().join('/') || 'none'})`);
  const userText = userRows().map((row) => row.querySelector('.chat-bubble-text')?.textContent || '');
  check(userRows().length === 1, `exactly one user turn is on screen (${userRows().length})`);
  check(userText[0] === '继续（改过）', `the turn itself carries the edited text (${userText[0]})`);
  check(agentRows().length === 1 && agentRows()[0].classList.contains('is-streaming'), 'the same turn is now the running one');
  check(rowsOnScreen().length === 2, `no second turn and no orphaned editor above it (${rowsOnScreen().length} rows)`);

  for (let frame = 0; frame < 5; frame += 1) await tick();
  draw();
  await tick();
  check(!editorNode(), 'the editor never comes back while the run is still in flight');
  check(rowsOnScreen().length === 2 && harness.requests.length === 1, 'the held run keeps exactly one turn on screen');

  harness.release();
  await tick();
  draw();
  await tick();
  const settled = harness.runtime.taskRuntimeState;
  check(settled.pendingTask === null && Boolean(settled.tasksById['confirmed-attempt']), 'the run lands as the attempt that replaced the turn');
  check(rowsOnScreen().length === 2, `after the run finishes: still one turn (${rowsOnScreen().length} rows)`);
  check(userRows()[0]?.querySelector('.chat-bubble-text')?.textContent === '继续（改过）', 'the finished turn keeps the edited text');
  check(!agentRows()[0]?.classList.contains('is-streaming'), 'the running state is gone once the run is done');
  running = false;
}

async function checkBlockedEdit() {
  const conversationId = 'edit-resend-blocked';
  const source = sourceTurn(conversationId);
  const harness = createAttemptHarness(source);
  // 上一轮还在跑：校验在请求出手前就把这次重发拦下。
  harness.runtime.busy = true;
  harness.runtime.activeRunId = 'current-run';
  render(panelProps(harness, conversationId, projectRows(harness.runtime.taskRuntimeState), false));
  await tick();
  await tick();
  pencil().click();
  await tick();
  const editor = editorNode();
  typeInto(editor, '这条不能丢');
  await tick();
  sendButton().click();
  await tick();
  await tick();
  check(Boolean(editorNode()) && editorNode().value === '这条不能丢', 'a send blocked before the server took it keeps the editor and its draft');
  check(document.body.textContent.includes('not been sent'), 'and the reason is shown in the row');
  check(!harness.requests.length, 'nothing was sent');
}

(async () => {
  try {
    await document.fonts.ready;
    await checkAcceptedEdit();
    await checkBlockedEdit();
    report.dataset.result = failures.length ? 'FAIL' : 'PASS';
    document.title = `${failures.length ? 'FAIL' : 'PASS'}: ${lines.length} edit-resend checks`;
  } catch (error) {
    check(false, `${error.message}\n${error.stack || ''}`);
    report.dataset.result = 'FAIL';
    document.title = `FAIL: ${error.message}`;
  } finally {
    render(null);
    window.fetch = originalFetch;
    if (previousModelCache === null) localStorage.removeItem(modelCacheKey);
    else localStorage.setItem(modelCacheKey, previousModelCache);
  }
})();
