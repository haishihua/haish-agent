import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');

test('trigger tooltip shows the selected model id and thinking value', () => {
  assert.ok(source.includes("const runConfigLabel = `${value || 'No model'} · ${reasoningEffort || currentReasoning?.id || 'unknown'}`;"));
  assert.match(source, /<PortalTooltip text=\{open \? '' : runConfigLabel\}/);
  assert.ok(source.includes('aria-label={`Run configuration, ${runConfigLabel}`}'));
  assert.doesNotMatch(source, /Thinking ·/);
});

test('provider and model selection do not dismiss the settings menu', () => {
  for (const callback of ['onProviderChange', 'onChange']) {
    const handler = source.split('\n').find((line) => line.includes('onClick=') && line.includes(`${callback}`));
    assert.ok(handler, `${callback} selection handler exists`);
    assert.match(handler, /if \(readOnly\) return/);
    assert.doesNotMatch(handler, /setOpen|setMenuOpen|setActiveSubmenu/);
  }
});

test('leaving the menu has a cancellable delay and Escape remains available', () => {
  assert.match(source, /onMouseEnter=\{\(\) => window\.clearTimeout\(leaveTimerRef\.current\)\}/);
  assert.match(source, /onMouseLeave=\{\(\) => \{/);
  assert.match(source, /leaveTimerRef\.current = window\.setTimeout/);
  assert.match(source, /event\.key === 'Escape'/);
});
