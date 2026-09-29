// 行窗口 + 「切走的那组行留在原地」的浏览器回归：真实 ChatPanel、真实 chat.css。
//
// 背景：长会话（compute-use3.0 有 346 行、17 万字）切换时的 1s 级 Markdown 解析都发生在
// 挂载那一刻，而屏幕上只看得见最后一屏。现在首屏只渲染最近 N 行，向上滚按页补；离开的
// 会话那一组带着 hidden 留在原地，切回来 React 按 key 复用 fiber 与 DOM——正文不重新解析。
//
// 断言：
//   1. 首屏只渲染最近 CHAT_ROW_WINDOW_INITIAL 行，最新一条在窗口里，列表停在最新处；
//   2. 停在底部不会自己补页（补页区间不该被自动跟随误触发）；
//   3. 向上滚进补页区间按页补，补页后原来在读的那一行屏幕位置不动；
//   4. 补到全量后提示消失；
//   5. 切走：上一组还在 DOM 里但 hidden、aria-hidden，不进「在会话里查找」的正文扫描，
//      同一时刻只有一个会话参与布局；搜索仍能扫到活动会话的窗口。
//   6. 切回来：同一批 DOM 节点（没有重新挂载 = 没有重新解析正文），行窗口按记忆恢复。
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { collectConversationMatches } from '../../src/features/chat/model/conversation-search.js';
import { CHAT_ROW_WINDOW_INITIAL, CHAT_ROW_WINDOW_PAGE } from '../../src/features/chat/model/chat-row-window.js';
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
// 后台标签页不会跑 rAF；用 CDP 推帧或者 setTimeout 都能推进。
const tick = async () => {
  await new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function' && document.visibilityState === 'visible') {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    } else {
      setTimeout(resolve, 24);
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
};
// 后台标签页里 React 提交的节拍完全看调度，不等固定帧数：等到条件成立再断言。
const waitFor = async (predicate, { tries = 80, gap = 25 } = {}) => {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, gap));
  }
  return false;
};

const root = createRoot(document.getElementById('root'));
const render = (content) => flushSync(() => root.render(<AppTooltipProvider>{content}</AppTooltipProvider>));
const originalFetch = window.fetch;
window.fetch = (input, init) => (String(input).includes('/api/')
  ? Promise.reject(new Error('Offline fixture: unexpected API call'))
  : originalFetch(input, init));

const TURNS = 30;
const conversation = (prefix) => Array.from({ length: TURNS }, (_, index) => ([
  { id: `${prefix}-user-${index}`, taskId: `${prefix}-task-${index}`, role: 'user', status: 'done',
    text: `Question ${index} needlish-${prefix}-${index}` },
  { id: `${prefix}-answer-${index}`, taskId: `${prefix}-task-${index}`, messageId: `${prefix}-saved-${index}`, role: 'agent', status: 'done',
    text: `Answer ${index} needlish-${prefix}-${index}` },
])).flat();
const messagesAlpha = conversation('alpha');
const messagesBeta = conversation('beta');
const panel = (conversationId, messages) => (
  <ChatPanel conversationId={conversationId} messages={messages}
    providerOptions={[{ id: 'fixture', provider: 'fixture', defaultModelId: 'fixture-model', modelOptions: ['fixture-model'] }]} />
);

const listNode = () => document.querySelector('.chat-message-list');
const rows = () => [...document.querySelectorAll('.chat-message-row')];
const scrolledToBottom = () => {
  const element = listNode();
  return element.scrollHeight - element.scrollTop - element.clientHeight <= 2;
};
const firstVisibleRow = () => {
  const element = listNode();
  const top = element.getBoundingClientRect().top;
  return rows().find((row) => row.getBoundingClientRect().bottom > top + 1) || null;
};

async function main() {
  await document.fonts.ready;

  render(panel('alpha', messagesAlpha));
  await tick();
  await tick();

  const initial = rows().map((row) => row.dataset.messageId);
  check(initial.length === CHAT_ROW_WINDOW_INITIAL, `first paint renders only the newest ${CHAT_ROW_WINDOW_INITIAL} rows (got ${initial.length} of ${messagesAlpha.length})`);
  check(initial.at(-1) === messagesAlpha.at(-1).id, 'the newest row is inside the first window');
  check(initial[0] === messagesAlpha[messagesAlpha.length - CHAT_ROW_WINDOW_INITIAL].id, 'the window is the newest N rows, not the oldest');
  check(scrolledToBottom(), 'the list still opens on the latest message');
  check(Boolean(document.querySelector('.chat-earlier-rows button')), 'the window exposes a load-earlier affordance');

  for (let frame = 0; frame < 4; frame += 1) await tick();
  check(rows().length === CHAT_ROW_WINDOW_INITIAL, 'resting at the bottom never pages in more rows');

  // 用户没有真的动手滚的时候，应用是一路跟着最新一条走的（ScrollToBottomButton 的
  // followLatest 只在 wheel / 键盘 / 指针手势下才关闭）：所以先补一个向上的 wheel，
  // 才等于“用户正在往上读”。否则行一变就被拽回底部。
  listNode().dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));
  listNode().scrollTop = 320;
  const anchorBefore = firstVisibleRow();
  const anchorId = anchorBefore?.dataset.messageId;
  const listTop = listNode().getBoundingClientRect().top;
  const trace = (label) => {
    const node = document.querySelector(`[data-message-id="${anchorId}"]`);
    const list = listNode();
    const contentOffset = (element) => (element ? Math.round(list.scrollTop + element.getBoundingClientRect().top - list.getBoundingClientRect().top) : 'gone');
    return [label, rows().length, Math.round(list.scrollTop), Math.round(list.scrollHeight), contentOffset(node),
      contentOffset(document.querySelector('[data-row-group="alpha"] .chat-message-row'))];
  };
  const traceSteps = [trace('before')];
  listNode().dispatchEvent(new Event('scroll', { bubbles: true }));
  traceSteps.push(trace('sync'));
  const anchorOffset = () => {
    const node = document.querySelector(`[data-message-id="${anchorId}"]`);
    return node ? Math.abs(node.getBoundingClientRect().top - listTop) : Number.POSITIVE_INFINITY;
  };
  await waitFor(() => rows().length === CHAT_ROW_WINDOW_INITIAL + CHAT_ROW_WINDOW_PAGE && anchorOffset() <= 2);
  traceSteps.push(trace('settled'));
  check(rows().length === CHAT_ROW_WINDOW_INITIAL + CHAT_ROW_WINDOW_PAGE, `scrolling into the trigger distance pages in ${CHAT_ROW_WINDOW_PAGE} more rows (now ${rows().length})`);
  check(anchorOffset() <= 2, `paging rows in leaves the row you were reading at the same screen position (${JSON.stringify(traceSteps)})`);

  for (let page = 0; page < TURNS && document.querySelector('.chat-earlier-rows'); page += 1) {
    const before = rows().length;
    listNode().scrollTop = 0;
    listNode().dispatchEvent(new Event('scroll', { bubbles: true }));
    await waitFor(() => rows().length > before || !document.querySelector('.chat-earlier-rows'));
  }
  check(rows().length === messagesAlpha.length, 'paging keeps going until the oldest turn is rendered');
  check(!document.querySelector('.chat-earlier-rows'), 'the affordance disappears once every row is rendered');

  const probeId = messagesAlpha.at(-1).id;
  const probeNode = document.querySelector(`[data-message-id="${probeId}"]`);
  probeNode.dataset.keepAliveProbe = 'yes';

  render(panel('beta', messagesBeta));
  await waitFor(() => document.querySelector('[data-row-group="alpha"]')?.hidden === true);
  await tick();
  const keptGroup = document.querySelector('[data-row-group="alpha"]');
  check(Boolean(keptGroup?.hidden), 'the conversation you left keeps its rows mounted, hidden');
  check(keptGroup?.getAttribute('aria-hidden') === 'true', 'the kept rows stay out of the accessibility tree and the finder scan');
  check(keptGroup?.contains(probeNode), 'the kept rows are the same DOM, not a re-render of the old conversation');
  check(document.querySelectorAll('.chat-row-group:not([hidden])').length === 1, 'only one conversation is laid out at a time');
  const list = listNode();
  check(collectConversationMatches(list, 'needlish-alpha').length === 0, 'kept rows are not scanned by find-in-conversation');
  check(collectConversationMatches(list, 'needlish-beta').length === CHAT_ROW_WINDOW_INITIAL,
    `the active conversation is searchable over its window (${CHAT_ROW_WINDOW_INITIAL} rows)`);

  render(panel('alpha', messagesAlpha));
  await waitFor(() => document.querySelector(`[data-message-id="${probeId}"]`) === probeNode && scrolledToBottom());
  await tick();
  check(document.querySelector(`[data-message-id="${probeId}"]`) === probeNode,
    'coming back reuses the same DOM node: the parsed Markdown was never thrown away');
  check(document.querySelectorAll('[data-row-group="alpha"] .chat-message-row').length === messagesAlpha.length,
    'the row window is remembered per conversation');
  check(Boolean(document.querySelector('[data-row-group="beta"][hidden]')), 'beta is the one kept hidden now');
  check(scrolledToBottom(), 'coming back lands on the latest message');

  // 保存的批注草稿引用的是老轮次：窗口只盖最近 24 行，跳转前必须先把窗口补到盖住那一行
  // （窗口化之前所有行都在，不存在这一步）。否则 MessageAnnotations 在 DOM 里找不到原文，
  // 会报「引用的原文找不到」。
  const messagesGamma = conversation('gamma');
  const groupRows = (id) => [...document.querySelectorAll(`[data-row-group="${id}"] .chat-message-row`)];
  const visibleInList = (node) => {
    if (!node) return false;
    const list = listNode();
    const visual = node.closest('.chat-message-row') || node;
    if (!visual.getClientRects().length) return false;
    const rowRect = visual.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    return rowRect.bottom > listRect.top && rowRect.top < listRect.bottom;
  };
  window.localStorage.clear();
  window.localStorage.setItem('haish:message-annotations:v1:gamma', JSON.stringify([{
    id: 'draft-old-quote', source_message_id: 'gamma-saved-3', text: 'Answer 3 needlish-gamma-3',
    start: 0, end: 'Answer 3 needlish-gamma-3'.length, prefix: '', suffix: '', comment: 'look at this again',
  }]));
  render(panel('gamma', messagesGamma));
  await waitFor(() => groupRows('gamma').length > 0);
  await tick();
  const quotedSource = () => document.querySelector('[data-message-id="gamma-answer-3"] [data-annotation-source="gamma-saved-3"]');
  check(groupRows('gamma').length === CHAT_ROW_WINDOW_INITIAL && !quotedSource(), 'the quoted turn starts outside the window');
  const jumpChip = document.querySelector('.haish-quote-text[title="Jump to quoted text"]');
  check(Boolean(jumpChip), 'the saved comment draft offers a way back to its quote');
  jumpChip?.click();
  await waitFor(() => visibleInList(quotedSource()));
  check(Boolean(quotedSource()), `jumping to a quote outside the window pages it in (now ${groupRows('gamma').length} rows)`);
  check(visibleInList(quotedSource()), 'the quoted row ends up inside the reading area');
  check(!document.querySelector('.haish-annotation-notice')?.textContent.trim(), 'the jump does not report a missing quote');
  window.localStorage.clear();
  check(window.__pageErrors.length === 0, `no page errors (${window.__pageErrors.join(' | ')})`);
}

(async () => {
  try {
    await main();
    report.dataset.result = failures.length ? 'FAIL' : 'PASS';
    document.title = `${failures.length ? 'FAIL' : 'PASS'}: ${lines.length} chat render window checks`;
  } catch (error) {
    check(false, `${error.message}\n${error.stack || ''}`);
    report.dataset.result = 'FAIL';
    document.title = `FAIL: ${error.message}`;
  } finally {
    window.fetch = originalFetch;
  }
})();
