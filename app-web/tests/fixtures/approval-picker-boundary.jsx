import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ApprovalModePicker } from '../../src/features/chat/components/ModelPickers.jsx';
import { approvalStore } from '../../src/features/approvals/model/approval-store.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

const errors = [];
window.addEventListener('error', event => errors.push(event.message));
let emit;
window.haish = { onApprovalEvent: callback => { emit = callback; return () => {}; } };
approvalStore.start();
const nativeFetch = window.fetch;
const posts = [];
const modes = new Map([['fixture-conversation', 'full'], ['other-conversation', 'full']]);
let failNext = false;
let ensureCalls = 0;
window.fetch = async (url, options) => {
  if (String(url).includes('/api/approvals/state')) {
    const id = new URL(String(url), window.location.href).searchParams.get('conversation_id');
    return Response.json({ mode: modes.get(id) || 'full' });
  }
  if (String(url).endsWith('/api/approvals/mode')) {
    const body = JSON.parse(options.body);
    posts.push(body);
    if (failNext) { failNext = false; return new Response('', { status: 500 }); }
    modes.set(body.conversation_id, body.mode);
    return Response.json({ ok: true, ...body });
  }
  return nativeFetch(url, options);
};
const root = createRoot(document.getElementById('root'));
const render = (width, readOnly = false, workflow = false, conversationId = 'fixture-conversation', draft = false) => flushSync(() => root.render(
  <AppTooltipProvider><div className="stage">
    <aside className="fixture-sidebar">Conversation list</aside>
    <div className="fixture-workspace" style={{ width, position: 'relative' }}>
      <div className={workflow ? 'workflow-composer-dock' : 'fixture-chat-dock'}>
        <div className="chat-composer"><div className="chat-composer-input-row">Describe your task…</div>
          <div className="chat-composer-actions"><div className="chat-composer-tools"><ApprovalModePicker key={conversationId} conversationId={conversationId} readOnly={readOnly} draft={draft}
            ensureConversation={async () => { ensureCalls++; return { conversation_id: 'created-conversation' }; }} /></div></div>
        </div>
      </div>
    </div>
  </div></AppTooltipProvider>,
));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const check = (ok, label) => results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
const trigger = () => document.querySelector('.approval-mode-trigger');
const options = () => [...document.querySelectorAll('.approval-mode-option')];
function inside() {
  const workspace = document.querySelector('.fixture-workspace').getBoundingClientRect();
  return options().length === 2 && options().every(button => {
    const box = button.getBoundingClientRect();
    return box.left >= workspace.left && box.right <= workspace.right && box.top >= workspace.top && box.bottom <= workspace.bottom;
  });
}
function reachable() {
  return options().every(button => {
    const box = button.getBoundingClientRect();
    return [0.2, 0.5, 0.8].every(fraction => button.contains(document.elementFromPoint(box.left + box.width * fraction, box.top + box.height / 2)));
  });
}
async function run() {
  render(360);
  emit({ type: 'approval_mode_changed', conversation_id: 'fixture-conversation', mode: 'full' });
  await sleep(50);
  for (const workflow of [false, true]) {
    for (const width of [240, 360, 640]) {
      render(width, false, workflow);
      const closed = trigger().getBoundingClientRect();
      const tools = document.querySelector('.chat-composer-tools').getBoundingClientRect();
      check(Math.abs(closed.left - tools.left) < 1, 'Closed picker has no extra left-side empty slot');
      trigger().click();
      await sleep(60);
      check(inside(), `${workflow ? 'Workflow' : 'Chat'} ${width}px: opening animation remains inside workspace`);
      await sleep(260);
      check(inside() && reachable(), `${width}px: both option circles fully visible and not covered by sidebar`);
      const a = trigger().getBoundingClientRect();
      check(Math.abs(a.left - closed.left - 8) < 1, 'Expanded group moves only 8px without reserving toolbar space');
      const [left, right] = options().map(button => button.getBoundingClientRect());
      const center = box => box.left + box.width / 2;
      check(Math.abs(center(a) - (center(left) + center(right)) / 2) < 1 && center(left) < center(a) && center(a) < center(right), 'Full Access stays centered between the two symmetric upper options');
      check(Math.abs(left.top - right.top) < 1, 'Upper options retain the same height');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await sleep(30);
      check(options().length === 0, 'Escape closes menu');
    }
  }
  render(360, true);
  trigger().click();
  await sleep(280);
  check(trigger().disabled && posts.length === 0 && options().length === 0, 'Read-only picker is visibly disabled, not a clickable no-op');
  render(360);
  trigger().click();
  await sleep(280);
  options()[0].click();
  await sleep(30);
  check(posts.length === 1 && posts[0].mode === 'strict' && posts[0].conversation_id === 'fixture-conversation', 'Selecting Request Approval sends the owning conversation');
  trigger().click();
  await sleep(280);
  check(inside() && reachable(), 'Menu remains bounded after changing current mode');
  document.querySelector('.fixture-sidebar').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await sleep(30);
  check(options().length === 0, 'Clicking outside closes menu');
  trigger().click();
  await sleep(280);
  options().find(button => button.getAttribute('aria-label').startsWith('Auto Approve')).click();
  await sleep(30);
  check(posts.at(-1).mode === 'smart' && trigger().getAttribute('aria-label').startsWith('Auto Approve'), 'Smart button updates current mode');
  render(360, false, false, 'other-conversation');
  await sleep(50);
  check(trigger().getAttribute('aria-label').startsWith('Full Access'), 'Other conversation remains Full Access');
  render(360);
  await sleep(50);
  check(trigger().getAttribute('aria-label').startsWith('Auto Approve'), 'Switching back restores this conversation mode');
  failNext = true;
  trigger().click();
  await sleep(280);
  options()[0].click();
  await sleep(30);
  check(trigger().getAttribute('aria-label').startsWith('Auto Approve') && Boolean(document.querySelector('[role="alert"]')), 'Failure is visible and selection rolls back');
  render(360, false, false, 'draft-local', true);
  await sleep(50);
  trigger().click();
  await sleep(280);
  options()[0].click();
  await sleep(30);
  check(ensureCalls === 1 && posts.at(-1).conversation_id === 'created-conversation', 'New chat creates its own conversation before saving mode');
  check(errors.length === 0, 'No page errors');
}
run().catch(error => check(false, error.message)).finally(() => {
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some(row => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
