import React from 'react';
import { createRoot } from 'react-dom/client';
import { useProviderModels, PROVIDER_MODELS_TIMEOUT_MS } from '../../src/features/chat/hooks/useRunConfig.js';
import { ModelPicker } from '../../src/features/chat/components/ModelPickers.jsx';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { WorkflowRuntimeConfig } from '../../src/features/workflow/components/WorkflowRuntimeConfig.jsx';
import { createRunConfigSync } from '../../src/features/conversations/model/run-config-sync.js';
import { SchedulesContext } from '../../src/features/schedules/hooks/useSchedules.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

// Real Hook/menu/composer with memory-only storage and offline transport.
// Capture only the production model deadline for deterministic timeout checks.
const checks = [], errors = [], requests = [], deadlines = new Map(), storage = new Map(), sends = [];
const originalFetch = window.fetch;
const originalSetTimeout = window.setTimeout;
const originalClearTimeout = window.clearTimeout;
let timerId = -1;
window.setTimeout = (callback, delay, ...args) => {
  if (delay === PROVIDER_MODELS_TIMEOUT_MS) { deadlines.set(timerId, () => callback(...args)); return timerId--; }
  return originalSetTimeout(callback, delay, ...args);
};
window.clearTimeout = id => {
  if (deadlines.has(id)) deadlines.delete(id);
  else originalClearTimeout(id);
};
Object.defineProperty(window, 'localStorage', { configurable: true, value: {
  getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key),
} });
window.fetch = (url, init = {}) => {
  if (String(url).endsWith('/api/llm/models')) return new Promise((resolve, reject) => requests.push({ init, resolve, reject }));
  if (String(url).includes('/api/approvals/state')) return Promise.resolve(Response.json({ mode: 'smart' }));
  errors.push(`Unexpected request: ${url}`);
  return Promise.reject(new Error('Only fixture requests are allowed'));
};
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
const providers = [
  { id: 'route-a', provider: 'custom', label: 'Route A', defaultModelId: 'saved-a', modelOptions: ['saved-a', 'alternate-a'] },
  { id: 'route-b', provider: 'custom', label: 'Route B', defaultModelId: 'saved-b', modelOptions: ['saved-b'] },
  { id: 'empty-route', provider: 'custom', label: 'No cache', defaultModelId: '', modelOptions: [] },
];
const agents = [{ id: 'a', label: 'Agent' }];
let control;
function PickerFixture() {
  const [providerId, setProviderId] = React.useState('route-a');
  const [model, setModel] = React.useState('saved-a');
  const models = useProviderModels(providers.find(item => item.id === providerId));
  control = { models, providerId, model };
  return <AppTooltipProvider><ModelPicker value={model} onChange={setModel} reasoningEffort="high" onReasoningChange={() => {}}
    options={models.options} loading={models.loading} modelError={models.error} modelRefreshing={models.refreshing} onModelRetry={models.retry}
    providerValue={providerId} providerOptions={providers} onProviderChange={id => { setProviderId(id); setModel(providers.find(item => item.id === id).defaultModelId); }}
    agentValue="a" agentOptions={agents} /></AppTooltipProvider>;
}
const route = { llm_config_id: 'route-a', model_id: 'saved-a', reasoning_effort: 'xhigh', agent_id: 'a', execution_mode: 'chat', use_history: true };
const sync = createRunConfigSync({ get: async () => route, save: async () => {} });
function ComposerFixture() {
  const [text, setText] = React.useState('Send while discovery is pending');
  return <AppTooltipProvider><SchedulesContext.Provider value={{ currentConversationId: 'offline', configSync: sync }}>
    <ChatComposer scopeId="offline" selectionStorageKey="fixture-model-loading-selection" providerOptions={providers} agentOptions={agents} defaultAgentId="a"
      draft={text} onDraftChange={setText} onSend={(...args) => { sends.push({ provider: args[6], model: args[2], effort: args[3] }); return true; }} />
  </SchedulesContext.Provider></AppTooltipProvider>;
}
const root = createRoot(document.getElementById('root'));
const sleep = (ms = 35) => new Promise(resolve => originalSetTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 160; i += 1) { if (predicate()) return; await sleep(); }
  throw new Error('Timed out waiting for model loading fixture');
}
const check = (ok, label) => { if (!ok) throw new Error(label); checks.push(`PASS ${label}`); };
const flyout = () => document.querySelector('.model-picker-flyout-model');
const choices = () => [...document.querySelectorAll('.model-picker-model-option')];
const isLoading = () => Boolean(flyout()?.querySelector('[data-slot="generation-loader"]'));
async function open(submenu = 'model') {
  if (!document.querySelector('.model-picker-trigger').getAttribute('aria-expanded').includes('true')) {
    document.querySelector('.model-picker-trigger').click(); await sleep();
  }
  if (!document.querySelector('.model-picker-submenu-entry')) {
    document.querySelector('[aria-label="Open agent and model settings"]').click(); await sleep();
  }
  document.querySelectorAll('.model-picker-submenu-entry')[submenu === 'model' ? 2 : 1].focus(); await sleep();
}
async function chooseProvider(id) {
  await open('provider');
  [...document.querySelectorAll('.model-picker-flyout-provider [role="option"]')].find(item => item.textContent.includes(providers.find(p => p.id === id).label)).click();
  await open('model');
}
async function respond(index, models) { requests[index].resolve(Response.json({ provider: 'custom', models, default_model: models[0] || '' })); await sleep(80); }
async function expire() { const [id, callback] = deadlines.entries().next().value; deadlines.delete(id); callback(); await sleep(80); }
function closeMenu() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
async function run() {
  root.render(<PickerFixture key="initial" />);
  await until(() => requests.length === 1 && control);
  await open();
  check(!isLoading() && choices().length === 2 && choices().every(item => !item.disabled), 'Saved models are visible and selectable while the first refresh is pending');
  choices().find(item => item.textContent.includes('alternate-a')).click(); await sleep();
  check(control.model === 'alternate-a' && flyout(), 'Selecting a saved model works without closing the menu or waiting for discovery');
  await chooseProvider('route-b');
  check(requests[0].init.signal.aborted && choices()[0]?.textContent.includes('saved-b') && !isLoading(), 'Switching provider cancels A and immediately shows B saved models');
  await respond(1, ['remote-b']); await respond(0, ['late-a']);
  check(choices().some(item => item.textContent.includes('remote-b')) && !choices().some(item => item.textContent.includes('late-a')), 'Late A response cannot leak into B menu');

  await chooseProvider('empty-route');
  check(isLoading() && choices().length === 0, 'A provider without any cached or saved models shows initial Loading');
  await expire();
  check(!isLoading() && flyout().querySelector('[role="alert"]')?.textContent.includes('timed out'), 'Hung request leaves Loading at its deadline with a clear error');
  check(flyout().querySelector('[data-slot="error-state"] button')?.textContent.includes('Retry'), 'The model flyout offers its own Retry button');
  flyout().querySelector('[data-slot="error-state"] button').click(); await sleep();
  check(requests.length === 4 && flyout().textContent.includes('Retrying'), 'Retry starts exactly one new request and shows retry progress');
  await respond(3, ['recovered-empty']);
  check(!isLoading() && !flyout().querySelector('[role="alert"]') && choices()[0]?.textContent.includes('recovered-empty'), 'Successful retry restores the menu and clears its error');
  choices()[0].click(); await sleep();
  check(control.model === 'recovered-empty', 'Recovered model can be selected');
  await respond(2, ['late-timeout']);
  check(!choices().some(item => item.textContent.includes('late-timeout')), 'Timed-out response cannot replace the retry result');

  await chooseProvider('route-a');
  const aborted = new Error('fixture active abort'); aborted.name = 'AbortError';
  requests[4].reject(aborted); await sleep(80);
  check(!isLoading() && flyout().querySelector('[role="alert"]')?.textContent.includes('interrupted') && choices().length === 2,
    'Unexpected AbortError ends loading while keeping usable saved models');
  closeMenu();
  root.render(<PickerFixture key="remount" />);
  await until(() => requests.length === 6);
  await chooseProvider('route-b');
  check(choices().some(item => item.textContent.includes('remote-b')) && !isLoading(), 'Remount and return to a provider use its cache without blocking Loading');

  closeMenu();
  root.render(<ComposerFixture key="composer" />);
  await until(() => requests.length === 8 && document.querySelector('.chat-send') && !document.querySelector('.chat-send').disabled);
  document.querySelector('form.chat-composer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await until(() => sends.length === 1);
  check(sends[0].provider === 'route-a' && sends[0].model === 'saved-a' && sends[0].effort === 'xhigh', 'Real composer sends the exact saved route while model discovery is unresolved');
  await open(); await expire();
  check(flyout().querySelector('[role="alert"]') && choices().length === 2, 'Production composer wires the model error and cached choices to its menu');
  flyout().querySelector('[data-slot="error-state"] button').click(); await sleep();
  await respond(8, ['new-a']);
  check(!flyout().querySelector('[role="alert"]') && choices().some(item => item.textContent.includes('new-a')), 'Production composer Retry refreshes only models and clears the error');
  closeMenu();

  root.render(<WorkflowRuntimeConfig value={{ llm_config_id: 'route-a', model_id: 'saved-a', reasoning_effort: 'xhigh' }} providerOptions={providers} onChange={() => {}} />);
  await until(() => requests.length === 10 && document.querySelector('[aria-label="Node model"]'));
  check(!document.querySelector('[aria-label="Node model"]').disabled, 'Workflow model selector remains usable during background discovery');
  await expire();
  check(document.querySelector('.workflow-runtime-config [role="alert"]') && document.querySelector('.workflow-runtime-config [data-slot="error-state"] button'), 'Workflow shares the deadline error and explicit Retry');
  check(errors.length === 0, 'No page errors or unexpected API requests');
}
run().catch(error => checks.push(`FAIL ${error.stack || error}`)).finally(() => {
  root.unmount();
  window.fetch = originalFetch; window.setTimeout = originalSetTimeout; window.clearTimeout = originalClearTimeout;
  const report = document.getElementById('checks'); report.textContent = checks.join('\n');
  report.dataset.result = checks.some(line => line.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
