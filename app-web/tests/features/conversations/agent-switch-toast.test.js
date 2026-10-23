import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createConversationRuntime } from '../../../src/features/conversations/hooks/createConversationRuntime.js';
import { appShellSource } from '../../helpers/shell-source.js';

const read = (path) => readFileSync(new URL(`../../../src/${path}`, import.meta.url), 'utf8');
const hook = read('features/conversations/hooks/useConversationRunConfig.js');
const composer = read('features/chat/components/ChatComposer.jsx');
const panel = read('features/chat/components/ChatPanel.jsx');
const shell = appShellSource();

test('Agent-switch impact feedback is an info toast emitted only after the save succeeds', () => {
  const save = hook.indexOf('await sync.flush(serverId, scopeId)');
  const ownerCheck = hook.indexOf('if (ownerRef.current !== owner || !mountedRef.current)', save);
  const feedback = hook.indexOf("currentRef.current.onToast?.('info', 'Agent switched.");
  assert.ok(save >= 0 && ownerCheck > save && feedback > ownerCheck);
  assert.match(hook, /onToast\?\.\('info', 'Agent switched\. Future tasks will use the new Agent\.'\)/);
  assert.match(hook, /currentRef\.current\.hasSentMessage && before\?\.agent_id && before\.agent_id !== saved\.agent_id/);
  assert.equal(hook.includes('setNotice'), false);
  assert.equal(composer.includes('configSync.notice'), false);
  assert.equal(composer.includes('Agent switched.'), false);
});

test('Agent-switch failures use the shared error toast while retaining the guarded save error', () => {
  const changeAgent = hook.slice(hook.indexOf('changeAgent: async'));
  assert.match(changeAgent, /return await persist/);
  assert.match(changeAgent, /if \(mountedRef\.current && ownerRef\.current === owner\) currentRef\.current\.onToast\?\.\('error', failure\.message\)/);
  assert.match(changeAgent, /throw failure;/);
  assert.match(hook, /setError\(failure\.message\);\s+if \(mountedRef\.current && !switching\) currentRef\.current\.onToast/);
  assert.match(hook, /return \(\) => \{ mountedRef\.current = false; \};/);
  assert.equal(composer.includes('setPathNotice(configSync.error)'), false);
  const pickerChange = composer.slice(composer.indexOf('async function changeAgent'), composer.indexOf("React.useEffect(() => { if (executionMode === 'bot')"));
  assert.equal(pickerChange.includes('setPathNotice'), false);
});

test('both composer entry points pass the existing app toast through explicit props', () => {
  const chatPanel = shell.slice(shell.indexOf('<ChatPanel'), shell.indexOf('/>', shell.indexOf('<ChatPanel')));
  const botComposer = shell.slice(shell.indexOf('composer={<ChatComposer'), shell.indexOf('/>}', shell.indexOf('composer={<ChatComposer')));
  assert.match(chatPanel, /onToast=\{showToast\}/);
  assert.match(botComposer, /onToast=\{showToast\}/);
  assert.match(panel.slice(panel.indexOf('<ChatComposer')), /onToast=\{onToast\}/);
  assert.match(composer.slice(composer.indexOf('useConversationRunConfig({'), composer.indexOf('async function changeAgent')), /\bonToast,/);
});

test('Agent-switch toast reuses the shared expiry rather than leaving a persistent message', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let toasts = [];
  const { showToast } = createConversationRuntime({
    toastTimerRef: { current: null },
    setToast: (next) => { toasts = typeof next === 'function' ? next(toasts) : next; },
  });
  showToast('info', 'Agent switched.');
  assert.deepEqual(toasts.map((toast) => toast.kind), ['info']);
  t.mock.timers.tick(3199);
  assert.equal(toasts[0].message, 'Agent switched.');
  t.mock.timers.tick(1);
  assert.deepEqual(toasts, []);
});

test('The toast stack holds three bubbles, refreshes duplicates in place and expires each on its own clock', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let toasts = [];
  let writes = 0;
  const toastTimerRef = { current: null };
  const { showToast } = createConversationRuntime({
    toastTimerRef,
    setToast: (next) => { writes += 1; toasts = typeof next === 'function' ? next(toasts) : next; },
  });
  const messages = () => toasts.map((toast) => toast.message);

  showToast('info', 'first');
  t.mock.timers.tick(1000);
  showToast('warn', 'second');
  showToast('error', 'third');
  // 第四条只把最旧的一条挤出去，不会盖掉另外两条。
  showToast('success', 'fourth');
  assert.deepEqual(messages(), ['second', 'third', 'fourth']);
  assert.equal(toasts.length, 3, 'the stack never shows more than three bubbles');

  t.mock.timers.tick(500);
  // 同 kind+message 不叠第二条：保持原位置，只把它的 3200ms 重新计时。
  showToast('warn', 'second');
  assert.deepEqual(messages(), ['second', 'third', 'fourth']);

  // 被挤掉的 first 计时器必须真的被清掉：它到期时不能往队列里写一次。
  const writesBeforeEvictedExpiry = writes;
  t.mock.timers.tick(1700); // t = 3200
  assert.equal(writes, writesBeforeEvictedExpiry, 'the evicted bubble stops touching the queue');
  assert.deepEqual(messages(), ['second', 'third', 'fourth']);

  t.mock.timers.tick(1000); // t = 4200：third / fourth 一起到期，second 因刷新还在
  assert.deepEqual(messages(), ['second']);

  t.mock.timers.tick(500); // t = 4700：刷新后的 second 到期
  assert.deepEqual(messages(), []);
  assert.equal(toastTimerRef.current.size, 0, 'the timer registry releases every entry');
});

test('A refreshed bubble is not the one an overflowing stack drops', (t) => {
  // 淘汰按「最早到期」判：夹具必须同时控住 Date，否则同一秒内的几条会并列成同分。
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let toasts = [];
  const { showToast } = createConversationRuntime({
    toastTimerRef: { current: null },
    setToast: (next) => { toasts = typeof next === 'function' ? next(toasts) : next; },
  });
  const messages = () => toasts.map((toast) => toast.message);

  showToast('warn', 'avatar');
  t.mock.timers.tick(400);
  showToast('warn', 'quota');
  t.mock.timers.tick(400);
  showToast('warn', 'network');
  t.mock.timers.tick(400);
  // 用户又触发了一次最早的 avatar：它到期时间最晚，不该因为「插入最早」被挤掉。
  showToast('warn', 'avatar');
  showToast('warn', 'clipboard');

  assert.deepEqual(messages(), ['avatar', 'network', 'clipboard'],
    'eviction targets the earliest expiry, so a just-refreshed hint stays on screen');
});
