import React from 'react';
import { createRoot } from 'react-dom/client';
import { LlmConfigEditor } from '../../src/features/settings/components/LlmConfigEditor.jsx';
import { createSettingsHandlers } from '../../src/features/settings/hooks/createSettingsHandlers.js';
import { applyLlmSettingsPayloadToDraft, getLlmProvider } from '../../src/features/settings/model/llm-settings.js';
import { getSelectedLlmConfig, llmProviderRequestPayload } from '../../src/features/settings/model/settings-payload.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

// Production editor and handlers; every API request stays in this offline fixture.
const results = [];
const errors = [];
const requests = [];
const notices = [];
const originalFetch = window.fetch;
let saved;
let controls;
const initial = {
  chat: { id: 'native-relay', provider: 'custom', name: 'Native relay', auth_mode: 'api_key',
    base_url: 'https://fixture.invalid/v1', api_key: 'fixture-key', model: 'claude-sonnet-5-5' },
  profiles: [], vision: { providers: [] }, compact: { providers: [] }, image: { providers: [] }, embedding: {},
};
window.fetch = async (input, init) => {
  const url = String(input);
  if (!url.includes('/api/')) return originalFetch(input, init);
  const body = JSON.parse(init?.body || '{}');
  requests.push({ url, body, method: init?.method });
  if (url.endsWith('/api/llm/models')) {
    return Response.json({ provider: body.provider, models: [{ id: body.model || 'claude-sonnet-5-5' }], default_model: body.model });
  }
  if (url.endsWith('/api/settings/llm')) {
    saved = structuredClone(body);
    return Response.json(saved);
  }
  if (url.endsWith('/api/llm/test')) return Response.json({ ok: true });
  throw new Error(`Unexpected fixture API request: ${url}`);
};
window.addEventListener('error', event => errors.push(event.message));
window.addEventListener('unhandledrejection', event => errors.push(String(event.reason)));
function Fixture() {
  const [draft, setDraft] = React.useState(initial);
  const [version, setVersion] = React.useState(0);
  const [readOnly, setReadOnly] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState('chat');
  controls = { draft, setDraft, setReadOnly, setSelectedId, remount: () => setVersion(value => value + 1) };
  const handlers = createSettingsHandlers({
    API_BASE: '', llmSettingsDraft: draft, getSelectedLlmConfig, llmProviderRequestPayload,
    apiFetch: window.fetch, showToast: (...args) => notices.push(args),
    parseResponseMessage: async (_response, fallback) => fallback,
    beginLlmSettingsWrite: () => payload => { if (payload) setDraft(previous => applyLlmSettingsPayloadToDraft(previous, payload)); },
  });
  return <AppTooltipProvider>
    <div style={{ maxWidth: 600, padding: 20 }}>
      <LlmConfigEditor key={version} selectedId={selectedId} draft={draft} onDraftChange={setDraft} readOnly={readOnly} refreshModels />
      <button id="save" onClick={() => { void handlers.handleSaveSettingsDraft('llm'); }}>Save fixture</button>
      <button id="test" onClick={() => { void handlers.handleTestLlmConfig(selectedId); }}>Test fixture</button>
    </div>
  </AppTooltipProvider>;
}
const root = createRoot(document.getElementById('root'));
root.render(<Fixture />);
const sleep = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let index = 0; index < 150; index += 1) { if (predicate()) return; await sleep(); }
  throw new Error('Timed out waiting for fixture state');
}
function check(ok, label) {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) throw new Error(label);
}
function field(label) {
  const node = [...document.querySelectorAll('label')].find(item => item.textContent === label);
  return node ? document.getElementById(node.htmlFor) : null;
}
async function select(label, text) {
  field(label).click();
  await until(() => [...document.querySelectorAll('[role="option"]')].some(item => item.textContent === text));
  [...document.querySelectorAll('[role="option"]')].find(item => item.textContent === text).click();
  await sleep();
}
function input(label, value) {
  const node = field(label);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
  node.dispatchEvent(new Event('input', { bubbles: true }));
}
async function run() {
  await until(() => field('API Protocol'));
  check(field('API Protocol').textContent.includes('OpenAI-compatible'), 'Legacy custom records default to OpenAI-compatible');
  await until(() => requests.some(item => item.url.endsWith('/models')));
  check(requests[0].body.protocol === 'openai', 'Legacy discovery explicitly sends the default protocol');
  await select('API Protocol', 'Anthropic Messages');
  await until(() => requests.some(item => item.body.protocol === 'anthropic'));
  check(controls.draft.chat.protocol === 'anthropic' && controls.draft.chat.model === 'claude-sonnet-5-5', 'Selecting native protocol preserves the Claude model ID');
  check(requests.filter(item => item.url.endsWith('/models')).at(-1).body.protocol === 'anthropic', 'Protocol change refreshes discovery with Anthropic Messages');
  input('Model ID', 'anthropic/claude-opus-5-5');
  await until(() => controls.draft.chat.model === 'anthropic/claude-opus-5-5');
  document.getElementById('save').click();
  await until(() => saved);
  check(saved.chat.protocol === 'anthropic' && saved.chat.model === 'anthropic/claude-opus-5-5', 'Save keeps protocol and unenumerated Claude model together');
  controls.remount(); await sleep();
  check(field('API Protocol').textContent.includes('Anthropic Messages') && field('Model ID').value === saved.chat.model, 'Save readback and editor remount retain the native protocol and model');
  document.getElementById('test').click();
  await until(() => requests.some(item => item.url.endsWith('/test')));
  const tested = requests.find(item => item.url.endsWith('/test')).body;
  check(tested.protocol === 'anthropic' && tested.model === saved.chat.model, 'Connection test submits the native protocol without a real LLM call');
  controls.setReadOnly(true); await sleep();
  check(field('API Protocol').disabled, 'Read-only editor cannot change the protocol');
  controls.setReadOnly(false); await sleep();
  await select('Provider', 'Anthropic');
  check(controls.draft.chat.provider === 'anthropic' && !field('API Protocol'), 'Anthropic is selectable and does not show custom protocol controls');
  check(!field('Auth Mode') && field('API Key') && !document.querySelector('.settings-oauth-connect'), 'Anthropic offers only supported API key authentication');
  check(field('Model ID').value === getLlmProvider('anthropic').defaultModel, 'Anthropic starts with the backend-aligned default model');
  input('API Key', 'fixture-official-key');
  await until(() => requests.some(item => item.body.provider === 'anthropic'));
  const official = requests.find(item => item.body.provider === 'anthropic').body;
  check(official.provider === 'anthropic' && !('protocol' in official), 'Official discovery uses the Anthropic provider, not custom routing');
  for (const scope of ['vision', 'compact']) {
    const entry = { ...initial.chat, id: `fixture-${scope}`, protocol: 'anthropic' };
    controls.setDraft(previous => ({ ...previous, [scope]: { providers: [entry] } }));
    controls.setSelectedId(entry.id); await sleep();
    check(field('API Protocol')?.textContent.includes('Anthropic Messages'), `${scope} editors also expose the native protocol`);
  }
  const image = { ...initial.chat, id: 'fixture-image' };
  controls.setDraft(previous => ({ ...previous, image: { providers: [image] }, embedding: { ...initial.chat, enabled: true } }));
  controls.setSelectedId(image.id); await sleep();
  check(!field('API Protocol'), 'Image generation does not offer unsupported Anthropic Messages');
  controls.setSelectedId('embedding'); await sleep();
  check(!field('API Protocol'), 'Embedding does not offer unsupported Anthropic Messages');
  check(notices.every(([kind]) => kind === 'success') && !errors.length, 'No errors or unexpected API calls');
}
run().catch(error => results.push(`FAIL ${error.message}`)).finally(() => {
  root.unmount();
  window.fetch = originalFetch;
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some(row => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
