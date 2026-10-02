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
window.fetch = async (url, options) => {
  if (String(url).endsWith('/api/approvals/mode')) {
    posts.push(JSON.parse(options.body).mode);
    return Response.json({ ok: true });
  }
  return nativeFetch(url, options);
};
const root = createRoot(document.getElementById('root'));
const render = (width, readOnly = false, workflow = false) => flushSync(() => root.render(
  <AppTooltipProvider><div className="stage">
    <aside className="fixture-sidebar">Conversation list</aside>
    <div className="fixture-workspace" style={{ width, position: 'relative' }}>
      <div className={workflow ? 'workflow-composer-dock' : 'fixture-chat-dock'}>
        <div className="chat-composer"><div className="chat-composer-input-row">Describe your task…</div>
          <div className="chat-composer-actions"><div className="chat-composer-tools"><ApprovalModePicker readOnly={readOnly} /></div></div>
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
  emit({ type: 'approval_mode_changed', mode: 'full' });
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
  options()[0].click();
  await sleep(30);
  check(posts.length === 0 && options().length === 0, 'Read-only mode still prevents updates');
  render(360);
  trigger().click();
  await sleep(280);
  options()[0].click();
  await sleep(30);
  check(posts.length === 1 && posts[0] === 'strict', 'Selecting Request Approval preserves mode update behavior');
  trigger().click();
  await sleep(280);
  check(inside() && reachable(), 'Menu remains bounded after changing current mode');
  document.querySelector('.fixture-sidebar').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await sleep(30);
  check(options().length === 0, 'Clicking outside closes menu');
  check(errors.length === 0, 'No page errors');
}
run().catch(error => check(false, error.message)).finally(() => {
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some(row => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
