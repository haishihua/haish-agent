import React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPage } from '../../src/features/settings/components/SettingsPage.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import { normalizeAgentSettings } from '../../src/features/agents/model/agent-settings.js';
import '../../styles.css';

const payload = { presets: [{ agent_id: 'preset.default', display_name: 'Default' }, { agent_id: 'preset.disabled', display_name: 'Disabled preset', enabled: false }], custom: [{ agent_id: 'custom.one', display_name: 'Custom', custom: true }, { agent_id: 'custom.disabled', display_name: 'Disabled custom', custom: true, enabled: false }] };
const state = { requests: 0, section: 'memory' };
window.__agentCountFixture = state;
function Harness() {
  const [section, setSection] = React.useState('memory');
  const [expanded, setExpanded] = React.useState(false);
  const [agents, setAgents] = React.useState(() => normalizeAgentSettings(null));
  const [ready, setReady] = React.useState(false);
  const needsAgents = expanded || ['agent', 'workflow'].includes(section);
  React.useEffect(() => {
    if (!needsAgents) return undefined;
    state.requests += 1;
    const timer = setTimeout(() => { setAgents(normalizeAgentSettings(payload)); setReady(true); }, 500);
    return () => clearTimeout(timer);
  }, [needsAgents]);
  const changeSection = next => { state.section = next; setSection(next); };
  return <AppTooltipProvider><SettingsPage activeSection={section} onSectionChange={changeSection}
    selectionBySection={{}} onSelectionChange={() => {}}
    llmDraft={{ profiles: [], vision: { providers: [] }, embedding: {}, compact: { providers: [] } }}
    records={{ memory: [], tools: [] }} onRecordsChange={() => {}} onLlmDraftChange={() => {}}
    agentSettings={agents} onAgentSettingsChange={setAgents} agentSettingsLoading={!ready}
    onAutomationExpandedChange={setExpanded} workflowSettings={{ presets: [], custom: [] }}
    onWorkflowSettingsChange={() => {}} onSave={() => {}} /></AppTooltipProvider>;
}
createRoot(document.getElementById('root')).render(<Harness />);
const tick = ms => new Promise(resolve => setTimeout(resolve, ms));
const results = [];
const check = (condition, label) => results.push(`${condition ? 'PASS' : 'FAIL'} ${label}`);
const nav = label => [...document.querySelectorAll('.settings-nav-item')].find(button => button.querySelector('span')?.textContent === label);
async function run() {
  await tick(300);
  check(state.requests === 0, 'No request before Automation is visible');
  [...document.querySelectorAll('.settings-nav-group')].find(button => button.textContent.includes('Automation')).click();
  await tick(100);
  check(state.requests === 1 && state.section === 'memory', 'Expanding Automation starts load without clicking Agent');
  check(nav('Agent')?.querySelector('[aria-label="Loading agent count"]'), 'Pending count shows loading, not default 1');
  const aligned = () => {
    const counts = [...document.querySelectorAll('.settings-nav-item small')];
    const boxes = counts.map(count => count.getBoundingClientRect());
    return boxes.length > 1 && boxes.every(box => Math.abs(box.right - boxes[0].right) < 0.5 && Math.abs(box.width - 24) < 0.5);
  };
  check(aligned(), 'Loading indicator and all navigation counts share a fixed right column');
  await tick(700);
  check(nav('Agent')?.querySelector('small').textContent === '4', 'Count includes two presets and two custom agents, even disabled');
  check(state.section === 'memory', 'Agent total arrives before Agent navigation');
  nav('Agent').click();
  await tick(150);
  check(state.requests === 1 && state.section === 'agent', 'Opening Agent reuses loaded request');
  nav('Workflow').click();
  await tick(150);
  check(state.requests === 1 && state.section === 'workflow', 'Switching to Workflow does not duplicate the Agent request');
  const workflowButton = nav('Workflow');
  const workflowLabel = workflowButton.querySelector('span');
  workflowLabel.textContent = 'A deliberately long Workflow label';
  check(aligned(), 'Selected long Workflow label cannot displace counts');
  workflowLabel.textContent = 'Workflow';
  const workflowCount = workflowButton.querySelector('small');
  const original = workflowCount.textContent;
  workflowCount.textContent = '123';
  check(aligned(), 'Three-digit counts retain the same right edge and width');
  workflowCount.textContent = original;
  nav('Agent').click();
  await tick(100);
  check(aligned(), 'Switching selection to Agent retains alignment');
}
run().catch(error => check(false, error.message)).finally(() => {
  const output = document.getElementById('checks');
  output.textContent = results.join('\n');
  output.dataset.result = results.some(row => row.startsWith('FAIL')) ? 'FAIL' : 'PASS';
});
