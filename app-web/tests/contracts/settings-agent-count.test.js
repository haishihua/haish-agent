import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { configItemsForSection } from '../../src/features/settings/model/settings-payload.js';

const shell = fs.readFileSync(new URL('../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../../src/features/settings/components/SettingsPage.jsx', import.meta.url), 'utf8');

test('Agent navigation counts presets and custom agents, including disabled agents', () => {
  const settings = {
    presets: [{ agent_id: 'preset.default', enabled: true }, { agent_id: 'preset.disabled', enabled: false }],
    custom: [{ agent_id: 'custom.one', custom: true }, { agent_id: 'custom.disabled', custom: true, enabled: false }],
  };
  const items = configItemsForSection('agent', {}, {}, '', settings);
  assert.equal(items.length, 4);
  assert.equal(items.filter(item => !item.enabled).length, 2);
});

test('expanding Automation triggers full settings loading before entering Agent', () => {
  assert.match(shell, /const needsAgentSettings = settingsMode && \(automationExpanded \|\| \['agent', 'workflow'\]\.includes\(settingsSection\)\)/);
  assert.match(shell, /if \(!needsAgentSettings\) return undefined;[\s\S]*?fetchAgentSettingsPayload\(\)[\s\S]*?applyAgentSettingsPayload\(payload\)[\s\S]*?setAgentSettingsReady\(true\)[\s\S]*?\}, \[needsAgentSettings\]\)/);
  assert.match(shell, /onAutomationExpandedChange=\{setAutomationExpanded\}/);
  assert.match(page, /onAutomationExpandedChange\?\.\(automationOpen\)/);
  assert.match(page, /\(\) => onAutomationExpandedChange\?\.\(false\)/);
});

test('navigation counts have a fixed column and long titles can shrink', () => {
  const css = fs.readFileSync(new URL('../../src/features/settings/settings.css', import.meta.url), 'utf8');
  assert.match(css, /\.settings-nav-item > span\s*\{[^}]*flex: 1 1 0;[^}]*min-width: 0;[^}]*overflow: hidden/);
  assert.match(css, /\.settings-nav-item small\s*\{[^}]*justify-content: flex-end;[^}]*flex: 0 0 24px;[^}]*font-variant-numeric: tabular-nums/);
});

test('unknown Agent count does not display the default preset count as an authoritative total', () => {
  assert.match(shell, /agentSettingsLoading=\{!agentSettingsReady\}/);
  assert.match(page, /child\.id === 'agent' && agentSettingsLoading \?/);
  assert.match(page, /aria-label="Loading agent count"/);
});
