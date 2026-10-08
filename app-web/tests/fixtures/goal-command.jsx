import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/chat.css';

const calls = [], results = [], errors = [];
window.addEventListener('error', (event) => errors.push(event.message));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (ok, label) => results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
let accept = true, ordinary = 0, api;
const sourceProviders = [{ id: 'source', requestProvider: 'custom.source', provider: 'openai', label: 'Source Provider', defaultModelId: 'gpt-5.5', modelOptions: [{ id: 'gpt-5.5' }] }];
window.fetch = async () => new Response(JSON.stringify({ models: [{ id: 'gpt-5.5' }], default_model: 'gpt-5.5' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const key = (value) => document.querySelector('[contenteditable="true"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
function Harness() {
  const [draft, setDraft] = React.useState('');
  const [running, setRunning] = React.useState(false);
  const [scopeId, setScopeId] = React.useState('goal-fixture');
  const [providers, setProviders] = React.useState([]);
  const inputRef = React.useRef(null);
  api = { inputRef, draft, setProviders: (value) => flushSync(() => setProviders(value)), setDraft: (text) => flushSync(() => setDraft(text)), setRunning: (value) => flushSync(() => setRunning(value)), setScopeId: (value) => flushSync(() => setScopeId(value)) };
  return <ChatComposer inputRef={inputRef} scopeId={scopeId} draft={draft} onDraftChange={setDraft}
    providerOptions={providers} agentOptions={[{ id: 'agent', skills: [{ name: 'goal' }, { name: 'Grill-Me' }] }]} defaultAgentId="agent" running={running}
    onSend={() => { ordinary++; return true; }} onStop={() => {}}
    onGoalCommand={async (payload) => { calls.push(payload); await sleep(80); return accept; }} />;
}
createRoot(document.getElementById('root')).render(<AppTooltipProvider><Harness /></AppTooltipProvider>);
async function run() {
  await sleep(400);
  api.setDraft('/go');
  await sleep(80);
  const menu = [...document.querySelectorAll('[role="option"]')].find((item) => item.textContent.includes('goal'));
  check(Boolean(menu), 'slash menu offers the built-in goal command even with a same-name skill');
  key('Enter');
  await sleep(80);
  const token = document.querySelector('[data-command-token="goal"]');
  check(api.draft === '' && token?.querySelector('svg.lucide-target') && token.textContent === 'goal', 'Enter selects an inline goal token with the Target icon, not literal /goal text');
  check(!document.querySelector('[role="listbox"]') && calls.length === 0, 'selecting only closes the menu without submitting');
  check(!document.querySelector('[aria-label="Run Goal Loop"]')?.disabled, 'bare selected goal remains available for workflow navigation');
  api.setDraft('Fix the bug');
  await sleep(50);
  const button = document.querySelector('[aria-label="Run Goal Loop"]');
  check(button && !button.disabled, 'Goal Loop can submit without a configured chat model');
  button?.click();
  document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await sleep(160);
  check(calls.length === 1 && calls[0].prompt === 'Fix the bug', 'one command dispatch strips /goal and duplicate sends are blocked');
  check(api.draft === '' && ordinary === 0 && !document.querySelector('[data-command-token]'), 'accepted goal clears the draft and token without sending to chat');
  api.setDraft('/goal');
  await sleep(80);
  key('Enter');
  await sleep(80);
  key('Enter');
  await sleep(160);
  check(calls.at(-1)?.prompt === '' && calls.length === 2, 'second Enter on a bare goal token navigates through the existing empty-prompt route');
  accept = false;
  api.setDraft('/goal Preserve me');
  await sleep(50);
  document.querySelector('[aria-label="Run Goal Loop"]')?.click();
  await sleep(160);
  check(api.draft === '/goal Preserve me', 'failed preparation preserves the source draft');
  api.setDraft('/go');
  await sleep(80);
  document.querySelector('[role="option"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await sleep(80);
  api.setDraft('Preserve selected task');
  await sleep(80);
  document.querySelector('[aria-label="Run Goal Loop"]')?.click();
  await sleep(160);
  check(api.draft === 'Preserve selected task' && document.querySelector('[data-command-token="goal"]'), 'failed preparation retains selected token and task text');
  document.querySelector('[data-command-token="goal"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await sleep(80);
  check(!document.querySelector('[data-command-token]') && api.draft === 'Preserve selected task', 'click removes the command token without removing task text');
  api.setDraft('/goal');
  await sleep(80);
  key('Tab');
  await sleep(80);
  key('Backspace');
  await sleep(80);
  check(!document.querySelector('[data-command-token]') && api.draft === '', 'Tab selects and Backspace at the start removes the command token');
  api.setDraft('/goal');
  await sleep(80);
  key('Enter');
  await sleep(80);
  api.setScopeId('another-conversation');
  await sleep(80);
  check(!document.querySelector('[data-command-token]'), 'switching conversations clears the selected command');
  api.setDraft('/Grill');
  await sleep(80);
  key('Enter');
  await sleep(80);
  check(document.querySelector('[data-skill-token="Grill-Me"] svg.lucide-book-open') && !document.querySelector('[data-command-token]'), 'ordinary Skills keep their book icon and separate selection semantics');
  document.querySelector('[data-skill-token]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  await sleep(80);
  accept = true;
  api.setRunning(true);
  api.setDraft('/goal Background task');
  await sleep(50);
  document.querySelector('[aria-label="Run Goal Loop"]')?.click();
  await sleep(160);
  check(calls.at(-1)?.prompt === 'Background task' && ordinary === 0, 'running chat routes /goal separately rather than steering');
  api.setProviders(sourceProviders);
  api.setRunning(false);
  await sleep(200);
  api.setDraft('/goal Inherit model');
  await sleep(80);
  document.querySelector('[aria-label="Run Goal Loop"]')?.click();
  await sleep(160);
  check(JSON.stringify(calls.at(-1)?.runConfig) === JSON.stringify({ provider: 'custom.source', model_id: 'gpt-5.5', reasoning_effort: 'high' }), 'Goal snapshots the current composer Provider selector, Model and Reasoning effort');
  // Use the editor insertion API and native keyboard history, not setDraft,
  // so token-only undo/redo must update the actual send button and route.
  api.setRunning(false);
  api.setProviders([]);
  for (const task of ['', '继续远程桌面']) {
    api.setDraft('');
    api.setScopeId(`history-${task || 'bare'}`);
    await sleep(80);
    api.inputRef.current.insertText('/goal');
    await sleep(80);
    key('Tab');
    await sleep(80);
    if (task) api.inputRef.current.insertText(task);
    await sleep(80);
    const before = calls.length;
    check(!document.querySelector('[aria-label="Run Goal Loop"]')?.disabled, `real editor input enables Goal (${task || 'bare'})`);
    document.querySelector('[data-command-token="goal"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await sleep(80);
    const apple = /Mac|iPhone|iPad/.test(navigator.platform);
    const shortcut = (redo) => document.querySelector('[contenteditable="true"]')?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'z', code: 'KeyZ', metaKey: apple, ctrlKey: !apple, shiftKey: redo, bubbles: true, cancelable: true,
    }));
    shortcut(false);
    await sleep(80);
    check(document.querySelector('[data-command-token="goal"]') && !document.querySelector('[aria-label="Run Goal Loop"]')?.disabled,
      `undo restores Goal token and enabled send button (${task || 'bare'})`);
    shortcut(true);
    await sleep(80);
    check(!document.querySelector('[data-command-token]') && !document.querySelector('[aria-label="Run Goal Loop"]')
      && document.querySelector('[aria-label="Send"]')?.disabled,
    `redo removes Goal route and restores ordinary model gating (${task || 'bare'})`);
    shortcut(false);
    await sleep(80);
    document.querySelector('[aria-label="Run Goal Loop"]')?.click();
    await sleep(160);
    check(calls.length === before + 1 && calls.at(-1)?.prompt === task && ordinary === 0,
      `restored Goal submits exactly once without falling through to Chat (${task || 'bare'})`);
  }
  check(errors.length === 0, `no page errors: ${errors.join(', ')}`);
}
run().catch((error) => check(false, error.message)).finally(() => {
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some((item) => item.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
