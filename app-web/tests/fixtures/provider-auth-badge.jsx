import React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPage } from '../../src/features/settings/components/SettingsPage.jsx';
import { ModelPicker } from '../../src/features/chat/components/ModelPickers.jsx';
import { WorkflowRuntimeConfig } from '../../src/features/workflow/components/WorkflowRuntimeConfig.jsx';
import { runtimeLlmProviderOptions } from '../../src/features/settings/model/llm-settings.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

const draft = {
  chat: { id: 'openai-api', provider: 'openai', auth_mode: 'api_key', model: 'gpt' },
  profiles: [
    { id: 'openai-oauth', provider: 'openai', auth_mode: 'oauth', model: 'gpt' },
    { id: 'xai-oauth', provider: 'xai', auth_mode: 'oauth', model: 'grok' },
    { id: 'deepseek-api', provider: 'deepseek', auth_mode: 'api_key', model: 'deepseek' },
    { id: 'xai-long', provider: 'xai', auth_mode: 'oauth', model: 'grok' },
  ],
  vision: { providers: [] }, image: { providers: [] }, compact: { providers: [] }, embedding: {},
};
const providers = runtimeLlmProviderOptions(draft).map(option => option.id === 'xai-long' ? { ...option, label: 'xAI with a very long provider name that must be truncated' } : option);
const changes = [];
window.fetch = async () => Response.json({ models: [] });
function Fixture() {
  const [selection, setSelection] = React.useState({ llm: 'chat' });
  const [provider, setProvider] = React.useState('openai-api');
  return <AppTooltipProvider>
    <div id="settings"><SettingsPage activeSection="llm" onSectionChange={() => {}}
      selectionBySection={selection} onSelectionChange={setSelection} llmDraft={draft}
      records={{ memory: [], tools: [] }} onRecordsChange={() => {}} onLlmDraftChange={() => {}}
      agentSettings={{ presets: [], custom: [] }} workflowSettings={{ presets: [], custom: [] }}
      onAgentSettingsChange={() => {}} onWorkflowSettingsChange={() => {}} onSave={() => {}} /></div>
    <div id="chat" className="chat-composer"><ModelPicker value="gpt" options={[{ id: 'gpt', label: 'gpt' }]}
      reasoningEffort="high" providerValue={provider} providerOptions={providers}
      onProviderChange={id => { changes.push(id); setProvider(id); }} /></div>
    <div id="workflow"><WorkflowRuntimeConfig value={{ llm_config_id: 'openai-api', model_id: 'gpt' }}
      providerOptions={providers} onChange={value => changes.push(value.llm_config_id)} /></div>
  </AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
const sleep = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
const report = document.getElementById('checks');
const results = [];
const check = (condition, label) => { if (!condition) throw new Error(label); results.push(`PASS ${label}`); };
const badge = element => element?.querySelector('[data-slot="badge"]')?.textContent || '';
const click = async element => { check(Boolean(element), 'control exists'); element.click(); await sleep(); };
const labels = elements => elements.map(element => [element.querySelector('.model-picker-option-label')?.textContent, badge(element)]);
async function run() {
  await sleep(500);
  const rows = [...document.querySelectorAll('#settings .settings-row-main')];
  check(JSON.stringify(rows.map(row => [row.getAttribute('aria-label'), badge(row)])) === JSON.stringify([
    ['Edit OpenAI API', 'API'], ['Edit OpenAI OAuth', 'OAuth'], ['Edit xAI OAuth', 'OAuth'], ['Edit DeepSeek', ''], ['Edit xAI OAuth', 'OAuth'],
  ]), 'Settings rows and accessible names distinguish same-brand records');
  check(rows[0].querySelector('[data-slot="badge"]').getAttribute('data-variant') === 'secondary', 'Settings reuses the secondary Badge');
  const settingsStyle = getComputedStyle(rows[0].querySelector('[data-slot="badge"]'));
  await click(document.querySelector('#chat .model-picker-trigger'));
  await click(document.querySelector('#chat .model-picker-quick-summary'));
  const providerEntry = [...document.querySelectorAll('#chat .model-picker-submenu-entry')].find(element => element.textContent.includes('OpenAI'));
  check(badge(providerEntry) === 'API', 'Chat current provider displays API');
  await click(providerEntry);
  let options = [...document.querySelectorAll('#chat .model-picker-flyout-provider [role="option"]')];
  check(JSON.stringify(labels(options)) === JSON.stringify([['OpenAI', 'API'], ['OpenAI', 'OAuth'], ['xAI', 'OAuth'], ['DeepSeek', ''], ['xAI with a very long provider name that must be truncated', 'OAuth']]), 'Chat choices distinguish both modes without labeling other providers');
  const adjacent = element => {
    const label = element.querySelector('.model-picker-option-label').getBoundingClientRect();
    const authBadge = element.querySelector('[data-slot="badge"]').getBoundingClientRect();
    const gap = authBadge.left - label.right;
    return gap >= 0 && gap <= 9;
  };
  check(adjacent(providerEntry) && adjacent(options[0]) && adjacent(options[1]) && adjacent(options[2]), 'Provider badges sit immediately after names in both menus');
  check(adjacent(options[4]) && options[4].querySelector('.model-picker-option-label').scrollWidth > options[4].querySelector('.model-picker-option-label').clientWidth, 'Long provider names truncate while the badge remains adjacent');
  const activeCheck = options[0].querySelector('.model-picker-check').getBoundingClientRect();
  const optionBounds = options[0].getBoundingClientRect();
  const submenuCaret = providerEntry.querySelector('.model-picker-subcaret').getBoundingClientRect();
  const submenuBounds = providerEntry.getBoundingClientRect();
  check(optionBounds.right - activeCheck.right < 15 && submenuBounds.right - submenuCaret.right < 15, 'Selection check and submenu caret remain aligned to the right');
  const chatStyle = getComputedStyle(options[1].querySelector('[data-slot="badge"]'));
  check(chatStyle.backgroundColor === settingsStyle.backgroundColor && chatStyle.color === settingsStyle.color && chatStyle.fontSize === settingsStyle.fontSize, 'Chat badge matches Settings secondary badge styling');
  await click(options[1]);
  check(changes.at(-1) === 'openai-oauth' && badge(providerEntry) === 'OAuth', 'Selecting OAuth keeps its exact record identity and updates current badge');
  options = [...document.querySelectorAll('#chat .model-picker-flyout-provider [role="option"]')];
  check(options[1].getAttribute('aria-selected') === 'true', 'OAuth selection is active');
  const nodeProvider = document.querySelector('#workflow [aria-label="Node provider"]');
  check(badge(nodeProvider) === 'API' && nodeProvider.getAttribute('aria-description') === 'Authentication: API', 'Workflow selected provider exposes the API badge');
  nodeProvider.focus(); nodeProvider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await sleep();
  const workflowOptions = [...document.querySelectorAll('.workflow-runtime-select-menu [role="option"]')];
  check(JSON.stringify(workflowOptions.map(element => [element.getAttribute('data-value'), badge(element)])) === JSON.stringify([
    ['value:openai-api', 'API'], ['value:openai-oauth', 'OAuth'], ['value:xai-oauth', 'OAuth'], ['value:deepseek-api', ''], ['value:xai-long', 'OAuth'],
  ]), 'Workflow choices distinguish both modes and retain IDs');
  check(workflowOptions[1].textContent.includes('OAuth'), 'Workflow option exposes authentication in its accessible text');
  workflowOptions[1].focus(); workflowOptions[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep();
  check(changes.at(-1) === 'openai-oauth', 'Workflow selection retains the OAuth record identity');
  report.dataset.result = 'PASS'; report.textContent = results.join('\n');
}
run().catch(error => { report.dataset.result = 'FAIL'; report.textContent = `${results.join('\n')}\nFAIL ${error.stack || error}`; });
