import React from 'react';
import { createRoot } from 'react-dom/client';
import { ChatComposer } from '../../src/features/chat/components/ChatComposer.jsx';
import { LlmConfigEditor } from '../../src/features/settings/components/LlmConfigEditor.jsx';
import { useLlmSettings } from '../../src/features/settings/hooks/useLlmSettings.js';
import { createSettingsHandlers } from '../../src/features/settings/hooks/createSettingsHandlers.js';
import { LLM_SETTINGS_STORAGE_KEY, loadLlmSettingsDraft, llmDraftForStorage } from '../../src/features/settings/model/llm-settings.js';
import { apiFetch, parseResponseMessage } from '../../src/shared/api/client.js';
import { createRunConfigSync } from '../../src/features/conversations/model/run-config-sync.js';
import { SchedulesContext } from '../../src/features/schedules/hooks/useSchedules.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

// No real credentials, conversations, model calls or persisted browser keys.
// The real React hook, editor, composer and handlers use only this transport.
const checks = [];
const errors = [];
const requests = [];
const sends = [];
const notices = [];
const originalFetch = window.fetch;
const storage = new Map();
Object.defineProperty(window, 'localStorage', { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
} });
const saved = {
  chat: { id: 'saved-route', provider: 'custom', name: 'Saved route', auth_mode: 'api_key', model: 'saved-model', model_options: ['saved-model'], reasoning_effort: 'xhigh' },
  profiles: [], vision: { providers: [] }, compact: { providers: [] }, embedding: {},
};
storage.set(LLM_SETTINGS_STORAGE_KEY, llmDraftForStorage({ ...saved, chat: { ...saved.chat, _persisted: false } }));
const route = { llm_config_id: 'saved-route', model_id: 'saved-model', reasoning_effort: 'xhigh', agent_id: 'a', execution_mode: 'chat', use_history: true };
const agents = [{ id: 'a', label: 'Agent' }];
const sync = createRunConfigSync({ get: async () => structuredClone(route), save: async () => {} });
window.fetch = (input, init = {}) => {
  const url = String(input);
  if (url.endsWith('/api/settings/llm') || url.includes('/api/settings/llm/providers/')) {
    return new Promise(resolve => requests.push({ url, init, resolve }));
  }
  if (url.endsWith('/api/llm/models')) return Promise.resolve(Response.json({ provider: 'custom', models: ['saved-model'], default_model: 'saved-model' }));
  if (url.includes('/api/approvals/state')) return Promise.resolve(Response.json({ mode: 'smart' }));
  errors.push(`Unexpected API request: ${url}`);
  return Promise.reject(new Error('Only fixture requests are allowed'));
};
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
let control;
let currentRoute;
function Fixture() {
  const [draft, setDraft] = React.useState(loadLlmSettingsDraft);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [text, setText] = React.useState('Keep the selected route');
  const { providerOptions, beginWrite } = useLlmSettings({ draft, setDraft, settingsOpen });
  const handlers = createSettingsHandlers({
    API_BASE: '', llmSettingsDraft: draft, beginLlmSettingsWrite: beginWrite,
    apiFetch, parseResponseMessage, showToast: (...args) => notices.push(args),
  });
  control = { draft, providerOptions, setDraft, setText, setSettingsOpen, handlers };
  return <AppTooltipProvider>
    <SchedulesContext.Provider value={{ currentConversationId: 'offline-conversation', configSync: sync }}>
      <ChatComposer scopeId="offline-conversation" selectionStorageKey="fixture-llm-selection" draft={text} onDraftChange={setText}
        providerOptions={providerOptions} agentOptions={agents} defaultAgentId="a"
        onRunConfigChange={config => { currentRoute = config; }}
        onSend={(...args) => { sends.push({ provider: args[6], model: args[2], effort: args[3] }); return true; }} />
    </SchedulesContext.Provider>
    {settingsOpen && <div id="settings-editor"><LlmConfigEditor selectedId="chat" draft={draft} onDraftChange={setDraft} /></div>}
  </AppTooltipProvider>;
}
const root = createRoot(document.getElementById('root'));
const sleep = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let index = 0; index < 150; index += 1) { if (predicate()) return; await sleep(); }
  throw new Error('Timed out waiting for lifecycle state');
}
function check(condition, label) { if (!condition) throw new Error(label); checks.push(`PASS ${label}`); }
async function respond(index, payload) { requests[index].resolve(Response.json(payload)); await sleep(80); }
function submit() { document.querySelector('form.chat-composer').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
async function run() {
  root.render(<Fixture key="startup" />);
  await until(() => requests.length === 1 && document.querySelector('.chat-send') && currentRoute?.modelId === 'saved-model');
  check(requests[0].init.method === 'GET' && !document.querySelector('#settings-editor'), 'Startup reads saved settings without opening Settings');
  check(document.querySelector('.chat-send').disabled, 'Old unpersisted cache cannot claim an execution identity');
  await respond(0, saved);
  await until(() => !document.querySelector('.chat-send').disabled);
  check(currentRoute.provider === 'saved-route' && currentRoute.modelId === 'saved-model', 'Startup restores availability without replacing the conversation route');
  submit(); await until(() => sends.length === 1);
  check(sends[0].provider === 'saved-route' && sends[0].model === 'saved-model' && sends[0].effort === 'xhigh', 'Real composer sends after startup hydration');

  control.setText('Keep the selected route');
  control.setSettingsOpen(true);
  await until(() => requests.length === 2 && document.querySelector('#settings-editor'));
  control.setDraft(draft => ({ ...draft, chat: { ...draft.chat, name: 'User draft', model: 'unsaved-model', api_key: 'fixture-secret' },
    profiles: [{ id: 'unsaved-route', provider: 'custom', model: 'unsaved-model', _persisted: false }] }));
  await sleep(80);
  const server = { ...saved, chat: { ...saved.chat, name: 'Server route' } };
  await respond(1, server);
  check(control.draft.chat.model === 'unsaved-model' && control.draft.chat.name === 'User draft', 'Refresh preserves the user editor draft');
  check(control.providerOptions.length === 1 && control.providerOptions[0].defaultModelId === 'saved-model', 'Unsaved model and new provider do not enter the execution catalog');
  submit(); await until(() => sends.length === 2);
  check(sends[1].provider === 'saved-route' && sends[1].model === 'saved-model', 'Unsaved Settings edits do not change the actual send');

  control.setText('Verify saved cache');
  control.setSettingsOpen(false); await until(() => requests.length === 3);
  const saving = control.handlers.handleSaveSettingsDraft('llm');
  await until(() => requests.length === 4);
  check(requests[2].init.signal.aborted && requests[3].init.method === 'PUT', 'Saving invalidates the old read before submitting');
  check(JSON.parse(requests[3].init.body).chat.api_key === 'fixture-secret', 'Backend submission still receives the credential draft');
  const committed = { ...saved, chat: { ...saved.chat, name: 'Canonical saved route', api_key_configured: true } };
  await respond(3, committed);
  check(await saving, 'Successful save is reported as successful');
  await respond(2, { ...saved, chat: { ...saved.chat, model: 'late-old-model' } });
  check(control.providerOptions[0].defaultModelId === 'saved-model', 'Late GET cannot roll back a successful save');
  const cached = JSON.parse(storage.get(LLM_SETTINGS_STORAGE_KEY));
  check(cached.chat._persisted === true && cached.chat.name === 'Canonical saved route'
    && cached.profiles.length === 0 && !storage.get(LLM_SETTINGS_STORAGE_KEY).includes('fixture-secret'), 'Cache is the normalized saved response without secrets or unsaved rows');

  root.render(<Fixture key="restart" />);
  await until(() => requests.length === 5 && currentRoute?.provider === 'saved-route');
  await until(() => !document.querySelector('.chat-send').disabled);
  check(!document.querySelector('#settings-editor'), 'Restart uses saved cache without visiting Settings');
  submit(); await until(() => sends.length === 3);
  check(sends[2].provider === 'saved-route' && sends[2].model === 'saved-model', 'Restarted composer sends while the startup GET is still pending');
  await respond(4, committed);

  control.setText('Deleted routes must stay blocked'); await sleep();
  const deleting = control.handlers.handleDeleteLlmProvider('chat', 'saved-route');
  await until(() => requests.length === 6);
  await respond(5, { profiles: [] });
  check(await deleting, 'Deletion uses the same successful-response synchronization');
  await until(() => document.querySelector('.chat-send').disabled);
  submit(); await sleep(100);
  check(sends.length === 3 && JSON.parse(storage.get('fixture-llm-selection')).providerId === 'saved-route' && control.providerOptions.length === 0,
    'Actually deleted provider remains selected but refuses sending');
  check(errors.length === 0, 'No page errors or unexpected API calls');
  check(notices.every(([kind]) => kind === 'success'), 'Successful writes have no false failure notice');
}
run().catch(error => checks.push(`FAIL ${error.stack || error}`)).finally(() => {
  root.unmount();
  window.fetch = originalFetch;
  const report = document.getElementById('checks');
  report.textContent = checks.join('\n');
  report.dataset.result = checks.some(row => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
