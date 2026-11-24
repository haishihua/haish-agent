import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ApprovalModePicker } from '../../src/features/chat/components/ModelPickers.jsx';
import { approvalStore } from '../../src/core/approval-store.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

const errors = [];
window.addEventListener('error', event => errors.push(event.message));
window.haish = { onApprovalEvent: () => () => {} };
approvalStore.start();
const nativeFetch = window.fetch;
const posts = [];
const modes = new Map([['fixture-conversation', 'full'], ['other-conversation', 'full'], ['left-edge-conversation', 'strict']]);
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
const options = () => [...document.querySelectorAll('.approval-mode-segments [role="tab"]')];
const selected = () => options().find(button => button.getAttribute('aria-selected') === 'true')?.ariaLabel;
const icon = () => options()[2]?.querySelector(options()[2].ariaSelected === 'true' ? '.dissolve-segmented-on [data-approval-icon]' : '.dissolve-segmented-off [data-approval-icon]')?.dataset.approvalIcon;
async function run() {
  for (const workflow of [false, true]) {
    for (const width of [240, 360, 640]) {
      render(width, false, workflow);
      await sleep(70);
      const workspace = document.querySelector('.fixture-workspace').getBoundingClientRect();
      const boxes = options().map(button => button.getBoundingClientRect());
      check(boxes.length === 3 && boxes.every(box => box.left >= workspace.left && box.right <= workspace.right && Math.abs(box.top - boxes[0].top) < 1), `${workflow ? 'Workflow' : 'Chat'} ${width}px: three segments in one row`);
    }
  }
  const edgeGap = (side) => {
    const host = document.querySelector('.approval-mode-segments');
    const pill = host.querySelectorAll('.dissolve-segmented-pill')[1];
    return Math.abs(host.getBoundingClientRect()[side] - pill.getBoundingClientRect()[side]);
  };
  check(selected() === 'Full Access' && icon() === 'unlocked', 'Selected Full Access is unlocked');
  check(Math.abs(edgeGap('right') - 2) < .1, 'Full Access uses the original 2px right inset');
  render(640, false, true, 'left-edge-conversation'); await sleep(70);
  check(selected() === 'Request Approval' && Math.abs(edgeGap('left') - 2) < .1, 'Request Approval uses the original 2px left inset');
  render(640, false, true); await sleep(70);
  options()[1].click(); await sleep(50);
  check(posts.at(-1).mode === 'smart' && selected() === 'Auto Approve' && icon() === 'locked', 'Auto Approve saves and Full Access locks');
  failNext = true;
  options()[2].click(); await sleep(50);
  check(selected() === 'Auto Approve' && icon() === 'locked' && document.querySelector('[role="alert"]'), 'Failed change rolls back with an error');
  render(360, true);
  check(options().every(button => button.disabled), 'Read-only disables all segments');
  render(360, false, true, 'other-conversation'); await sleep(70);
  check(selected() === 'Full Access', 'Other conversation remains Full Access');
  render(360, false, false, 'draft-conversation', true); await sleep(70);
  options()[0].click(); await sleep(50);
  check(ensureCalls === 1 && posts.at(-1).conversation_id === 'created-conversation', 'Draft creates its own conversation before saving');
  check(errors.length === 0, 'No page errors');
}
run().catch(error => check(false, error.message)).finally(() => {
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some(row => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
