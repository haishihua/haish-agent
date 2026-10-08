import React from 'react';
import { createRoot } from 'react-dom/client';
import { SettingsPage } from '../../src/features/settings/components/SettingsPage.jsx';
import { useLiveToolsSettings } from '../../src/features/settings/hooks/useLiveToolsSettings.js';
import { createSkillInventoryCache } from '../../src/features/settings/model/skill-inventory.js';
import '../../styles/base.css';
import '../../styles/app-shell.css';
import '../../src/features/settings/settings.css';

const preset = { name: 'settings-manager', source: 'preset', enabled: true, description: 'Manage current Haish settings.' };
const global = { name: 'shared-skill', source: 'codex-copy', enabled: false, shadowed: true, description: 'Global version.' };
const project = { name: 'shared-skill', source: 'codex-copy', scope: 'workspace', enabled: false, description: 'Project version.' };
const calls = [];
const inventory = { tools: [{ id: 'tools-skills', skills: [preset, project], skill_groups: { builtin: [preset], global: [global], project: [project] }, skill_workspace: '/projects/contract-review', skill_can_install: true }] };
let records = { tools: [{ id: 'tools-skills', skills: [] }] };
let state = { status: 'loading' };
let activeSection = 'memory';
let selection = { tools: 'tools-mcp' };
let expansionRequests = 0;
let finishLoading;
const root = createRoot(document.getElementById('root'));
function Fixture() {
  const [expanded, updateExpanded] = React.useState(false);
  const [loadedState, updateLoadedState] = React.useState(state);
  const [loadedRecords, updateLoadedRecords] = React.useState(records);
  const cache = React.useRef(createSkillInventoryCache());
  const refreshRef = React.useRef(null);
  useLiveToolsSettings({
    enabled: activeSection === 'tools' || expanded,
    contextKey: 'fixture/current-project', busy: '', cache: cache.current, refreshRef,
    fetchPayload: signal => {
      expansionRequests++;
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
        finishLoading = () => resolve({ skills: { items: [preset, project] } });
      });
    },
    onState: next => { state = next; updateLoadedState(next); },
    onPayload: () => { records = inventory; updateLoadedRecords(inventory); },
  });
  const effectiveState = state === loadedState ? loadedState : state;
  return <SettingsPage activeSection={activeSection} selectionBySection={selection} records={records === loadedRecords ? loadedRecords : records} llmDraft={{}} agentSettings={{}} workflowSettings={{}} toolsSettingsState={effectiveState}
    onSkillsExpandedChange={updateExpanded}
    onSectionChange={section => { activeSection = section; draw(); }} onSelectionChange={update => { selection = typeof update === 'function' ? update(selection) : update; draw(); }}
    onRecordsChange={() => {}} onRefreshTools={() => refreshRef.current?.()} onInstallSkill={(file, scope) => calls.push({ file, scope })}
    onToggleSkill={(name, enabled) => calls.push({ name, enabled })} />;
}
const draw = () => root.render(<Fixture />);
const wait = async predicate => {
  for (let n = 0; n < 100; n++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('UI timed out');
};
const checks = [];
const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(`PASS ${message}`); };
const nav = label => [...document.querySelectorAll('.settings-skill-nav-children button')].find(button => button.textContent.startsWith(label));
async function main() {
  draw();
  await wait(() => document.querySelector('.settings-nav-group'));
  check(expansionRequests === 0, 'collapsed Skills does not request inventory');
  [...document.querySelectorAll('.settings-nav-group')].find(button => button.textContent === 'Tools').click();
  await wait(() => document.querySelector('.settings-skill-nav-parent'));
  document.querySelector('.settings-skill-nav-parent').click();
  await wait(() => expansionRequests === 1 && finishLoading);
  check(activeSection === 'memory' && selection.tools === 'tools-mcp', 'expanding Skills loads without selecting a child or switching page');
  check(document.querySelectorAll('.settings-skill-nav-children [role="status"]').length === 3, 'counts use existing Settings spinner while pending');
  finishLoading();
  await wait(() => [...document.querySelectorAll('.settings-skill-nav-children small')].every(el => el.textContent === '1'));
  check(activeSection === 'memory', 'all three counts appear before child click');
  nav('Built-in').click();
  await wait(() => document.querySelector('[aria-label="Edit settings-manager"]'));
  check(expansionRequests === 1, 'clicking child uses completed expansion request');
  check(document.querySelectorAll('.settings-skill-nav-children button').length === 3, 'three source pages are in left navigation');
  check(!document.querySelector('[role="tablist"]'), 'no in-page source tabs');
  check(document.querySelector('[aria-label="Edit settings-manager"]'), 'preset visible');
  check(!document.querySelector('[aria-label="Edit shared-skill"]'), 'other scopes hidden');
  nav('Global').click();
  await wait(() => document.querySelector('[aria-label="Edit shared-skill"]'));
  check(document.querySelector('#skill-list-panel').textContent.includes('Overridden by the current project'), 'override disclosed');
  check(!document.querySelector('#skill-list-panel [role="switch"]'), 'shadowed global version cannot toggle effective project skill');
  nav('Project').click();
  await wait(() => document.querySelector('.settings-skill-context').textContent.includes('/projects/contract-review'));
  const actions = document.querySelectorAll('.settings-skill-actions button');
  check(actions.length === 2 && actions[0].textContent === 'Refresh' && actions[1].textContent.includes('Install skill'), 'refresh and install adjacent in top-right actions');
  check(actions[0].querySelector('.lucide-refresh-cw'), 'Refresh has refresh icon');
  const contentStyle = getComputedStyle(document.querySelector('.settings-skills-content'));
  const headingStyle = getComputedStyle(document.querySelector('.settings-skills-content .settings-page-heading'));
  const descriptionStyle = getComputedStyle(document.querySelector('.settings-skill-context p'));
  check(contentStyle.paddingTop === '16px' && contentStyle.paddingLeft === '20px' && headingStyle.marginBottom === '6px' && descriptionStyle.marginTop === '0px', 'Skills heading and descriptions use compact spacing');
  state = { status: 'ready', refreshing: true };
  draw();
  await wait(() => document.querySelector('.settings-skill-actions .settings-spin'));
  check(document.querySelector('.settings-skill-actions button').disabled, 'refresh spins and blocks duplicate requests');
  state = { status: 'ready' };
  draw();
  await wait(() => !document.querySelector('.settings-skill-actions button').disabled);
  check(document.querySelector('#skill-list-panel').textContent.includes('Project version'), 'project contents visible');
  check(document.querySelector('.settings-skill-context').textContent.includes('shared across projects'), 'toggle scope disclosed');
  document.querySelector('[role="switch"]').click();
  await wait(() => calls.length);
  check(calls[0].name === 'shared-skill' && calls[0].enabled === true, 'toggle callback preserved');
  actions[1].click();
  await wait(() => document.querySelector('.settings-skill-install-destination'));
  check(document.querySelector('.settings-skill-install-destination').textContent.includes('Project · /projects/contract-review'), 'install destination is current project');
  [...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent === 'Cancel').click();
  records = { tools: [{ ...records.tools[0], skill_workspace: '/projects/empty', skill_groups: { builtin: [preset], global: [global], project: [] } }] };
  draw();
  await wait(() => document.querySelector('#skill-list-panel').textContent.includes('No skills in this scope'));
  check(document.querySelector('.settings-skill-context').textContent.includes('/projects/empty'), 'empty project identifies new workspace');
  state = { status: 'ready', error: 'Refresh failed' };
  draw();
  await wait(() => document.querySelector('.settings-skill-refresh-error'));
  check(document.querySelector('#skill-list-panel'), 'list retained on refresh failure');
  state = { status: 'loading' };
  draw();
  await wait(() => !document.querySelector('#skill-list-panel'));
  check(document.querySelectorAll('.settings-skill-nav-children [role="status"]').length === 3 && document.querySelector('[data-slot="generation-loader"]'), 'pending skill page reuses Settings LoadingState');
  check(expansionRequests === 1, 'switching three Skill pages never restarts request');
  state = { status: 'ready' };
  draw();
  // Start another request from expansion, then click children before it completes.
  activeSection = 'memory';
  draw();
  await wait(() => !document.querySelector('#skill-list-panel'));
  document.querySelector('.settings-skill-nav-parent').click();
  await wait(() => document.querySelector('.settings-skill-nav-parent')?.getAttribute('aria-expanded') === 'false');
  check(expansionRequests === 1, 'collapsing stops loader without another request');
  document.querySelector('.settings-skill-nav-parent').click();
  await wait(() => expansionRequests === 2);
  nav('Built-in').click(); nav('Global').click();
  await wait(() => document.querySelector('h1')?.textContent === 'Skills · Global');
  check(expansionRequests === 2, 'in-flight expansion request survives child navigation');
  finishLoading();
  await wait(() => !document.querySelector('.settings-skill-actions .settings-spin'));
  check(expansionRequests === 2, 'expansion response completes after child navigation');
}
main().then(() => { document.getElementById('checks').dataset.result = 'PASS'; document.getElementById('checks').textContent = checks.join('\n'); }).catch(error => { document.getElementById('checks').dataset.result = 'FAIL'; document.getElementById('checks').textContent = `${checks.join('\n')}\n${error.stack}`; });
