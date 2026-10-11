import React from 'react';
import { createRoot } from 'react-dom/client';
import { ModelPicker } from '../../src/features/chat/components/ModelPickers.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { startAgentCatalogLoad, staleAgentCatalog } from '../../src/features/agents/model/agent-catalog-loading.js';
import '../../styles.css';

const attempts = [];
const errors = [];
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
const request = (url, init) => new Promise((resolve) => attempts.push({ url, signal: init.signal, resolve }));
const payload = (name) => ({ agents: [{ agent_id: 'preset.general', display_name: name, effective_skill_items: [{ name: `${name}-skill` }] }] });
let control = {};
function Fixture() {
  const [workspace, setWorkspace] = React.useState('one');
  const [retry, setRetry] = React.useState(0);
  const [state, setState] = React.useState({ status: 'loading', error: '' });
  const [catalog, setCatalog] = React.useState({ options: [{ id: 'preset.general', label: 'Saved', skills: [{ name: 'old-skill' }] }] });
  const [provider, setProvider] = React.useState('p');
  const [model, setModel] = React.useState('m1');
  const [reasoning, setReasoning] = React.useState(null);
  const [readOnly, setReadOnly] = React.useState(false);
  const [disabled, setDisabled] = React.useState(false);
  const [locked, setLocked] = React.useState(false);
  React.useEffect(() => {
    setCatalog(staleAgentCatalog);
    const attempt = startAgentCatalogLoad({ request, url: workspace, onState: setState, onCatalog: setCatalog });
    return attempt.cancel;
  }, [workspace, retry]);
  control = { setWorkspace, setReadOnly, setDisabled, setLocked, provider, model, reasoning, catalog, state };
  return <AppTooltipProvider><ModelPicker value={model} options={[{ id: 'm1', label: 'Model One' }, { id: 'm2', label: 'Model Two' }]}
    onChange={setModel} reasoningEffort={reasoning} onReasoningChange={setReasoning}
    providerValue={provider} providerOptions={[{ id: 'p', label: 'Provider One' }, { id: 'q', label: 'Provider Two' }]} onProviderChange={setProvider}
    agentValue="preset.general" agentOptions={catalog.options} agentLoading={state.status === 'loading'} agentError={state.error} onAgentRetry={() => setRetry((n) => n + 1)}
    readOnly={readOnly} disabled={disabled} agentLocked={locked} /></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const sleep = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];
function check(ok, label) { results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) throw new Error(label); }
const trigger = () => document.querySelector('.model-picker-trigger');
async function openSettings() {
  if (!document.querySelector('.model-picker-menu')) {
    if (!document.querySelector('.model-picker-quick')) { trigger().click(); await sleep(); }
    document.querySelector('.model-picker-quick-summary').click(); await sleep();
  }
}
async function section(name) { await openSettings(); const buttons = [...document.querySelectorAll('.model-picker-submenu-entry')]; buttons[['agent', 'provider', 'model'].indexOf(name)].focus(); await sleep(); }
const choose = (label) => [...document.querySelectorAll('.model-picker-flyout button')].find((button) => button.textContent.trim() === label)?.click();
async function run() {
  await sleep(100);
  check(!trigger().disabled, 'Slow Agent request does not disable run configuration');
  trigger().click(); await sleep();
  const range = document.querySelector('input[type=range]');
  check(!range.disabled, 'Thinking slider remains enabled during Agent loading');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(range, '2');
  range.dispatchEvent(new Event('input', { bubbles: true })); range.dispatchEvent(new Event('change', { bubbles: true })); await sleep();
  check(control.reasoning != null, 'Thinking changes during Agent loading');
  await section('model'); choose('Model Two'); await sleep();
  check(control.model === 'm2', 'Model changes during Agent loading');
  await section('provider'); choose('Provider Two'); await sleep();
  check(control.provider === 'q', 'Provider changes during Agent loading');
  await section('agent');
  check(document.querySelector('[role=status]')?.textContent.includes('Loading agents'), 'Loading is local to Agent flyout');
  check(control.catalog.options[0].skills.length === 0 && control.catalog.options[0].unavailable, 'Pending catalog hides stale skills and switch targets');
  attempts[0].resolve(new Response('', { status: 500 })); await sleep();
  check(document.querySelector('[role=alert]') && !trigger().disabled, 'HTTP failure is visible without blocking model settings');
  document.querySelector('[role=alert] button').click(); await sleep();
  check(attempts.length === 2, 'Retry starts one explicit new attempt');
  attempts[1].resolve(Response.json(payload('fresh'))); await sleep();
  check(control.state.status === 'ready' && control.catalog.options[0].skills[0].name === 'fresh-skill', 'Retry restores current skill metadata');
  control.setWorkspace('two'); await sleep();
  const old = attempts[2]; control.setWorkspace('three'); await sleep();
  check(old.signal.aborted, 'Switching workspace aborts its previous request');
  attempts[3].resolve(Response.json(payload('newest'))); await sleep();
  old.resolve(Response.json(payload('obsolete'))); await sleep();
  check(control.catalog.options[0].label === 'newest', 'Late old workspace response cannot overwrite newest catalog');
  control.setLocked(true); await sleep(); await section('agent');
  check([...document.querySelectorAll('.model-picker-flyout-agent button[role=option]')].every((button) => button.disabled), 'Agent lock is retained');
  await section('model'); choose('Model One'); await sleep();
  check(control.model === 'm1', 'Agent lock does not block model changes');
  control.setReadOnly(true); await sleep();
  choose('Model Two'); await sleep();
  check(control.model === 'm1' && [...document.querySelectorAll('.model-picker-flyout-model button')].every((button) => button.disabled), 'Read-only model controls remain disabled');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep();
  control.setDisabled(true); await sleep(); check(trigger().disabled, 'Overall disabled state is retained');
  check(errors.length === 0, 'No page errors');
}
run().catch((error) => results.push(`FAIL ${error.message}`)).finally(() => {
  const output = document.getElementById('checks'); output.textContent = results.join('\n'); output.dataset.result = results.some((row) => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
