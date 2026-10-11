import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { SchedulesContext } from '../../src/features/schedules/hooks/useSchedules.js';
import { createRunConfigSync } from '../../src/features/conversations/model/run-config-sync.js';
import '../../styles.css';

// Real composer + tooltip provider; all persistence and model catalogs are offline.
const checks = [];
const errors = [];
const store = new Map();
const providers = [{ id: 'provider', provider: 'custom', requestProvider: 'provider', label: 'Configured provider', defaultModelId: 'gpt-5.5', modelOptions: ['gpt-5.5'], defaultReasoningEffort: 'none' }];
const route = { provider: 'provider', model_id: 'gpt-5.5', reasoning_effort: 'none', agent_id: 'a', execution_mode: 'chat', use_history: true };
const cases = [
  { name: 'missing-provider', config: { ...route, provider: null, model_id: null }, hint: 'Chat: select a configured model provider before sending.' },
  { name: 'removed-provider', config: { ...route, provider: 'removed' }, hint: 'Chat: the selected provider is unavailable. Select a configured provider.' },
  { name: 'missing-model', config: { ...route, model_id: null }, hint: 'Chat: select a concrete model before sending.' },
  { name: 'disabled-agent', config: route, agentDisabled: true, hint: 'This Agent is disabled. Select an enabled Agent before starting.' },
  { name: 'bot-node', config: { ...route, execution_mode: 'bot', workflow_id: 'wf', provider: null, model_id: null, node_runtime_configs: {} }, hint: 'Node worker: select a configured model provider before sending.' },
];
for (const item of cases) store.set(item.name, item.config);
const sync = createRunConfigSync({ get: async (id) => structuredClone(store.get(id)), save: async (id, config) => store.set(id, structuredClone(config)) });
const originalFetch = window.fetch;
window.fetch = (input, init) => {
  if (String(input).endsWith('/api/llm/models')) {
    const request = JSON.parse(init.body);
    return Promise.resolve(Response.json({ provider: request.provider, models: ['gpt-5.5'], default_model: 'gpt-5.5' }));
  }
  if (String(input).includes('/api/approvals/state')) return Promise.resolve(Response.json({ mode: 'smart' }));
  return originalFetch(input, init);
};
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
let control;
let sends = 0;
function Fixture() {
  const [current, setCurrent] = React.useState(cases[0]);
  const [text, setText] = React.useState('Keep this draft');
  control = { setCurrent, setText };
  const bot = current.config.execution_mode === 'bot';
  const agents = bot ? [{ id: 'wf', label: 'Workflow', nodes: [{ id: 'worker', type: 'agent' }] }] : [{ id: 'a', label: 'Agent', disabled: current.agentDisabled }];
  return <AppTooltipProvider>
    <button id="reset-hover-case" onClick={() => { setCurrent(cases[0]); setText('Keep this draft'); }}>Inspect blocked send</button>
    <SchedulesContext.Provider value={{ currentConversationId: current.name, configSync: sync }}>
      <ChatComposer key={current.name} scopeId={current.name} executionMode={bot ? 'bot' : 'chat'} providerOptions={providers}
        agentOptions={agents} defaultAgentId={bot ? 'wf' : 'a'} draft={text} onDraftChange={setText}
        onSend={() => { sends += 1; return true; }} />
    </SchedulesContext.Provider>
  </AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const sleep = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
const tooltip = () => document.querySelector('.app-tooltip-content');
const wrapper = () => document.querySelector('.chat-send-tooltip-trigger');
async function until(predicate) {
  for (let index = 0; index < 150; index += 1) { if (predicate()) return; await sleep(); }
  throw new Error('Timed out waiting for tooltip state');
}
function check(ok, label) { checks.push(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) throw new Error(label); }
function enter(element) { element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body })); }
function leave(element) { element.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body })); }
async function run() {
  await until(wrapper); await sleep(150);
  for (const item of cases) {
    control.setCurrent(item); await sleep(200);
    check(document.querySelector('.chat-send').disabled, `${item.name} retains native disabled send`);
    check(!document.querySelector('.chat-composer .haish-annotation-notice') && !tooltip(), `${item.name} has no inline or unsolicited hint`);
    enter(document.querySelector('[contenteditable="true"]')); await sleep(430);
    check(!tooltip(), `${item.name} hovering the input does not show a send hint`);
    leave(document.querySelector('[contenteditable="true"]'));
    document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await sleep();
    check(sends === 0 && document.querySelector('[contenteditable="true"]').textContent === 'Keep this draft'
      && !document.querySelector('.chat-composer .haish-annotation-notice'), `${item.name} keyboard/programmatic submit preserves draft without an inline hint`);
    const hit = wrapper();
    const bounds = hit.getBoundingClientRect();
    const button = document.querySelector('.chat-send').getBoundingClientRect();
    check(Math.abs(bounds.width - button.width) < 1 && Math.abs(bounds.height - button.height) < 1, `${item.name} hover target is only the button's area`);
    enter(hit); await until(() => tooltip()?.textContent === item.hint);
    check(!document.querySelector('.chat-composer').contains(tooltip()), `${item.name} hint is a shared portal tooltip`);
    check(hit.hasAttribute('aria-describedby') && hit.tabIndex === 0, `${item.name} blocked reason is accessible on keyboard focus`);
    leave(hit); await until(() => !tooltip());
    check(!tooltip(), `${item.name} leaving the button hides the hint`);
  }
  control.setCurrent(cases[0]); await sleep(200);
  enter(wrapper()); await until(() => tooltip());
  document.querySelector('.model-picker-trigger').click(); await sleep();
  document.querySelector('[aria-label="Open agent and model settings"]').click(); await sleep();
  [...document.querySelectorAll('.model-picker-submenu-entry')][1].focus(); await sleep();
  document.querySelector('.model-picker-flyout-provider [role="option"]').click();
  await until(() => !document.querySelector('.chat-send').disabled);
  await until(() => !tooltip());
  check(!tooltip() && wrapper().tabIndex === -1, 'Selecting a valid provider removes the blocked tooltip and extra tab stop');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep();
  enter(wrapper()); await sleep(430);
  check(!tooltip(), 'Enabled send does not show stale configuration hints');
  document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await until(() => sends === 1);
  check(sends === 1, 'Valid configuration still sends normally');
  leave(wrapper());
  check(errors.length === 0, 'No page errors');
  control.setCurrent(cases[2]); control.setText('Keep this draft'); await sleep(200);
}
run().catch((error) => checks.push(`FAIL ${error.message}`)).finally(() => {
  window.fetch = originalFetch;
  const report = document.getElementById('checks');
  report.textContent = checks.join('\n');
  report.dataset.result = checks.some((row) => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
