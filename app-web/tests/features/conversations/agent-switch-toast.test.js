import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createConversationRuntime } from '../../../src/features/conversations/hooks/createConversationRuntime.js';

const read = (path) => readFileSync(new URL(`../../../src/${path}`, import.meta.url), 'utf8');
const hook = read('features/conversations/hooks/useConversationRunConfig.js');
const composer = read('features/chat/components/ChatComposer.jsx');
const panel = read('features/chat/components/ChatPanel.jsx');
const shell = read('features/app/AppShell.jsx');

test('Agent-switch impact feedback is an info toast emitted only after the save succeeds', () => {
  const save = hook.indexOf('await sync.flush(serverId, scopeId)');
  const ownerCheck = hook.indexOf('if (ownerRef.current !== owner)', save);
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
  let toast = null;
  const { showToast } = createConversationRuntime({
    toastTimerRef: { current: null },
    setToast: (next) => { toast = typeof next === 'function' ? next(toast) : next; },
  });
  showToast('info', 'Agent switched.');
  assert.equal(toast.kind, 'info');
  t.mock.timers.tick(3199);
  assert.equal(toast.message, 'Agent switched.');
  t.mock.timers.tick(1);
  assert.equal(toast, null);
});
