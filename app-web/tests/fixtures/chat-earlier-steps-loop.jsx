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
    onLoadEarlierTasks={async () => {
      const request = current;
      request.calls += 1;
      const ids = request.ids.slice(-3);
      request.pages.push(ids);
      await sleep(60);
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
const jumpTop = async () => {
  document.querySelector('.conversation-map-tick').click();
  await waitFor(() => document.querySelector('[data-message-id="loop-user-0"]'));
  await sleep(250);
};
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

  await show('pages');
  await jumpTop();
  await waitFor(() => !scenario.pending && !document.querySelector('.chat-earlier-tasks'));
  check(scenario.calls === 8 && new Set(scenario.pages.flat()).size === 23,
    'real page progress continues until all 23 historical task ids load exactly once');
  const doneCalls = scenario.calls;
  await sleep(500);
  listNode().dispatchEvent(new Event('scroll', { bubbles: true }));
  await sleep(100);
  check(scenario.calls === doneCalls, 'an exhausted conversation never fetches another page');

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
  await waitFor(() => !scenario.pending && !document.querySelector('.chat-earlier-tasks'));
  check(scenario.calls === 9, 'explicit retry is allowed, followed by the remaining legitimate pages');
  check(window.__pageErrors.length === 0, 'no page errors or unhandled rejections');
  document.title = `${results.every((result) => result.pass) ? 'PASS' : 'FAIL'}: ${results.length} earlier-step checks`;
  return results;
};
show();
