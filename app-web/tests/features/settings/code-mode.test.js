import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_AGENT_TOOL_GROUPS,
  agentCatalogFromSettings,
  createDefaultCustomAgentPayload,
  groupIdsForAgentTools,
  normalizeAgentSettings,
  toolsForAgentGroups,
  withAlwaysAllowedAgentTools,
  workflowToolOptionsFromAgentSettings,
} from '../../../src/features/agents/model/agent-settings.js';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';

test('Tool Script is an independent group, not an implicit child-tool permission', () => {
  const group = DEFAULT_AGENT_TOOL_GROUPS.find(item => item.id === 'code_mode');
  assert.equal(group.label, 'Tool Script');
  assert.deepEqual(group.tools, ['code_mode']);
  assert.deepEqual(toolsForAgentGroups(['code_mode']), ['code_mode']);
  assert.deepEqual(groupIdsForAgentTools(['code_mode']), ['code_mode']);
  assert.deepEqual(withAlwaysAllowedAgentTools([]), []);
  assert.equal(createDefaultCustomAgentPayload(null).tool_policy.allow.includes('code_mode'), false);
  assert.ok(workflowToolOptionsFromAgentSettings(null).some(item => item.id === 'code_mode'));
});

test('the runtime catalog stays authoritative, including older runtimes without Tool Script', () => {
  const groups = DEFAULT_AGENT_TOOL_GROUPS.filter(item => item.id !== 'code_mode');
  assert.equal(normalizeAgentSettings({ tool_groups: groups }).tool_groups.some(item => item.id === 'code_mode'), false);
});

for (const draft of [true, false]) {
  test(`Tool Script ${draft ? 'creation' : 'update'} saves and reloads through existing agent handlers`, async () => {
    const id = 'custom.code-mode-settings';
    let saved;
    let displayed;
    const notices = [];
    const makeHandlers = allow => createSettingsHandlers({
      API_BASE: '', normalizeAgentSettings, agentCatalogFromSettings, withAlwaysAllowedAgentTools,
      agentSettingsDraft: normalizeAgentSettings({ custom: [{
        agent_id: id, display_name: 'Tool Script Settings', custom: true, draft,
        tool_policy: { allow, deny: [] },
        mcp_policy: { allow_servers: [], allow_tools: [] },
      }] }),
      setAgentSettingsDraft: value => { displayed = value; },
      setAgentCatalog() {},
      showToast: (...args) => notices.push(args),
      apiFetch: async (url, init) => {
        assert.equal(url, draft ? '/api/settings/agents/custom' : `/api/settings/agents/custom/${id}`);
        assert.equal(init.method, draft ? 'POST' : 'PUT');
        saved = JSON.parse(init.body);
        return { ok: true, json: async () => ({
          tool_groups: DEFAULT_AGENT_TOOL_GROUPS,
          custom: [{ ...saved, agent_id: id, custom: true, effective_tools: saved.tool_policy.allow }],
        }) };
      },
    });
    assert.equal(await makeHandlers(toolsForAgentGroups(['code_mode'])).handleSaveCustomAgent(id), true);
    assert.deepEqual(saved.tool_policy.allow, ['code_mode']);
    assert.deepEqual(saved.mcp_policy, { allow_servers: [], allow_tools: [] });
    let reloaded = normalizeAgentSettings(JSON.parse(JSON.stringify(displayed)));
    assert.deepEqual(groupIdsForAgentTools(reloaded.custom[0].tool_policy.allow, reloaded.tool_groups), ['code_mode']);
    assert.equal(await makeHandlers(toolsForAgentGroups(['workspace_read'])).handleSaveCustomAgent(id), true);
    reloaded = normalizeAgentSettings(JSON.parse(JSON.stringify(displayed)));
    assert.deepEqual(groupIdsForAgentTools(reloaded.custom[0].tool_policy.allow, reloaded.tool_groups), ['workspace_read']);
    assert.equal(reloaded.custom[0].effective_tools.includes('code_mode'), false);
    assert.equal(notices.every(([kind]) => kind === 'success'), true);
  });
}
