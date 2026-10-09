import React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPage } from '../../src/features/settings/components/SettingsPage.jsx';
import { createSettingsHandlers } from '../../src/features/settings/hooks/createSettingsHandlers.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

function Harness() {
  const [enabled, setEnabled] = React.useState(false);
  const [section, setSection] = React.useState('llm');
  const [selection, setSelection] = React.useState({ llm: 'chat', tools: 'tools-mcp' });
  const [mode, setMode] = React.useState('chat');
  const { handleToggleSettings } = createSettingsHandlers({ activeTab: 'dashboard', setSettingsMode: setEnabled, setSettingsSection: setSection });
  return <AppTooltipProvider><header>
    <button id="toggle-settings" onClick={handleToggleSettings}>Settings</button>
    {['chat', 'bot'].map(value => <button key={value} id={`show-${value}`} onClick={() => { setMode(value); setEnabled(false); }}>{value}</button>)}
  </header>{enabled ? <SettingsPage activeSection={section} onSectionChange={setSection}
    selectionBySection={selection} onSelectionChange={setSelection}
    llmDraft={{ profiles: [], vision: { providers: [] }, embedding: {}, compact: { providers: [] } }}
    records={{ memory: [], tools: [] }} onRecordsChange={() => {}} onLlmDraftChange={() => {}}
    agentSettings={{ presets: [], custom: [] }} workflowSettings={{ presets: [], custom: [] }}
    onAgentSettingsChange={() => {}} onWorkflowSettingsChange={() => {}} onSave={() => {}} />
    : <main id="mode-page">{mode}</main>}</AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Harness />);
const tick = () => new Promise(resolve => setTimeout(resolve, 120));
const report = document.getElementById('checks');
const results = [];
const check = (condition, label) => { if (!condition) throw new Error(label); results.push(`PASS ${label}`); };
const selected = () => document.querySelector('.settings-nav-item[aria-current="page"] span')?.textContent;
const nav = label => [...document.querySelectorAll('.settings-nav-item')].find(button => button.querySelector('span')?.textContent === label);
const group = label => [...document.querySelectorAll('.settings-nav-group')].find(button => button.querySelector('span')?.textContent === label);
const click = async selector => { document.querySelector(selector).click(); await tick(); };
async function run() {
  await tick(); await click('#toggle-settings');
  check(selected() === 'Chat', 'First opening selects Providers / Chat');
  for (const [parent, tab] of [['Providers', 'Vision'], ['Tools', 'MCP'], ['Context', 'Memory'], ['Automation', 'Workflow']]) {
    if (!nav(tab)) { group(parent).click(); await tick(); }
    nav(tab).click(); await tick();
    check(selected() === tab, `Select ${tab}`);
    for (const mode of ['chat', 'bot']) {
      await click(`#show-${mode}`);
      check(!document.querySelector('.settings-page'), `Leaving ${tab} for ${mode} unmounts Settings`);
      await click('#toggle-settings');
      check(selected() === tab, `Returning from ${mode} restores ${tab} and expands its group`);
    }
    await click('#toggle-settings'); await click('#toggle-settings');
    check(selected() === tab, `Close / reopen preserves ${tab}`);
  }
  report.dataset.result = 'PASS'; report.textContent = results.join('\n');
}
run().catch(error => { report.dataset.result = 'FAIL'; report.textContent = results.join('\n') + `\nFAIL ${error.stack || error}`; });
