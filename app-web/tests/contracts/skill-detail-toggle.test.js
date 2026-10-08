import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/features/settings/components/ToolsConfigEditor.jsx', import.meta.url), 'utf8');

test('skill details show description and location without a duplicate enable control', () => {
  const start = source.indexOf('{selectedSkill &&');
  const end = source.indexOf('{provider && <FieldRow', start);
  assert.ok(start >= 0 && end > start);
  const detail = source.slice(start, end);
  assert.match(detail, /selectedSkill\.description/);
  assert.match(detail, /<dt>Location<\/dt>/);
  assert.doesNotMatch(detail, /SettingsToggleRow|Switch|onToggleSkill|Enable skill/);
});

test('the outer skill list retains the enable callback and busy guard', () => {
  assert.match(source, /onToggle=\{skillsPane && !item\.shadowed \? enabled => onToggleSkill\(item\.name, enabled\) : undefined\}/);
  assert.match(source, /busy=\{Boolean\(skillActionBusy \|\| busy\)\}/);
  assert.doesNotMatch(source, /SettingsToggleRow/);
});
