import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../../styles/modals.css', import.meta.url), 'utf8');
const picker = fs.readFileSync(new URL('../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');
const control = fs.readFileSync(new URL('../../src/shared/ui/vendor/dissolve/segmented-control.core.ts', import.meta.url), 'utf8');

test('approval modes stay in one inline, labeled, click-only control', () => {
  assert.match(css, /\.approval-mode-segments\s*\{[^}]*width: 132px;/);
  assert.match(picker, /segments: APPROVAL_MODE_OPTIONS\.map\(\(\{ id, label \}\) => \(\{ value: id, label: '', ariaLabel: label \}\)\)/);
  assert.match(picker, /clickOnly: true, haptics: false, onChange:/);
  assert.match(picker, /instance\.current\?\.update\(\{ value: mode, disabled \}\)/);
  assert.doesNotMatch(picker, /approval-mode-menu/);
});

test('approval mode icons use bundled SVGs and full access unlocks only when selected', () => {
  for (const name of ['request-approval', 'auto-approval', 'full-access-locked', 'full-access-unlocked']) {
    assert.ok(picker.includes(`/permission-icons/${name}.svg?raw`));
    assert.ok(fs.existsSync(new URL(`../../src/features/chat/assets/permission-icons/${name}.svg`, import.meta.url)));
  }
  assert.match(picker, /id === 'full' \? \(selected \? 'unlocked' : 'locked'\) : id/);
  assert.match(css, /vector-effect: non-scaling-stroke;/);
});

test('approval control exposes selection and supports reduced motion', () => {
  assert.match(control, /setAttribute\('aria-selected', String\(k === target\)\)/);
  assert.match(control, /const reduced = reducedMotion\(\)/);
  assert.match(control, /if \(reduced\) \{/);
  assert.match(picker, /control\.destroy\(\)/);
});
