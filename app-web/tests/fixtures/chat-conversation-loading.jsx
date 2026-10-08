// 会话打开时的加载占位：真实 ChatPanel + 真实 base.css / chat.css。
//
// 用户要的是「会话详情正中间 loading 一个，loading 完再展示用户和 assistant 消息」，而不是
// 「用户消息都显示了、助手那一轮各自转一个圈」。这里锁的就是这一条：
//   1. loading 时消息列里只有一颗 Loader：0 个消息行、0 个气泡，空会话插画和两条分页提示
//      也不抢镜；
//   2. 它落在消息区正中间：水平、垂直都与消息列内容盒的中心重合；
//   3. loading 一结束，Loader 消失，用户气泡与助手气泡同时出现，助手气泡带正文；
//   4. 空会话（messages = []）照旧显示空态，不会被加载占位盖住；
//   5. 反向断言（revert）：同一份「正文还没到」的行在不带 loading 时直接铺开——用户气泡在、
//      助手气泡空着、0 颗 Loader，就是当初那张截图。说明上面那几条断言量的是占位本身，
//      不是「页面本来就空」。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { CHAT_ROW_WINDOW_INITIAL } from '../../src/features/chat/model/chat-row-window.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`));

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value) => Math.round(value * 100) / 100;

// 快照搭出来的那一屏：用户那一问的原文还没到（只有标题当占位），助手正文更没有。
const SNAPSHOT_MESSAGES = [
  { id: 'snap-user-0', taskId: 'snap-task-0', role: 'user', status: 'done', text: '表格为什么要滚轮才看得全？' },
  { id: 'snap-answer-0', taskId: 'snap-task-0', messageId: 'snap-saved-0', role: 'agent', status: 'done', text: '' },
];
// 会话详情 + 运行记录回来之后的那一屏。
const LOADED_MESSAGES = [
  SNAPSHOT_MESSAGES[0],
  {
    ...SNAPSHOT_MESSAGES[1],
    text: '答案是三段规则叠在一起：表格被上游的 300px 高度上限、正文的 word-break 和气泡宽度上限一起挤扁了。',
  },
];
const ANSWER_SNIPPET = '三段规则叠在一起';
// 200 行覆盖“加载占位被误判为正文高度不足，窗口提前扩到全量”的冷加载回归。
const LONG_MESSAGES = Array.from({ length: 200 }, (_, index) => ({
  id: `long-row-${index}`, taskId: `long-task-${index}`, role: 'user', status: 'done',
  text: Array.from({ length: 6 }, (_, line) => `History ${index}: line ${line}`).join('\n'),
}));
const SHORT_MESSAGES = LONG_MESSAGES.map((message) => ({ ...message, text: 'Short turn' }));

const PROVIDER_OPTIONS = [{ id: 'fixture', provider: 'fixture', defaultModelId: 'fixture-model', modelOptions: ['fixture-model'] }];
const originalFetch = window.fetch;
window.fetch = (input, init) => (String(input).includes('/api/')
  ? Promise.reject(new Error('Offline fixture: unexpected API call'))
  : originalFetch(input, init));

const root = createRoot(document.getElementById('root'));
const render = (conversationId, messages, loading) => flushSync(() => root.render(
  <AppTooltipProvider>
    <ChatPanel conversationId={conversationId} messages={messages} loading={loading} providerOptions={PROVIDER_OPTIONS} />
  </AppTooltipProvider>,
));

const listNode = () => document.querySelector('.chat-message-list');
const loaderNodes = () => [...document.querySelectorAll('[data-slot="generation-loader"]')];
// 上一个会话的行组会带着 hidden 留在 DOM 里（切回来的缓存，见 ChatPanel 的 keptGroup），
// 所以「屏幕上有几行」要按布局盒子数，不能按 DOM 节点数。
const rowNodes = () => [...document.querySelectorAll('.chat-message-row')];
const visibleRows = () => rowNodes().filter((row) => row.getClientRects().length);
const visibleAgentBody = () => visibleRows()
  .find((row) => row.classList.contains('agent'))?.querySelector('.message-speech-body') || null;

// 消息列内容盒的中心：flex 列里 auto 外边距把剩余空间均分到两侧，占位就落在这一点上。
// 右侧那条常驻滚动条占位不算内容（clientWidth 已经把它扣掉），所以用 content box 量。
function contentCenter(element) {
  const style = getComputedStyle(element);
  const box = element.getBoundingClientRect();
  const left = box.left + parseFloat(style.borderLeftWidth || '0') + parseFloat(style.paddingLeft || '0');
  const right = box.left + element.clientWidth - parseFloat(style.paddingRight || '0');
  const top = box.top + parseFloat(style.borderTopWidth || '0') + parseFloat(style.paddingTop || '0');
  const bottom = box.top + element.clientHeight - parseFloat(style.paddingBottom || '0');
  return { x: round((left + right) / 2), y: round((top + bottom) / 2) };
}

function boxCenter(node) {
  const box = node.getBoundingClientRect();
  return { x: round(box.left + box.width / 2), y: round(box.top + box.height / 2) };
}

async function runChecks() {
  // 1 + 2：加载中——整段会话一颗 Loader，落在正中
  render('fixture-loading', SNAPSHOT_MESSAGES, true);
  await sleep(250);
  const list = listNode();
  const loaders = loaderNodes();
  check(
    'the conversation body and the composer both rendered',
    Boolean(list) && Boolean(document.querySelector('.chat-composer')),
    `list=${Boolean(list)} composer=${Boolean(document.querySelector('.chat-composer'))}`,
  );
  check('exactly one loader is on screen while the conversation loads', loaders.length === 1, `loaders=${loaders.length}`);
  check(
    'not a single message row is visible while the conversation loads',
    visibleRows().length === 0,
    `visible rows=${visibleRows().length} mounted=${rowNodes().length}`,
  );
  check(
    'the empty-state chrome and the paging hints stay out of the way',
    !document.querySelector('.chat-empty')
      && !document.querySelector('.chat-earlier-rows')
      && !document.querySelector('.chat-earlier-tasks'),
    `empty=${Boolean(document.querySelector('.chat-empty'))} earlier=${Boolean(document.querySelector('.chat-earlier-rows'))}`,
  );
  const center = contentCenter(list);
  const loaderCenter = boxCenter(loaders[0]);
  check(
    'the loader is horizontally centered in the message column',
    Math.abs(loaderCenter.x - center.x) <= 2,
    `loader=${loaderCenter.x} column=${center.x} (Δ${round(Math.abs(loaderCenter.x - center.x))}px)`,
  );
  check(
    'the loader is vertically centered in the message column',
    Math.abs(loaderCenter.y - center.y) <= 2,
    `loader=${loaderCenter.y} column=${center.y} (Δ${round(Math.abs(loaderCenter.y - center.y))}px)`,
  );
  check(
    'the placeholder is announced, not just drawn',
    document.querySelector('.chat-conversation-loading')?.getAttribute('role') === 'status'
      && document.querySelector('.chat-conversation-loading')?.textContent.includes('Loading conversation'),
    `role=${document.querySelector('.chat-conversation-loading')?.getAttribute('role')}`,
  );

  // 3：正文到了——Loader 让位给用户 + 助手两行
  render('fixture-loaded', LOADED_MESSAGES, false);
  await sleep(250);
  const rows = visibleRows();
  const userRow = rows.find((row) => row.classList.contains('user'));
  const agentRow = rows.find((row) => row.classList.contains('agent'));
  check('the loader is gone once the conversation body has arrived', loaderNodes().length === 0, `loaders=${loaderNodes().length}`);
  check(
    'the user message and the assistant message show up together',
    rows.length === 2 && Boolean(userRow) && Boolean(agentRow),
    `visible rows=${rows.length} user=${Boolean(userRow)} agent=${Boolean(agentRow)}`,
  );
  check(
    'the assistant bubble carries the answer that arrived with the conversation',
    Boolean(visibleAgentBody()?.textContent.includes(ANSWER_SNIPPET)),
    `text=${(visibleAgentBody()?.textContent || '').slice(0, 40)}`,
  );
  check(
    'the rows of the conversation left behind stay mounted but hidden',
    rowNodes().length === 4 && rows.length === 2,
    `mounted=${rowNodes().length} visible=${rows.length}`,
  );
  check(
    'no per-row placeholder is left behind',
    document.querySelectorAll('.chat-bubble-answer-pending').length === 0,
    `placeholders=${document.querySelectorAll('.chat-bubble-answer-pending').length}`,
  );

  // 4：空会话照旧是空态
  render('fixture-empty', [], false);
  await sleep(250);
  check(
    'an empty conversation still shows its empty state',
    Boolean(document.querySelector('.chat-empty')) && loaderNodes().length === 0,
    `empty=${Boolean(document.querySelector('.chat-empty'))} loaders=${loaderNodes().length}`,
  );

  // 长会话：等待详情期间不扩窗；同一份消息只切 loading，正文到达仍只挂首批。
  render('fixture-long-loading', LONG_MESSAGES, true);
  await sleep(250);
  check('long history mounts no rows while loading', visibleRows().length === 0,
    `visible=${visibleRows().length}`);
  render('fixture-long-loading', LONG_MESSAGES, false);
  await sleep(250);
  check('long history keeps the initial row window when loading ends',
    visibleRows().length === CHAT_ROW_WINDOW_INITIAL,
    `mounted=${visibleRows().length} initial=${CHAT_ROW_WINDOW_INITIAL} total=${LONG_MESSAGES.length}`);
  check('the newest row remains in the initial window',
    visibleRows().at(-1)?.textContent.includes('History 199:'),
    `last=${visibleRows().at(-1)?.textContent.slice(0, 40)}`);

  // 正文到达后仍按真实高度补齐：放大视口，让首批短消息不足以填满它。
  render('fixture-short-loading', SHORT_MESSAGES, true);
  const workspace = document.querySelector('.chat-workspace');
  const originalHeight = workspace.style.height;
  workspace.style.height = '6000px';
  await sleep(250);
  render('fixture-short-loading', SHORT_MESSAGES, false);
  await sleep(250);
  check('short rows still auto-fill the viewport after loading ends',
    visibleRows().length > CHAT_ROW_WINDOW_INITIAL && visibleRows().length < SHORT_MESSAGES.length,
    `mounted=${visibleRows().length} initial=${CHAT_ROW_WINDOW_INITIAL} total=${SHORT_MESSAGES.length}`);
  check('auto-fill uses actual row height rather than the loading placeholder',
    listNode().scrollHeight > listNode().clientHeight + 400,
    `scrollHeight=${listNode().scrollHeight} clientHeight=${listNode().clientHeight}`);
  workspace.style.height = originalHeight;

  check('no page error was raised while opening conversations', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
  return results;
}

// 反向断言：同一份「正文还没到」的行，不带 loading 就直接铺开——用户气泡在、助手气泡空着、
// 0 颗 Loader。这就是修复前那一屏，说明上面的断言确实量到了占位。
async function revertChecks() {
  render('fixture-revert', SNAPSHOT_MESSAGES, false);
  await sleep(250);
  const rows = visibleRows();
  return [
    {
      name: 'revert: without the flag the snapshot rows render (no loader at all)',
      pass: rows.length === 2 && loaderNodes().length === 0,
      detail: `rows=${rows.length} loaders=${loaderNodes().length}`,
    },
    {
      name: 'revert: the assistant bubble is left with an empty body',
      pass: (visibleAgentBody()?.textContent || '').trim().length === 0,
      detail: `body="${(visibleAgentBody()?.textContent || '').trim()}"`,
    },
  ];
}

const report = (list) => {
  const output = document.getElementById('checks');
  const failed = list.filter((entry) => !entry.pass);
  output.textContent = `${failed.length ? 'FAIL' : 'PASS'}  ${list.length - failed.length}/${list.length}\n`
    + list.map((entry) => `${entry.pass ? 'ok  ' : 'FAIL'} ${entry.name}${entry.detail ? ` [${entry.detail}]` : ''}`).join('\n');
  output.dataset.result = failed.length ? 'FAIL' : 'PASS';
  document.title = `${failed.length ? 'FAIL' : 'PASS'}: ${list.length - failed.length}/${list.length} conversation loading checks`;
  return { failed: failed.length, total: list.length, results: list };
};

window.__chatConversationLoadingChecks = async () => report(await runChecks());
window.__chatConversationLoadingRevertChecks = async () => report(await revertChecks());
// 手动看的时候用：把加载中 / 已加载 / 空会话三屏摆出来。
window.__chatConversationLoadingShow = (which = 'loading') => {
  if (which === 'loaded') return render('fixture-loaded', LOADED_MESSAGES, false);
  if (which === 'empty') return render('fixture-empty', [], false);
  return render('fixture-loading', SNAPSHOT_MESSAGES, true);
};
window.__chatConversationLoadingAutoRun = () => {
  runChecks().then(report).catch((error) => {
    report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]);
  });
};

window.__chatConversationLoadingAutoRun();
