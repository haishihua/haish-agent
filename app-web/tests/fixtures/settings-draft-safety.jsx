import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentConfigEditor } from '../../src/features/settings/components/AgentConfigEditor.jsx';
import { useLiveToolsSettings } from '../../src/features/settings/hooks/useLiveToolsSettings.js';
import { applyToolsSettingsPayloadToRecords } from '../../src/features/settings/model/settings-payload.js';
import { createDefaultSettingsRecords } from '../../src/features/settings/model/settings-records.js';
import { normalizeAgentSettings, agentCatalogFromSettings, withAlwaysAllowedAgentTools } from '../../src/features/agents/model/agent-settings.js';
import { createSettingsHandlers } from '../../src/features/settings/hooks/createSettingsHandlers.js';
import { createSkillInventoryCache } from '../../src/features/settings/model/skill-inventory.js';
import '../../styles.css';

const requests = [];
const submissions = [];
const toolGroups = [{ id: 'files', label: 'Files', tools: ['read_file', 'list_dir'] }, { id: 'shell', label: 'Shell', tools: ['exec_command'] }];
const agentFixture = allow => normalizeAgentSettings({ custom: [{ agent_id: 'custom.fixture', display_name: 'Fixture', custom: true, tool_policy: { allow, deny: ['exec_command'] } }], tool_groups: toolGroups });
const payload = name => ({
  skills: { items: [{ name }] },
  mcp: { config: { servers: { saved: {} } } },
  web_search: { provider: 'serpapi', providers: { tavily: { api_key_configured: true }, serpapi: { api_key_configured: true } } },
});
function Harness() {
  const [records, setRecords] = useState(createDefaultSettingsRecords);
  const [agents, setAgents] = useState(() => agentFixture(null));
  const [state, setState] = useState({ status: 'idle' });
  const [enabled, setEnabled] = useState(true);
  const [context, setContext] = useState('workspace-a');
  const refreshRef = useRef(null);
  const cache = useRef(createSkillInventoryCache());
  useLiveToolsSettings({
    enabled, contextKey: context, busy: '', records, refreshRef, cache: cache.current,
    fetchPayload: signal => new Promise(resolve => requests.push({ resolve, signal })),
    onPayload: (incoming, initial) => setRecords(prev => applyToolsSettingsPayloadToRecords(prev, incoming, initial)),
    onState: setState,
  });
  const mcp = records.tools.find(record => record.id === 'tools-mcp');
  const web = records.tools.find(record => record.id === 'tools-web');
  const update = (id, patch) => setRecords(prev => ({ ...prev, tools: prev.tools.map(record => record.id === id ? { ...record, ...patch } : record) }));
  const handlers = createSettingsHandlers({
    API_BASE: '', agentSettingsDraft: agents, normalizeAgentSettings, agentCatalogFromSettings, withAlwaysAllowedAgentTools,
    setAgentSettingsDraft: setAgents, setAgentCatalog() {}, showToast() {},
    apiFetch: async (_url, init) => {
      const submitted = JSON.parse(init.body);
      submissions.push(submitted);
      return { ok: true, json: async () => ({ ...agents, custom: [{ ...submitted, custom: true }] }) };
    },
  });
  return <main className="settings-page"><section>
    <h2>Inventory draft isolation</h2>
    <label>MCP<textarea id="mcp-draft" value={mcp.mcp_json} onChange={event => update(mcp.id, { mcp_json: event.target.value })} /></label>
    <label>Search key<input id="key-draft" value={web.web_search.providers.tavily.api_key} onChange={event => update(web.id, { web_search: { ...web.web_search, providers: { ...web.web_search.providers, tavily: { ...web.web_search.providers.tavily, api_key: event.target.value } } } })} /></label>
    <output id="inventory">{records.tools.find(record => record.id === 'tools-skills').skills.map(skill => skill.name).join(',')}</output>
    <output id="load-state">{state.status}</output>
    <output id="search-mode">{web.web_search.provider}</output>
    <output id="configured-key">{String(web.web_search.providers.serpapi.api_key_configured)}</output>
    <button id="toggle-loader" onClick={() => setEnabled(value => !value)}>Toggle loader</button>
    <button id="context-switch" onClick={() => setContext('workspace-b')}>Switch workspace</button>
  </section><section id="agent-editor">
    <h2>Agent tools</h2>
    <button id="reset-all" onClick={() => setAgents(agentFixture(null))}>All</button>
    <button id="reset-none" onClick={() => setAgents(agentFixture([]))}>None</button>
    <button id="reset-list" onClick={() => setAgents(agentFixture(['read_file']))}>List</button>
    <AgentConfigEditor selectedId="custom.fixture" settings={agents} onSettingsChange={setAgents} />
    <button id="save-agent" onClick={() => handlers.handleSaveCustomAgent('custom.fixture')}>Save agent</button>
  </section></main>;
}
createRoot(document.getElementById('root')).render(<Harness />);
const tick = () => new Promise(resolve => setTimeout(resolve, 80));
const report = document.getElementById('checks');
const results = [];
const check = (condition, label) => { if (!condition) throw new Error(label); results.push(`PASS ${label}`); };
const input = async (element, value) => {
  const type = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(type.prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await tick();
};
const click = async id => { document.querySelector(id).click(); await tick(); };
const groupCheckbox = label => [...document.querySelectorAll('#agent-editor label')].find(row => row.textContent.trim() === label)?.querySelector('[role="checkbox"]');
const allSwitch = () => [...document.querySelectorAll('#agent-editor label')].find(row => row.textContent.includes('Allow all tools'))?.querySelector('[role="switch"]');
const checkDrafts = label => {
  check(document.getElementById('mcp-draft').value === '{"servers":{"draft":{}}}', `${label}: MCP edit preserved`);
  check(document.getElementById('key-draft').value === 'fixture-unsaved-key', `${label}: search key preserved`);
};
async function run() {
  await tick();
  check(requests.length === 1, 'first GET starts once');
  await input(document.getElementById('mcp-draft'), '{"servers":{"draft":{}}}');
  await input(document.getElementById('key-draft'), 'fixture-unsaved-key');
  window.dispatchEvent(new Event('focus')); await tick();
  check(requests.length === 2 && requests[0].signal.aborted, 'focus supersedes a pending first GET');
  requests[0].resolve(payload('stale')); await tick();
  check(document.getElementById('inventory').textContent === '', 'superseded first response ignored');
  requests[1].resolve(payload('initial')); await tick();
  checkDrafts('delayed first GET');
  check(document.getElementById('search-mode').textContent === 'serpapi', 'untouched provider initialized');
  check(document.getElementById('configured-key').textContent === 'true', 'untouched configured-key metadata initialized');
  window.dispatchEvent(new Event('focus')); await tick();
  check(requests.length === 3, 'focus starts one inventory refresh');
  requests[2].resolve(payload('focus')); await tick();
  checkDrafts('focus refresh');
  check(document.getElementById('inventory').textContent === 'focus', 'focus refresh updates skills');
  await click('#toggle-loader'); await click('#toggle-loader');
  requests[3].resolve(payload('reopened')); await tick();
  checkDrafts('loader reopen');
  await click('#context-switch');
  requests[4].resolve(payload('workspace-b')); await tick();
  checkDrafts('workspace refresh');
  check(document.getElementById('inventory').textContent === 'workspace-b', 'new workspace skills applied');
  check(allSwitch().getAttribute('aria-checked') === 'true', 'null policy shows all/inheritance switch');
  check(groupCheckbox('Files').getAttribute('aria-checked') === 'true', 'null policy selects allowed tools');
  check(groupCheckbox('Shell').getAttribute('aria-checked') === 'false', 'deny overrides null in UI');
  const name = document.querySelector('#agent-editor input');
  await input(name, 'Renamed'); await click('#save-agent');
  check(submissions.at(-1).tool_policy.allow === null, 'name-only save preserves null');
  check(submissions.at(-1).tool_policy.deny[0] === 'exec_command', 'name-only save preserves deny');
  groupCheckbox('Files').click(); await tick(); await click('#save-agent');
  check(Array.isArray(submissions.at(-1).tool_policy.allow) && submissions.at(-1).tool_policy.allow.length === 0, 'deliberate uncheck materializes effective empty list');
  await click('#reset-none');
  check(allSwitch().getAttribute('aria-checked') === 'false' && groupCheckbox('Files').getAttribute('aria-checked') === 'false', 'empty list shows no tools');
  await click('#save-agent'); check(submissions.at(-1).tool_policy.allow.length === 0, 'empty list save round trip');
  await click('#reset-list');
  check(groupCheckbox('Files').getAttribute('aria-checked') === 'mixed', 'partial group displays mixed, not full permission');
  await click('#save-agent');
  check(JSON.stringify(submissions.at(-1).tool_policy.allow) === '["read_file"]', 'explicit list save round trip');
  groupCheckbox('Shell').click(); await tick(); await click('#save-agent');
  check(submissions.at(-1).tool_policy.allow.includes('exec_command') && !submissions.at(-1).tool_policy.deny.includes('exec_command'), 'deliberate enabling clears only relevant deny');
  allSwitch().click(); await tick(); await click('#save-agent');
  check(submissions.at(-1).tool_policy.allow === null, 'all switch restores null semantics');
  report.dataset.result = 'PASS'; report.textContent = results.join('\n');
}
run().catch(error => { report.dataset.result = 'FAIL'; report.textContent = `${results.join('\n')}\nFAIL ${error.stack || error}`; });
