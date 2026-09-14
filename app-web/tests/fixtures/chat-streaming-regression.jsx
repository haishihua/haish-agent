import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { MessageAnnotations } from '../../src/features/chat/components/MessageAnnotations.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/chat.css';

const checks = [];
const report = document.getElementById('checks');
const check = (condition, name) => {
  if (!condition) throw new Error(name);
  checks.push(`PASS ${name}`);
  report.textContent = checks.join('\n');
};
const tick = async () => {
  // Drain React effects, observer callbacks and their coalesced layout frame.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  await new Promise((resolve) => setTimeout(resolve, 20));
};
const root = createRoot(document.getElementById('root'));
const render = (content) => flushSync(() => root.render(<AppTooltipProvider>{content}</AppTooltipProvider>));
const STREAM_BATCH_COUNT = 30;
const HISTORY_ROWS = 60;
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

async function checkRows() {
  let historyReads = 0;
  const history = Array.from({ length: HISTORY_ROWS }, (_, index) => ({
    id: `answer-${index}`, messageId: `saved-${index}`, taskId: `task-${index}`,
    role: 'agent', status: 'done',
    // Reading this production row's content detects actual body renders, not
    // parent renders or React.memo comparisons (no component copies/mocks).
    get text() { historyReads += 1; return `Historical answer ${index}`; },
  }));
  const calls = [];
  let version = 0;
  let model = 'fixture-model-a';
  let includeComments = false;
  let latest = { id: 'live', taskId: 'live-task', role: 'agent', status: 'running', streaming: true, text: '' };
  const draw = () => {
    const committedVersion = version;
    const comments = includeComments ? [{ id: 'comment-user', messageId: 'saved-comment-user', role: 'user', status: 'done', text: '', annotations: [{
      id: 'old-quote', source_message_id: 'saved-0', text: 'Historical', comment: 'Keep this', start: 0, end: 10, prefix: '', suffix: '',
    }] }] : [];
    render(<ChatPanel conversationId="streaming-regression" messages={[...history, ...comments, latest]} running={latest.streaming}
      providerOptions={[{ id: 'fixture', provider: 'fixture', defaultModelId: model, modelOptions: [model] }]}
      onForkMessage={(message) => { calls.push(['fork', committedVersion, message.id]); return true; }}
      onRetryTask={(taskId) => { calls.push(['retry', committedVersion, taskId]); return true; }}
      onEditMessage={(taskId, text, config) => { calls.push(['edit', committedVersion, taskId, text, config]); return true; }} />);
  };
  draw();
  await tick();
  await tick();
  const baseline = historyReads;
  check(baseline > 0, 'Historical production message bodies rendered initially');
  for (let batch = 0; batch < STREAM_BATCH_COUNT; batch += 1) {
    version += 1;
    latest = { ...latest, text: `Streaming delta ${batch}` };
    draw();
    await tick();
  }
  check(historyReads === baseline, `${HISTORY_ROWS} historical rows: zero body renders across ${STREAM_BATCH_COUNT} stream batches`);
  includeComments = true;
  draw();
  await tick();
  const commentBaseline = historyReads;
  for (let batch = 0; batch < STREAM_BATCH_COUNT; batch += 1) {
    version += 1;
    latest = { ...latest, text: `Commented stream delta ${batch}` };
    draw();
    await tick();
  }
  check(historyReads === commentBaseline, 'Equivalent comment snapshots also keep all historical answer bodies cached');
  document.querySelector('[aria-label="Branch into new chat"]').click();
  await tick();
  check(JSON.stringify(calls.at(-1)) === JSON.stringify(['fork', version, history[0].id]), 'Memoized fork uses the latest handler and the selected message');

  latest = { ...latest, status: 'failed', streaming: false, text: 'Offline failure' };
  version += 1;
  draw();
  await tick();
  [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Retry').click();
  await tick();
  check(JSON.stringify(calls.at(-1)) === JSON.stringify(['retry', version, 'live-task']), 'Retry still routes to the latest failed task');

  latest = { ...latest, role: 'user', status: 'cancelled', text: 'Edit this instruction' };
  draw();
  await tick();
  document.querySelector('[aria-label="Edit message"]').click();
  await tick();
  model = 'fixture-model-b';
  version += 1;
  draw();
  await tick();
  await tick();
  const send = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Send' && button.closest('.message-speech-body'));
  check(Boolean(send), 'Inline message editor remains available after cancellation');
  send.click();
  await tick();
  check(calls.at(-1)?.[0] === 'edit' && calls.at(-1)[1] === version && calls.at(-1)[2] === 'live-task'
    && calls.at(-1)[4].modelId === model, 'Editing an already-open row uses the latest model and handler');
  render(null);
  await tick();
}

async function checkAnnotationWork() {
  const host = document.createElement('div');
  host.id = 'annotation-host';
  const before = document.createElement('div');
  const source = document.createElement('p');
  source.dataset.annotationSource = 'quoted-answer';
  source.textContent = 'A gray background and blue text.';
  const after = document.createElement('div');
  after.textContent = 'new answer';
  const spacer = document.createElement('div');
  spacer.style.height = '500px';
  host.append(before, source, after, spacer);
  document.body.append(host);
  const listRef = { current: host };
  const nativeWalk = document.createTreeWalker;
  const nativeRects = Range.prototype.getClientRects;
  const NativeObserver = window.MutationObserver;
  let walks = 0;
  let measurements = 0;
  let observations = 0;
  document.createTreeWalker = function (node, ...args) {
    if (node.dataset?.annotationSource === 'quoted-answer') walks += 1;
    return nativeWalk.call(this, node, ...args);
  };
  Range.prototype.getClientRects = function () { measurements += 1; return nativeRects.call(this); };
  window.MutationObserver = class extends NativeObserver {
    observe(target, options) { if (target === host) observations += 1; return super.observe(target, options); }
  };
  const quotes = ['gray', 'blue'].map((text, index) => ({
    id: `quote-${index}`, source_message_id: 'quoted-answer', text, comment: '',
    start: source.textContent.indexOf(text), end: source.textContent.indexOf(text) + text.length, prefix: '', suffix: '',
  }));
  const draw = (drafts) => render(<MessageAnnotations listRef={listRef} drafts={drafts}
    items={drafts.map((item, index) => ({ item, index: index + 1, key: item.id }))} onSave={() => true} onError={() => {}} />);
  try {
    draw([]);
    await tick();
    after.firstChild.data += ' delta';
    await tick();
    check(observations === 0 && walks === 0 && measurements === 0, 'No comments: no marker observer, text traversal or range measurement');
    const selection = window.getSelection();
    const selected = document.createRange();
    selected.setStart(source.firstChild, quotes[0].start);
    selected.setEnd(source.firstChild, quotes[0].end);
    selection.removeAllRanges(); selection.addRange(selected);
    source.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    await tick();
    check(Boolean(document.querySelector('[aria-label="Selected text"] button')), 'Empty marker fast path still permits adding the first comment');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    selection.removeAllRanges();
    await tick();
    walks = 0;
    draw(quotes);
    await tick();
    check(walks === 1, 'Multiple quotes in one answer share one DOM text traversal');
    check(document.querySelectorAll('.haish-annotation-marker').length === 2, 'Both comment markers are visible');
    const baseline = { walks, measurements, observations };
    for (let batch = 0; batch < STREAM_BATCH_COUNT; batch += 1) {
      after.firstChild.data += ' delta';
      await tick();
    }
    check(walks === baseline.walks && measurements === baseline.measurements && observations === baseline.observations,
      'Unrelated streaming output does not re-find, re-measure or re-register old quotes');
    const markerTop = () => parseFloat(document.querySelector('.haish-annotation-marker').style.top);
    const top = markerTop();
    before.append(document.createElement('br'), document.createTextNode('An earlier row expanded'));
    await tick();
    check(markerTop() > top && walks === baseline.walks, 'Earlier content reflow moves markers without traversing quoted text');
    const shiftedTop = markerTop();
    host.scrollTop = 10;
    await tick();
    check(Math.abs(markerTop() - shiftedTop + 10) < 1 && walks === baseline.walks, 'Scroll only updates marker geometry');
    window.dispatchEvent(new Event('resize'));
    source.dispatchEvent(new Event('load'));
    document.fonts?.dispatchEvent(new Event('loadingdone'));
    await tick();
    check(walks === baseline.walks, 'Resize, image and font notifications reuse text ranges');
    source.textContent = 'New prefix. A gray background and blue text.';
    await tick();
    check(walks === baseline.walks + 1, 'Replacing source text re-resolves its quotes exactly once');
    const highlights = globalThis.CSS?.highlights?.get('message-annotations');
    if (highlights) check([...highlights].map((range) => range.toString()).join(',') === 'gray,blue', 'Replaced DOM has fresh ranges pointing to the correct text');
    source.remove();
    await tick();
    check(document.querySelectorAll('.haish-annotation-marker').length === 0, 'Removing a source clears stale markers');
    const replacement = source.cloneNode(true);
    before.after(replacement);
    await tick();
    check(document.querySelectorAll('.haish-annotation-marker').length === 2, 'A remounted history source restores its markers');
    replacement.removeAttribute('data-annotation-source');
    await tick();
    check(document.querySelectorAll('.haish-annotation-marker').length === 0, 'Ineligible source identity invalidates old ranges');
    replacement.dataset.annotationSource = 'quoted-answer';
    await tick();
    check(document.querySelectorAll('.haish-annotation-marker').length === 2, 'Restored source identity is rebound');
    draw([{ ...quotes[0], comment: 'Updated comment' }]);
    await tick();
    check(document.querySelector('.haish-annotation-marker')?.title === 'Updated comment', 'Changing comments updates marker content');
    draw([]);
    await tick();
    check(document.querySelectorAll('.haish-annotation-marker').length === 0 && !globalThis.CSS?.highlights?.has('message-annotations'), 'Removing the last comment clears markers and highlights');
  } finally {
    render(null);
    document.createTreeWalker = nativeWalk;
    Range.prototype.getClientRects = nativeRects;
    window.MutationObserver = NativeObserver;
    host.remove();
  }
}

async function checkEarlierSteps(mode) {
  const TURN_COUNT = 15;
  const PAGE_SIZE = 3;
  let messages = Array.from({ length: TURN_COUNT }, (_, index) => ({
    id: `paged-${index}`, taskId: `paged-${index}`, messageId: `saved-paged-${index}`,
    role: 'agent', status: 'done', text: `Answer ${index}`,
    traceHydrated: index >= TURN_COUNT - PAGE_SIZE,
  }));
  let calls = 0;
  const draw = () => render(<ChatPanel conversationId="paging-regression" messages={messages}
    earlierTaskRuntimesPending={messages.some((message) => !message.traceHydrated)}
    onLoadEarlierTasks={async () => {
      calls += 1;
      await tick();
      const nextIds = messages.filter((message) => !message.traceHydrated).slice(-PAGE_SIZE).map((message) => message.id);
      messages = messages.map((message) => nextIds.includes(message.id) ? {
        ...message, traceHydrated: true, traceTimeline: [{ kind: 'text', id: `${message.id}-step`, text: `historical-step-needle-${message.id}` }],
      } : message);
      draw();
    }} />);
  draw();
  await tick();
  await tick();
  const list = document.querySelector('.chat-message-list');
  list.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
  if (mode === 'search') {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
    await tick();
    const input = document.querySelector('[aria-label="Find in conversation"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'historical-step-needle-paged-0');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    const target = document.querySelector('[data-message-id="paged-8"]');
    list.scrollTop = mode === 'top' ? 0 : target.offsetTop - list.offsetTop;
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  }
  for (let page = 0; page < TURN_COUNT / PAGE_SIZE + 2; page += 1) await tick();
  if (mode === 'top') {
    check(calls > 1 && messages[0].traceHydrated, 'Jumping to the oldest turn continues paging while its steps are still visible');
  } else if (mode === 'visible') {
    check(list.scrollTop > 160 && messages[8].traceHydrated, 'Visible older steps load without requiring a scroll to the absolute top');
  } else {
    check(messages.every((message) => message.traceHydrated)
      && document.querySelector('.haish-search-count')?.textContent === '1 / 1'
      && document.querySelector('.haish-search-match-preview mark')?.textContent === 'historical-step-needle-paged-0',
    'Search hydrates all older steps and finds a keyword absent from every summary');
  }
  render(null);
  await tick();
}

async function checkPagingRecovery() {
  let calls = 0;
  let fail = true;
  let pending = true;
  const draw = () => render(<ChatPanel conversationId="paging-recovery"
    messages={[{ id: 'recovery', role: 'agent', text: 'Earlier answer', status: 'done', traceHydrated: !pending }]}
    earlierTaskRuntimesPending={pending} onLoadEarlierTasks={async () => {
      calls += 1;
      if (fail) throw new Error('Offline');
      pending = false;
      draw();
    }} />);
  draw();
  for (let frame = 0; frame < 5; frame += 1) await tick();
  const retry = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Retry loading steps');
  check(calls === 1 && retry, 'A failed page stops automatic requests and exposes an explicit retry');
  fail = false;
  retry.click();
  await tick();
  check(calls === 2 && !document.querySelector('[data-trace-pending]'), 'Retry loads the failed page without losing the answer');
  render(null);
  await tick();

  const completions = new Map();
  const hydrate = (id) => new Promise((resolve) => completions.set(id, resolve));
  const show = (id, pending = true) => render(<ChatPanel conversationId={id}
    messages={[{ id, role: 'agent', text: id, status: 'done', traceHydrated: !pending }]}
    earlierTaskRuntimesPending={pending} onLoadEarlierTasks={hydrate} />);
  show('slow-conversation');
  await tick();
  show('next-conversation');
  await tick();
  check(completions.size === 2, 'Switching conversations does not wait for the previous page request');
  completions.get('slow-conversation')();
  await tick();
  check(document.querySelector('.chat-earlier-tasks')?.textContent === 'Loading earlier steps…',
    'A late completion cannot clear the new conversation loading state');
  show('next-conversation', false);
  completions.get('next-conversation')();
  await tick();
  render(null);
  await tick();

  const returningRequests = [];
  const showReturning = (id, pending = true) => render(<ChatPanel conversationId={id}
    messages={[{ id, role: 'agent', text: id, status: 'done', traceHydrated: !pending }]}
    earlierTaskRuntimesPending={pending}
    onLoadEarlierTasks={() => new Promise((resolve) => returningRequests.push(resolve))} />);
  showReturning('returning-conversation');
  await tick();
  showReturning('empty-conversation', false);
  await tick();
  showReturning('returning-conversation');
  await tick();
  check(returningRequests.length === 2, 'Returning to the same conversation starts a fresh activation without waiting for its stale request');
  showReturning('returning-conversation', false);
  returningRequests.forEach((resolve) => resolve());
  await tick();
  render(null);
  await tick();
}

(async () => {
  try {
    await document.fonts.ready;
    await checkRows();
    await checkAnnotationWork();
    for (const mode of ['top', 'visible', 'search']) await checkEarlierSteps(mode);
    await checkPagingRecovery();
    report.dataset.result = 'PASS';
    document.title = `PASS: ${checks.length} chat streaming checks`;
  } catch (error) {
    report.dataset.result = 'FAIL';
    document.title = `FAIL: ${error.message}`;
    report.textContent = [...checks, `FAIL ${error.message}\n${error.stack || ''}`].join('\n');
  } finally {
    root.unmount();
    window.fetch = originalFetch;
    if (previousModelCache === null) localStorage.removeItem(modelCacheKey);
    else localStorage.setItem(modelCacheKey, previousModelCache);
  }
})();
