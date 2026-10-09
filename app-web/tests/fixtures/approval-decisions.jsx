import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ApprovalInline } from '../../src/features/approvals/components/ApprovalOverlay.jsx';
import { approvalStore } from '../../src/features/approvals/model/approval-store.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

let emit;
const decisions = [];
window.haish = {
  onApprovalEvent(callback) { emit = callback; return () => {}; },
  async resolveApproval(kind, id, payload) { decisions.push([kind, id, payload.decision]); },
};
approvalStore.start();
const root = createRoot(document.getElementById('root'));
flushSync(() => root.render(<AppTooltipProvider><ApprovalInline conversationId="a" /></AppTooltipProvider>));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const check = (ok, label) => results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
function request(id, conversationId = 'a') {
  emit({ type: 'approval_requested', request_id: id, conversation_id: conversationId,
    tool_name: 'read_file', raw_command: 'read_file: /tmp/Haish (Dev)/notes.txt',
    risk_code: 'read_outside_workspace', suggested_pattern: 'Read(/tmp/Haish (Dev)/notes.txt)', allow_always: true });
}
async function run() {
  request('hidden', 'b');
  await sleep(50);
  check(!document.querySelector('.haish-approval-btn-once'), 'Other conversation approval does not appear');
  for (const [id, selector, decision] of [
    ['once', '.haish-approval-btn-once', 'allow_once'],
    ['remember', '.haish-approval-btn-always', 'allow_always'],
  ]) {
    request(id);
    await sleep(450);
    const button = document.querySelector(selector);
    const box = button.getBoundingClientRect();
    check(button.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)), `${id}: button is reachable`);
    button.click();
    await sleep(50);
    check(decisions.at(-1)?.join(',') === ['tool', id, decision].join(','), `${id}: sends the correct approval decision`);
    check(!document.querySelector('.haish-approval-btn-once'), `${id}: resolved approval disappears`);
  }
}
run().catch(error => check(false, error.message)).finally(() => {
  document.getElementById('checks').textContent = results.join('\n');
  document.getElementById('checks').dataset.result = results.some(row => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
