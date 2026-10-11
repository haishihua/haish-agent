import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { LlmConfigEditor } from '../../src/features/settings/components/LlmConfigEditor.jsx';
import { runtimeLlmProviderOptions } from '../../src/features/settings/model/llm-settings.js';
import { usePersistentRunConfig } from '../../src/features/chat/hooks/useRunConfig.js';
import { REASONING_EFFORT_OPTIONS } from '../../src/features/chat/model/run-catalog.js';
import { createRunConfigSync } from '../../src/features/conversations/model/run-config-sync.js';
import { SchedulesContext } from '../../src/features/schedules/hooks/useSchedules.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

// Offline integration through the production Settings editor, composer and save queue.
const results = [];
const errors = [];
const saved = new Map();
const writes = [];
const sends = [];
let currentRoute;
const prefix = `provider-thinking-fixture:${Date.now()}`;
const initial = {
  chat: { id: 'first', name: 'First route', provider: 'custom', auth_mode: 'api_key', model: 'gpt-5.5', reasoning_effort: 'xhigh', model_options: ['gpt-5.5'] },
  profiles: [{ id: 'second', name: 'Second route', provider: 'custom', auth_mode: 'api_key', model: 'gpt-5.4', model_options: ['gpt-5.4'] }],
  compact: { providers: [] }, vision: { providers: [] }, embedding: {},
};
let controls;
let hold = false;
let release;
const sync = createRunConfigSync({
  get: async (id) => structuredClone(saved.get(id) || null),
  save: async (id, config) => {
    writes.push({ id, config: structuredClone(config) });
    if (hold) await new Promise((resolve) => { release = resolve; });
    saved.set(id, structuredClone(config));
  },
});
const originalFetch = window.fetch;
window.fetch = (input, init) => {
  if (String(input).endsWith('/api/llm/models')) {
    const request = JSON.parse(init.body);
    return Promise.resolve(Response.json({ provider: request.provider, models: [request.model], default_model: request.model }));
  }
  if (String(input).includes('/api/approvals/state')) return Promise.resolve(Response.json({ mode: 'smart' }));
  return originalFetch(input, init);
};
window.addEventListener('error', (event) => errors.push(event.message));
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
const agents = [{ id: 'a', label: 'Agent A' }];
function Fixture() {
  const [id, setId] = React.useState('fresh');
  const [draft, setDraft] = React.useState(initial);
  const [text, setText] = React.useState('Verify default thinking');
  const [editorId, setEditorId] = React.useState('chat');
  controls = { setId, setDraft, setText, setEditorId, draft };
  const providers = React.useMemo(() => runtimeLlmProviderOptions(draft), [draft]);
  return <AppTooltipProvider>
    <SchedulesContext.Provider value={{ currentConversationId: id, configSync: sync }}>
      <ChatComposer scopeId={id} selectionStorageKey={`${prefix}:${id}`} draft={text} onDraftChange={setText}
        providerOptions={providers} agentOptions={agents} defaultAgentId="a"
        onRunConfigChange={(config) => { currentRoute = config; }}
        onSend={(...args) => { sends.push({ provider: args[6], model: args[2], effort: args[3] }); return true; }} />
    </SchedulesContext.Provider>
    <div id="settings-editor"><LlmConfigEditor selectedId={editorId} draft={draft} onDraftChange={setDraft} /></div>
  </AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const sleep = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate) {
  for (let index = 0; index < 150; index += 1) { if (await predicate()) return; await sleep(); }
  throw new Error('Timed out waiting for fixture state');
}
function check(ok, label) {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) throw new Error(label);
}
function closeMenu() { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); }
async function chooseProvider(name) {
  closeMenu(); await sleep();
  document.querySelector('.model-picker-trigger').click(); await sleep();
  document.querySelector('[aria-label="Open agent and model settings"]').click(); await sleep();
  [...document.querySelectorAll('.model-picker-submenu-entry')][1].focus(); await sleep();
  const option = [...document.querySelectorAll('.model-picker-flyout-provider [role="option"]')].find((item) => item.textContent.includes(name));
  option.click(); await sleep(); closeMenu(); await sleep();
}
function submit() { document.querySelector('form.chat-composer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
async function run() {
  await until(() => document.querySelector('.model-picker-trigger'));
  await sleep(100);
  check(document.querySelector('.model-picker-trigger').getAttribute('aria-label') === 'Run configuration, No model · high'
    && document.querySelector('.chat-send').disabled, 'Fresh composer starts at high without inventing a provider or model');
  await chooseProvider('First route');
  await until(() => saved.get('fresh')?.reasoning_effort === 'xhigh');
  check(saved.get('fresh').provider === 'first' && saved.get('fresh').model_id === 'gpt-5.5', 'Provider selection saves the exact Settings model and xhigh together');
  check(document.querySelector('.model-picker-gauge').style.getPropertyValue('--gauge-rotation') === '75deg', 'Configured xhigh displays at the maximum');
  submit(); await until(() => sends.length === 1);
  check(sends[0].provider === 'first' && sends[0].model === 'gpt-5.5' && sends[0].effort === 'xhigh', 'Real composer sends the committed Settings default thinking');
  controls.setText('Verify high fallback'); await sleep();
  hold = true; await chooseProvider('Second route');
  await until(() => release);
  check(writes.at(-1).config.reasoning_effort === 'high' && writes.at(-1).config.model_id === 'gpt-5.4', 'Missing Settings thinking becomes high, not inherited xhigh');
  submit(); await sleep(80);
  check(sends.length === 1, 'Send waits for the provider/model/thinking save to finish');
  hold = false; release(); await until(() => sends.length === 2);
  check(sends[1].provider === 'second' && sends[1].model === 'gpt-5.4' && sends[1].effort === 'high', 'After save, real composer sends high with the selected model');
  document.querySelector('.model-picker-trigger').click(); await sleep();
  check(document.querySelector('input[aria-label="Thinking level"]').max === '3'
    && !document.querySelector('.model-picker-quick').textContent.includes('Unspecified'), 'Normal picker has four levels and no extra Unspecified selection');
  closeMenu(); await sleep();
  saved.set('explicit-null', { provider: 'first', model_id: 'gpt-5.5', reasoning_effort: null, execution_mode: 'chat', agent_id: 'a', use_history: true });
  controls.setId('explicit-null'); controls.setText('Migrate old null');
  await until(async () => {
    if (currentRoute?.provider !== 'first' || currentRoute.reasoningEffort !== 'xhigh') return false;
    try {
      const config = await currentRoute.ensureSaved();
      return config.provider === 'first' && config.reasoning_effort === 'xhigh';
    } catch { return false; } // Loading the selected provider is asynchronous.
  });
  check(document.querySelector('.model-picker-trigger').getAttribute('aria-label').endsWith('xhigh')
    && document.querySelector('.model-picker-gauge-needle'), 'Existing server null is restored as the selected provider default xhigh');
  submit(); await until(() => sends.length === 3);
  check(sends[2].effort === 'xhigh' && saved.get('explicit-null').reasoning_effort === 'xhigh', 'Old null becomes xhigh in the actual saved and sent values');
  controls.setEditorId('second'); await sleep();
  document.querySelector('#settings-editor [data-slot="model-selector-trigger"]').click();
  await until(() => document.querySelector('[data-slot="model-selector-effort"]'));
  const effortArea = () => document.querySelector('[data-slot="model-selector-effort"]');
  check(effortArea().querySelectorAll('[role="radio"]').length === 4
    && effortArea().querySelector('[role="radio"][data-state="checked"]').textContent === 'High', 'Settings with no configured thinking visibly selects High');
  for (const { id } of REASONING_EFFORT_OPTIONS) {
    effortArea().querySelector(`[role="radio"][value="${id}"]`).click(); await sleep();
    check(controls.draft.profiles[0].reasoning_effort === id, `Settings records explicit ${id}`);
  }
  effortArea().querySelector('[role="radio"][value="xhigh"]').click(); await sleep();
  closeMenu(); await sleep();
  await chooseProvider('Second route');
  await until(() => saved.get('explicit-null')?.provider === 'second' && saved.get('explicit-null')?.reasoning_effort === 'xhigh');
  check(saved.get('explicit-null').model_id === 'gpt-5.4', 'A deliberate provider re-selection applies the latest Settings default, not stale null');
  check(errors.length === 0, 'No page errors');
  // Simulate Settings arriving after the saved route; the migration must not freeze high too early.
  let delayed;
  function DelayedProviders() {
    const [providers, setProviders] = React.useState([]);
    const state = usePersistentRunConfig({ selectionStorageKey: `${prefix}:delayed`, providerOptions: providers, agentOptions: agents, defaultAgentId: 'a' });
    delayed = { ...state, setProviders };
    return <output>{state.reasoningEffort}</output>;
  }
  const mount = document.createElement('div'); document.body.append(mount);
  const delayedRoot = createRoot(mount); delayedRoot.render(<DelayedProviders />);
  await until(() => delayed);
  delayed.restoreConfig({ provider: 'first', model_id: 'gpt-5.5', reasoning_effort: null, agent_id: 'a' }); await sleep();
  check(delayed.reasoningEffort === 'high', 'Pending provider still exposes a concrete four-level value');
  delayed.setProviders(runtimeLlmProviderOptions(initial)); await until(() => delayed.reasoningEffort === 'xhigh');
  check(delayed.providerId === 'first' && JSON.parse(localStorage.getItem(`${prefix}:delayed`)).reasoningEffort === 'xhigh', 'Late provider catalog migrates old null to its default, including actual storage');
  delayed.setReasoningEffort('medium'); await sleep();
  delayed.setProviders(runtimeLlmProviderOptions({ ...initial, chat: { ...initial.chat, model: 'gpt-5.6', reasoning_effort: 'low' } })); await sleep();
  check(delayed.reasoningEffort === 'medium', 'Settings refresh does not replace an explicit generic medium selection');
  delayedRoot.unmount(); mount.remove();
}
run().catch((error) => results.push(`FAIL ${error.message}`)).finally(() => {
  window.fetch = originalFetch;
  for (const key of Object.keys(window.localStorage)) if (key.startsWith(prefix)) window.localStorage.removeItem(key);
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some((row) => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
