// Real ChatPanel + production CSS. The previous loader re-entered after every
// empty/no-progress completion: a top-rail click produced 26 calls in 2 seconds.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (predicate()) return true;
    await sleep(25);
  }
  throw new Error('Timed out waiting for a paging/layout condition');
};
window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.error || event.message)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(String(event.reason)));
const originalFetch = window.fetch;
window.fetch = (input, init) => String(input).includes('/api/')
  ? Promise.reject(new Error('Offline fixture: unexpected API call')) : originalFetch(input, init);
const root = createRoot(document.getElementById('root'));
const providerOptions = [{ id: 'fixture', provider: 'fixture', defaultModelId: 'fixture-model', modelOptions: ['fixture-model'] }];
const makeMessages = (turns = 26) => Array.from({ length: turns }, (_, index) => [
  { id: `loop-user-${index}`, taskId: `loop-${index}`, role: 'user', text: `Question ${index}`, status: 'done', createdAt: Date.parse('2026-10-12T00:00:00Z') },
  { id: `loop-agent-${index}`, taskId: `loop-${index}`, role: 'agent', text: `Answer ${index}: ${'Reading content. '.repeat(6)}`, status: 'done', traceHydrated: index >= 23 },
]).flat();
const listNode = () => document.querySelector('.chat-message-list');
let scenario;
const draw = () => {
  const current = scenario;
  return flushSync(() => root.render(<AppTooltipProvider>
  <ChatPanel conversationId={current.id} messages={current.messages} providerOptions={providerOptions}
    earlierTaskRuntimesPending={current.pending}
    earlierTaskRuntimeIds={current.authoritative ? current.ids : undefined}
    onLoadEarlierTasks={async (_conversationId, requestedIds) => {
      const request = current;
      request.calls += 1;
      // 与生产一致：点了名的行就只拉它们，没人点名才退回最新一页。
      const ids = Array.isArray(requestedIds) && requestedIds.length
        ? requestedIds.filter((id) => request.ids.includes(id))
        : request.ids.slice(-3);
      request.pages.push(ids);
      await sleep(request.delay ?? 60);
      if (request.mode === 'error' && request.fail) throw new Error('Offline');
      if (request.mode === 'pages' || request.mode === 'error') {
        request.ids = request.ids.filter((id) => !ids.includes(id));
        request.pending = request.ids.length > 0;
        request.messages = request.messages.map((message) => message.role === 'agent' && ids.includes(message.taskId)
          ? { ...message, traceHydrated: true } : message);
        if (scenario === request) draw();
      }
      if (request.mode === 'undefined') return undefined;
      return request.mode === 'same-result' ? ids : [];
    }} />
</AppTooltipProvider>));
};
let activation = 0;
const show = async (mode = 'empty', authoritative = true) => {
  const messages = makeMessages();
  scenario = { id: `earlier-loop-${++activation}`, messages, mode, calls: 0, pages: [], fail: true,
    pending: mode !== 'exhausted', ids: messages.filter((message) => message.traceHydrated === false).map((message) => message.taskId), authoritative };
  draw();
  await waitFor(() => document.querySelectorAll('.conversation-map-tick').length === 26);
  await sleep(120);
  return snapshot();
};
// A short conversation is already fully mounted at the oldest turn. Pending
// task ids may still exist below the viewport; the absolute top must not page
// them just because scrollTop is 0.
const showCompact = async () => {
  const messages = makeMessages(6).map((message) => message.role === 'agent'
    ? { ...message, traceHydrated: true } : message);
  scenario = { id: `earlier-loop-compact-${++activation}`, messages, mode: 'empty', calls: 0, pages: [], fail: true,
    pending: true, ids: ['newer-pending-task'], authoritative: true };
  draw();
  await waitFor(() => document.querySelectorAll('.conversation-map-tick').length === 6);
  await sleep(150);
  const list = listNode();
  list.scrollTop = 0;
  list.dispatchEvent(new Event('scroll', { bubbles: true }));
  await sleep(300);
  return snapshot();
};
const snapshot = () => ({ calls: scenario.calls, pages: scenario.pages, pending: scenario.ids,
  status: document.querySelector('.chat-earlier-tasks')?.textContent || '', scrollTop: listNode()?.scrollTop });
// 视口里还带着 data-trace-pending 的行（就是此刻看得见、还没补水的行）。
const pendingInViewport = () => {
  const list = listNode();
  const viewport = list.getBoundingClientRect();
  return [...document.querySelectorAll('.chat-row-group:not([hidden]) [data-trace-pending]')]
    .filter((row) => row.getClientRects().length)
    .filter((row) => {
      const rect = row.getBoundingClientRect();
      return rect.bottom >= viewport.top && rect.top <= viewport.bottom;
    });
};
const jumpTop = async () => {
  document.querySelector('.conversation-map-tick').click();
  await waitFor(() => visibleRow('loop-user-0'));
  await sleep(250);
};
// 切走的那组行会带着 hidden 留在 DOM 里（同样的 message id），查行必须限定在
// 当前可见的那一组，否则量到的是 display:none 的旧行（高度/位置都是 0）。
const visibleRow = (messageId) => document.querySelector(`.chat-row-group:not([hidden]) [data-message-id="${messageId}"]`);
window.__earlierStepsShow = show;
window.__earlierStepsSnapshot = snapshot;
window.__earlierStepsChecks = async () => {
  const results = [];
  const check = (condition, name) => {
    results.push({ name, pass: Boolean(condition) });
    document.getElementById('checks').textContent = results.map((result) => `${result.pass ? 'PASS' : 'FAIL'} ${result.name}`).join('\n');
  };
  for (const mode of ['empty', 'undefined', 'same-result']) {
    await show(mode);
    check(scenario.calls === 0, `${mode}: resting at the latest turn does not fetch earlier steps`);
    await jumpTop();
    await sleep(900);
    const settledTop = listNode().scrollTop;
    for (let event = 0; event < 8; event += 1) {
      listNode().dispatchEvent(new Event('scroll', { bubbles: true }));
      // New array and callback identities must not turn the same page into a
      // new one (real shell/stream renders recreate both).
      scenario.messages = [...scenario.messages];
      scenario.ids = [...scenario.ids];
      draw();
      await sleep(40);
    }
    await sleep(300);
    check(scenario.calls === 1, `${mode}: an unchanged pending page is attempted once, not every frame (${scenario.calls})`);
    check(!document.querySelector('.chat-earlier-tasks'), `${mode}: completed no-progress loading does not leave a flashing status pill`);
    check(Math.abs(listNode().scrollTop - settledTop) < 1, `${mode}: the oldest turn remains at a stable scroll position`);
  }

  await show('empty', false);
  await jumpTop();
  await sleep(400);
  check(scenario.calls === 1 && !document.querySelector('.chat-earlier-tasks'), 'message-derived pending identity also stops a no-progress loader');

  // 只补视口里看得见的那几行：以前在会话顶部会按队列从新往旧一整条翻完
  // （长会话就是几十个连续请求 + 内容一直在跳）。
  await show('pages');
  await jumpTop();
  await sleep(1200);
  check(scenario.calls <= 3, `a jump to the top hydrates only the visible rows, not the whole queue (${scenario.calls})`);
  check(scenario.ids.length > 0, 'pending tasks below the viewport stay pending (no pre-fetch sweep)');
  check(pendingInViewport().length === 0, 'every pending row inside the viewport is hydrated');
  const callAfterJump = scenario.calls;
  await sleep(600);
  check(scenario.calls === callAfterJump, 'nothing else is fetched while the reader sits still at the top');

  // 读者自己翻到别的待补水行时，才补它那一批。
  visibleRow('loop-agent-10').scrollIntoView({ block: 'center' });
  listNode().dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));
  listNode().dispatchEvent(new Event('scroll', { bubbles: true }));
  await waitFor(() => !scenario.ids.includes('loop-10'));
  check(scenario.pages.slice(callAfterJump).flat().includes('loop-10'), 'scrolling to another pending row hydrates that row');
  check(scenario.pages.slice(callAfterJump).flat().length <= 6, 'only the rows that came into view are fetched');

  // 顶部再也不挂 “Scroll up to load earlier steps / Loading earlier steps…”：补页是自己
  // 触发的，读者不需要动作；加载中只体现在 aria-busy 上。之前那条 28px 的 pill 每补
  // 一批就来一次、又走一次，内容会被顶得上下抽，搜索时它还会一直挂着。
  await show('pages');
  scenario.delay = 400;
  await jumpTop();
  await waitFor(() => listNode().getAttribute('aria-busy') === 'true');
  check(!document.querySelector('.chat-earlier-tasks'), 'hydrating a visible slice shows no status copy at the top');
  check(await waitFor(() => !listNode().getAttribute('aria-busy')), 'the busy flag clears once the slice lands');
  scenario.delay = 60;

  await show('empty');
  await jumpTop();
  await waitFor(() => !document.querySelector('.chat-earlier-tasks'));
  scenario.ids = scenario.ids.map((id) => id === 'loop-0' ? 'new-pending-task' : id);
  // The authoritative pending queue changes even though count and message DOM
  // do not: summary-only tasks can have no assistant row at all.
  draw();
  await waitFor(() => scenario.calls === 2 && !document.querySelector('.chat-earlier-tasks'));
  check(scenario.calls === 2, 'a different authoritative pending set resumes once, even with identical message rows and count');

  await show('exhausted');
  await jumpTop();
  await sleep(250);
  check(scenario.calls === 0 && !document.querySelector('.chat-earlier-tasks'), 'a conversation with no pending tasks never shows or invokes the loader');

  await showCompact();
  check(scenario.calls === 0, 'a programmatic scroll at the absolute top does not page newer pending tasks');
  check(!document.querySelector('.chat-earlier-tasks'), 'the absolute top hides the earlier-steps hint when no row is above it');

  await show('empty');
  const list = listNode();
  list.scrollTop = 0;
  list.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true }));
  list.dispatchEvent(new Event('scroll', { bubbles: true }));
  await sleep(250);
  check(scenario.calls === 1, 'an actual upward wheel at the top still starts one page');

  await show('error');
  await jumpTop();
  await waitFor(() => document.querySelector('.chat-earlier-tasks button'));
  await sleep(250);
  check(scenario.calls === 1, 'request failure does not auto-retry');
  scenario.fail = false;
  document.querySelector('.chat-earlier-tasks button').click();
  await waitFor(() => scenario.calls === 2 && !document.querySelector('.chat-earlier-tasks button'));
  check(scenario.calls === 2 && scenario.pages[0].join() === scenario.pages[1].join(),
    'explicit retry repeats the same visible slice instead of paging the rest of the queue');

  // 搜索时同样不挂那条文案；搜索计数也不应该因为“还有下游待补水任务”就永远停在
  // “Searching…”（正文早已在 DOM 里，缺的是执行记录，和搜索命中无关）。
  await show('pages');
  await jumpTop();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', metaKey: true, bubbles: true }));
  await waitFor(() => document.querySelector('[aria-label="Find in conversation"]'));
  const searchInput = document.querySelector('[aria-label="Find in conversation"]');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(searchInput, 'Question 7');
  searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  await waitFor(() => /\d+ \/ \d+/.test(document.querySelector('.haish-search-count')?.textContent || ''));
  check(!document.querySelector('.chat-earlier-tasks'), 'search does not resurrect the earlier-steps copy');
  const searchCount = document.querySelector('.haish-search-count')?.textContent || '';
  check(/\d+ \/ \d+/.test(searchCount), `a pending queue outside the viewport does not block a real search match (${searchCount})`);
  searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(120);
  check(window.__pageErrors.length === 0, 'no page errors or unhandled rejections');
  document.title = `${results.every((result) => result.pass) ? 'PASS' : 'FAIL'}: ${results.length} earlier-step checks`;
  return results;
};
show();
