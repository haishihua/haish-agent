import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reasoningGaugeRotation } from '../../../src/features/chat/model/reasoning-gauge.js';
import { REASONING_EFFORT_OPTIONS } from '../../../src/features/chat/model/run-catalog.js';

const levels = (ids) => ids.map((id) => ({ id, label: id }));

test('all four explicit effort levels fit the original fixed arc in order', () => {
  const angles = REASONING_EFFORT_OPTIONS.map(({ id }) => reasoningGaugeRotation(id, REASONING_EFFORT_OPTIONS));
  assert.deepEqual(angles, [-165, -85, -5, 75]);
  assert.equal(reasoningGaugeRotation('xhigh', REASONING_EFFORT_OPTIONS), 75);
  assert.ok(angles.every((angle, index) => angle >= -165 && angle <= 75 && (index === 0 || angle > angles[index - 1])));
});

test('four-level catalogs retain their original angles and subsets never wrap', () => {
  const original = levels(['low', 'medium', 'high', 'xhigh']);
  assert.deepEqual(original.map(({ id }) => reasoningGaugeRotation(id, original)), [-165, -85, -5, 75]);
  const subset = levels(['low', 'high', 'xhigh']);
  assert.deepEqual(subset.map(({ id }) => reasoningGaugeRotation(id, subset)), [-165, -45, 75]);
});

test('unspecified and unsupported efforts have no needle, never an implicit high', () => {
  for (const effort of [null, undefined, '', 'unsupported']) {
    assert.equal(reasoningGaugeRotation(effort, REASONING_EFFORT_OPTIONS), null);
  }
  const withUnspecified = [{ id: null, label: 'Unspecified' }, ...REASONING_EFFORT_OPTIONS];
  assert.equal(reasoningGaugeRotation('xhigh', withUnspecified), 75);
  assert.equal(reasoningGaugeRotation('none', withUnspecified), null);
});

test('empty and single-option catalogs have deterministic neutral geometry', () => {
  assert.equal(reasoningGaugeRotation('high', []), null);
  assert.equal(reasoningGaugeRotation('high', levels(['high'])), -45);
});

test('gauge calculation does not mutate catalogs or selected values', () => {
  const options = Object.freeze(REASONING_EFFORT_OPTIONS.map((option) => Object.freeze({ ...option })));
  const snapshot = JSON.stringify(options);
  for (const { id } of options) reasoningGaugeRotation(id, options);
  assert.equal(JSON.stringify(options), snapshot);
});

test('production picker uses option-count-independent geometry and neutral unspecified styling', () => {
  const source = fs.readFileSync(new URL('../../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../../../styles/delegation.css', import.meta.url), 'utf8');
  assert.match(source, /reasoningGaugeRotation\(reasoningEffort, suppliedReasoningOptions\)/);
  assert.doesNotMatch(source, /currentReasoningIndex\s*\*\s*80/);
  assert.match(source, /gaugeRotation === null \? <circle/);
  assert.match(css, /\.model-picker-gauge\.is-unspecified\s*\{\s*color: var\(--dim\)/);
});
