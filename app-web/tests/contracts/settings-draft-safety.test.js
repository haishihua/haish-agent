import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const shell = read('../../src/features/app/AppShell.jsx');
const page = read('../../src/features/settings/components/SettingsPage.jsx');
const handlers = read('../../src/features/settings/hooks/createSettingsHandlers.js');

test('every production generic Save caller explicitly passes its editor section', () => {
  assert.match(shell, /onSave=\{handleSaveSettingsDraft\}/);
  assert.match(page, /await onSave\(panelSection\)/);
  assert.match(page, /panelSection === 'agent' \? await onSaveCustomAgent/);
  assert.match(page, /panelSection === 'workflow' \? await onSaveCustomWorkflow/);
  assert.match(handlers, /if \(section === 'tools'\) return handleSaveToolsSettingsDraft\(\)/);
  assert.match(handlers, /\['llm', 'embedding', 'compact'\]\.includes\(section\)/);
  assert.match(handlers, /else if \(section === 'memory'\)/);
});

test('inventory hook, rather than selected tools page, owns initialization versus refresh', () => {
  const hook = read('../../src/features/settings/hooks/useLiveToolsSettings.js');
  const localWiring = shell.slice(shell.indexOf('  const beginToolsSettingsSave = useLiveToolsSettings({'), shell.indexOf('  useEffect(() => {', shell.indexOf('  const beginToolsSettingsSave = useLiveToolsSettings({')));
  assert.match(localWiring, /records: settingsRecordsDraft/);
  assert.match(shell, /invalidateSkillInventory: [^\n]+beginToolsSettingsSave,/);
  assert.match(handlers, /beginToolsSettingsSave\?\.\(\)/);
  assert.match(handlers, /finally\s*\{\s*finishToolsSettingsSave\?\.\(saved\)/);
  assert.doesNotMatch(localWiring, /settingsSection|settingsSelection/);
  assert.match(hook, /configurationInitialized\.current = true/);
  assert.match(hook, /onPayload\(\{ skills: payload.skills \}\)/);
});
