import test from 'node:test';
import assert from 'node:assert/strict';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';
import { normalizeAgentSettings, agentCatalogFromSettings, withAlwaysAllowedAgentTools, effectiveAgentTools, toggleAgentToolGroup } from '../../../src/features/agents/model/agent-settings.js';

const groups = [{ id: 'files', tools: ['read_file', 'list_dir'] }, { id: 'shell', tools: ['exec_command'] }];
for (const allow of [null, [], ['read_file', 'future_tool']]) {
  test(`name-only agent save round-trips allow=${JSON.stringify(allow)} and deny`, async () => {
    let settings = normalizeAgentSettings({ custom: [{ agent_id: 'custom.fixture', custom: true, display_name: 'Renamed', tool_policy: { allow, deny: ['exec_command'] } }] });
    let submitted;
    const handlers = createSettingsHandlers({
      API_BASE: '', agentSettingsDraft: settings, normalizeAgentSettings, agentCatalogFromSettings, withAlwaysAllowedAgentTools,
      setAgentSettingsDraft: next => { settings = next; }, setAgentCatalog() {}, showToast() {},
      apiFetch: async (url, init) => {
        assert.equal(url, '/api/settings/agents/custom/custom.fixture');
        assert.equal(init.method, 'PUT');
        submitted = JSON.parse(init.body);
        return { ok: true, json: async () => ({ custom: [{ ...submitted, custom: true }] }) };
      },
    });
    assert.equal(await handlers.handleSaveCustomAgent('custom.fixture'), true);
    assert.deepEqual(submitted.tool_policy, { allow, deny: ['exec_command'] });
    assert.deepEqual(settings.custom[0].tool_policy, submitted.tool_policy);
    assert.equal(settings.custom[0].display_name, 'Renamed');
  });
}

test('all, none and explicit tools show effective selections with deny applied', () => {
  assert.deepEqual(effectiveAgentTools({ allow: null, deny: ['exec_command'] }, groups), ['read_file', 'list_dir']);
  assert.deepEqual(effectiveAgentTools({ allow: [] }, groups), []);
  assert.deepEqual(effectiveAgentTools({ allow: ['read_file', 'exec_command'], deny: ['exec_command'] }, groups), ['read_file']);
});

test('partially denied group is mixed until an explicit click enables its tools', () => {
  const policy = { allow: null, deny: ['list_dir', 'exec_command'] };
  assert.deepEqual(effectiveAgentTools(policy, groups), ['read_file']);
  assert.deepEqual(toggleAgentToolGroup(policy, 'files', groups), { allow: ['read_file', 'list_dir'], deny: ['exec_command'] });
});

test('only deliberate group changes materialize null and preserve deny and unrelated tools', () => {
  const policy = { allow: null, deny: ['exec_command', 'hidden_tool'] };
  const next = toggleAgentToolGroup(policy, 'files', groups);
  assert.deepEqual(policy, { allow: null, deny: ['exec_command', 'hidden_tool'] });
  assert.deepEqual(next, { allow: [], deny: policy.deny });
  assert.deepEqual(toggleAgentToolGroup(next, 'shell', groups), { allow: ['exec_command'], deny: ['hidden_tool'] });
  assert.deepEqual(toggleAgentToolGroup({ allow: ['read_file', 'future_tool'], deny: [] }, 'shell', groups).allow, ['read_file', 'future_tool', 'exec_command']);
});
