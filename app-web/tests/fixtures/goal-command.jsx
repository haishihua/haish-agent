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
function Harness() {
  const [draft, setDraft] = React.useState('');
  const [running, setRunning] = React.useState(false);
  api = { draft, setDraft: (text) => flushSync(() => setDraft(text)), setRunning: (value) => flushSync(() => setRunning(value)) };
  return <ChatComposer scopeId="goal-fixture" draft={draft} onDraftChange={setDraft}
    providerOptions={[]} agentOptions={[{ id: 'agent', skills: [{ name: 'goal' }] }]} defaultAgentId="agent" running={running}
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
  menu?.click();
  await sleep(80);
  check(api.draft === '/goal ', 'choosing the command inserts /goal instead of a Skill token');
  api.setDraft('/goal Fix the bug');
  await sleep(50);
  const button = document.querySelector('[aria-label="Run Goal Loop"]');
  check(button && !button.disabled, 'Goal Loop can submit without a configured chat model');
  button?.click();
  document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await sleep(160);
  check(calls.length === 1 && calls[0].prompt === 'Fix the bug', 'one command dispatch strips /goal and duplicate sends are blocked');
  check(api.draft === '' && ordinary === 0, 'accepted goal clears the draft without sending to chat');
  accept = false;
  api.setDraft('/goal Preserve me');
  await sleep(50);
  document.querySelector('[aria-label="Run Goal Loop"]')?.click();
  await sleep(160);
  check(api.draft === '/goal Preserve me', 'failed preparation preserves the source draft');
  accept = true;
  api.setRunning(true);
  api.setDraft('/goal Background task');
  await sleep(50);
  document.querySelector('[aria-label="Run Goal Loop"]')?.click();
  await sleep(160);
  check(calls.at(-1)?.prompt === 'Background task' && ordinary === 0, 'running chat routes /goal separately rather than steering');
  check(errors.length === 0, `no page errors: ${errors.join(', ')}`);
}
run().catch((error) => check(false, error.message)).finally(() => {
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some((item) => item.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
