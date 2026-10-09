import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSettingsHandlers } from '../../../src/features/settings/hooks/createSettingsHandlers.js';

const shell = readFileSync(new URL('../../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');

test('first Settings entry retains the default Providers / Chat tab', () => {
  assert.match(shell, /\[settingsSection, setSettingsSection\] = useState\('llm'\)/);
  assert.match(shell, /\[settingsSelection, setSettingsSelection\] = useState\(\(\) => \(\{\s*llm: 'chat'/);
  let enabled = false;
  createSettingsHandlers({ activeTab: 'dashboard', setSettingsMode: update => { enabled = update(enabled); },
    setSettingsSection: () => assert.fail('Opening Settings must not reset navigation') }).handleToggleSettings();
  assert.equal(enabled, true);
});

for (const [section, subtab] of [['llm', 'vision'], ['tools', 'tools-mcp'], ['tools', 'tools-skills-global'],
  ['tools', 'tools-browser'], ['memory', 'memory-qdrant'], ['embedding', ''], ['compact', ''], ['agent', 'agent-default'], ['workflow', 'example']]) {
  test(`Settings restores ${section} / ${subtab || 'default'} after closing or leaving for Chat/Bot`, () => {
    const selection = { llm: 'chat', tools: 'tools-mcp', [section]: subtab };
    const before = { ...selection };
    let activeSection = section, enabled = true, activeTab = 'dashboard';
    const handlers = () => createSettingsHandlers({ activeTab,
      setActiveTab: value => { activeTab = value; },
      setSettingsMode: update => { enabled = typeof update === 'function' ? update(enabled) : update; },
      setSettingsSection: value => { activeSection = value; },
    });
    handlers().handleToggleSettings();
    assert.equal(enabled, false);
    handlers().handleToggleSettings();
    assert.equal(enabled, true);
    assert.equal(activeSection, section);
    for (const mode of ['chat', 'bot']) {
      enabled = false; activeTab = mode;
      handlers().handleToggleSettings();
      assert.equal(enabled, true);
      assert.equal(activeTab, 'dashboard');
      assert.equal(activeSection, section);
      assert.deepEqual(selection, before);
    }
  });
}

test('Settings navigation stays above the conditional page so remounting cannot reset section or subtab', () => {
  assert.match(shell, /activeSection=\{settingsSection\}/);
  assert.match(shell, /selectionBySection=\{settingsSelection\}/);
  assert.match(shell, /onSectionChange=\{setSettingsSection\}/);
  assert.match(shell, /onSelectionChange=\{setSettingsSelection\}/);
  // An explicit workflow deep link still selects that workflow instead of the remembered tab.
  assert.match(shell, /setSettingsSection\('workflow'\);\s*setSettingsSelection\(\(prev\) => \(\{ \.\.\.prev, workflow: id \}\)\)/);
});
