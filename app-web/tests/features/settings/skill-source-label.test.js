import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { skillSourceLabel } from '../../../src/features/settings/model/skill-source-label.js';

for (const source of ['preset', 'builtin']) {
  test(`${source} is labeled Built-in, regardless of enablement`, () => {
    for (const enabled of [true, false]) {
      const skill = { name: 'settings-manager', source, enabled, can_uninstall: false };
      const before = structuredClone(skill);
      assert.equal(skillSourceLabel(skill.source), 'Built-in');
      assert.deepEqual(skill, before);
    }
  });
}

for (const source of ['installed', 'haish']) {
  test(`${source} retains the Haish label`, () => {
    assert.equal(skillSourceLabel(source), 'Haish');
  });
}

test('Codex copies retain the Codex label', () => {
  assert.equal(skillSourceLabel('codex-copy'), 'Codex');
});

test('missing or unfamiliar sources are not falsely labeled Codex or Built-in', () => {
  for (const source of [undefined, null, '', 'other']) {
    assert.equal(skillSourceLabel(source), 'Unknown');
  }
});

test('the actual skill row uses the source mapper without making presets read-only', () => {
  const source = fs.readFileSync(new URL('../../../src/features/settings/components/ToolsConfigEditor.jsx', import.meta.url), 'utf8');
  assert.match(source, /const skillSource = skillSourceLabel\(item\.source\)/);
  assert.match(source, /badge=\{skillsPane \? skillSource : undefined\}/);
  assert.match(source, /onToggle=\{skillsPane && !item\.shadowed \? enabled => onToggleSkill\(item\.name, enabled\) : undefined\}/);
  assert.match(source, /onDelete=\{skillsPane && item\.can_uninstall/);
  assert.doesNotMatch(source, /readOnly=\{[^}]*preset/);
});
