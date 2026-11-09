import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatPanel } from '../../src/features/chat/components/ChatPanel.jsx';
import { DraftProjectPicker } from '../../src/features/chat/components/DraftProjectPicker.jsx';
import { SettingsPage } from '../../src/features/settings/components/SettingsPage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { SchedulesContext } from '../../src/features/schedules/hooks/useSchedules.js';
import { createRunConfigSync } from '../../src/features/conversations/model/run-config-sync.js';
import '../../styles.css';

window.__onboardingErrors = [];
window.addEventListener('error', event => window.__onboardingErrors.push(String(event.message)));
window.addEventListener('unhandledrejection', event => window.__onboardingErrors.push(String(event.reason)));
const originalFetch = window.fetch;
window.fetch = (input, init) => {
  if (String(input).includes('/api/approvals/state')) return Promise.resolve(Response.json({ mode: 'default' }));
  if (String(input).includes('/api/')) return Promise.reject(new Error(`Unexpected offline request: ${String(input)}`));
  return originalFetch(input, init);
};
const sync = createRunConfigSync({ get: async () => ({}), save: async (_id, config) => config });
function Harness() {
  const [mode, setMode] = React.useState('chat');
  const [show, setShow] = React.useState(false);
  const [messages, setMessages] = React.useState([]);
  const [project, setProject] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [llm, setLlm] = React.useState({ profiles: [], vision: { providers: [] }, image: { providers: [] }, embedding: {}, compact: { providers: [] } });
  const [selection, setSelection] = React.useState({ llm: 'chat', llmConfig: '' });
  const [request, setRequest] = React.useState(null);
  window.__onboarding = { setShow, setMessages, setProject, setDraft, get draft() { return draft; }, get profiles() { return llm.profiles; }, back: () => setMode('chat') };
  return <AppTooltipProvider><SchedulesContext.Provider value={{ currentConversationId: 'fixture', configSync: sync }}>
    {mode === 'chat' ? <div className="fixture-chat"><ChatPanel conversationId="fixture" messages={messages} draft={draft} onDraftChange={setDraft}
      providerOptions={[]} showAddProvider={show} draftProjectSelector={project ? <DraftProjectPicker projects={[{ id: 'a', name: 'Project' }]} selectedId="a" onSelect={() => {}} /> : null}
      onAddProvider={() => { setSelection(prev => ({ ...prev, llm: 'chat' })); setRequest({ section: 'llm', action: 'create-chat-provider' }); setMode('settings'); }} /></div>
      : <SettingsPage activeSection="llm" onSectionChange={() => {}} selectionBySection={selection} onSelectionChange={setSelection}
        llmDraft={llm} onLlmDraftChange={setLlm} records={{ memory: [], tools: [] }} onRecordsChange={() => {}}
        agentSettings={{ presets: [], custom: [] }} workflowSettings={{ presets: [], custom: [] }}
        onAgentSettingsChange={() => {}} onWorkflowSettingsChange={() => {}} onSave={() => {}}
        openEditorRequest={request} onOpenEditorRequestConsumed={() => setRequest(null)} />}
  </SchedulesContext.Provider></AppTooltipProvider>;
}
const root = createRoot(document.getElementById('root'));
flushSync(() => root.render(<Harness />));
const tick = () => new Promise(resolve => setTimeout(resolve, 100));
const report = document.querySelector('#checks');
const results = [];
const check = (condition, text) => { if (!condition) throw new Error(text); results.push(`PASS ${text}`); };
async function run() {
  await tick();
  check(!document.querySelector('.chat-add-provider'), 'hidden before confirmed empty catalog');
  flushSync(() => window.__onboarding.setShow(true));
  await tick();
  const button = document.querySelector('.chat-add-provider');
  const surface = document.querySelector('.chat-composer-surface');
  check(Boolean(button && surface), 'shown on empty chat');
  const box = surface.getBoundingClientRect();
  const cta = button.getBoundingClientRect();
  check(Math.abs(cta.left - box.left) < 2 && cta.top - box.bottom >= 6 && cta.top - box.bottom <= 10, 'left aligned 8px below composer');
  check(cta.bottom <= document.querySelector('.chat-workspace').getBoundingClientRect().bottom, 'button stays inside workspace');
  flushSync(() => window.__onboarding.setProject(true));
  await tick();
  const projectCta = document.querySelector('.chat-add-provider').getBoundingClientRect();
  const projectBox = document.querySelector('.chat-composer-surface').getBoundingClientRect();
  check(Math.abs(projectCta.top - projectBox.bottom - 8) < 1 && projectCta.bottom <= document.querySelector('.chat-workspace').getBoundingClientRect().bottom, 'project picker keeps button aligned and visible');
  flushSync(() => window.__onboarding.setProject(false));
  flushSync(() => window.__onboarding.setMessages([{ id: 'u', role: 'user', text: 'hello' }]));
  check(!document.querySelector('.chat-add-provider'), 'hidden in existing conversation');
  flushSync(() => window.__onboarding.setMessages([]));
  flushSync(() => window.__onboarding.setDraft('draft text'));
  await tick();
  check(window.__onboarding.draft.includes('draft text'), 'chat draft entered');
  document.querySelector('.chat-add-provider').click();
  await tick();
  check(Boolean(document.querySelector('.settings-page')), 'opens settings');
  check(window.__onboarding.profiles.length === 1, 'creates one unsaved chat provider draft');
  check(Boolean(document.querySelector('[role="dialog"]')), 'opens provider editor');
  check(window.__onboarding.draft.includes('draft text'), 'draft survives navigation');
  const cancel = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Cancel');
  check(Boolean(cancel), 'cancel available');
  cancel.click();
  await tick();
  check(window.__onboarding.profiles.length === 0, 'cancel discards provider draft');
  flushSync(() => window.__onboarding.back());
  await tick();
  check(window.__onboarding.draft.includes('draft text'), 'draft survives return');
  check(document.querySelector('[contenteditable="true"]')?.textContent.includes('draft text'), 'draft displayed after return');
  check(window.__onboardingErrors.length === 0, 'no runtime errors');
  report.dataset.result = 'PASS'; report.textContent = results.join('\n');
}
run().catch(error => { report.dataset.result = 'FAIL'; report.textContent = `${results.join('\n')}\nFAIL ${error.stack || error}`; });
