import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('../../src/features/workflow/components/WorkflowRuntimeConfig.jsx');
const styles = read('../../styles/workflow-runtime.css');
const picker = read('../../src/features/chat/components/WorkflowPicker.jsx');
const composer = read('../../src/features/chat/components/ChatComposer.jsx');

test('runtime config reuses shared Radix Select instead of native dropdowns', () => {
  assert.match(source, /from '..\/..\/..\/shared\/ui\/settings-elements\/ui\/select.tsx'/);
  assert.doesNotMatch(source, /<select\b|<option\b/);
  assert.equal((source.match(/<ConfigSelect label=/g) || []).length, 3);
  assert.match(source, /container=\{document.body\} position="popper"/);
  assert.match(source, /value=\{value \? `value:\$\{value\}` : ''\}/);
  assert.doesNotMatch(source, /label: '(Workflow \/ backend default|Provider default)'|id: ''/);
  assert.match(source, /SelectValue placeholder=\{options.placeholder\}/);
  assert.match(source, /aria-label="Clear node configuration"/);
  assert.match(source, /onChange\(next.slice\(6\)\)/);
  assert.match(source, /htmlFor=\{id\}/);
  assert.match(source, /id=\{id\} aria-label=/);
});

test('Workflow picker reuses the same non-native dropdown and only replaces Bot selection', () => {
  assert.match(picker, /shared\/ui\/settings-elements\/ui\/select.tsx/);
  assert.doesNotMatch(picker, /<select\b|<option\b/);
  assert.match(picker, /side="top"/);
  assert.match(picker, /container=\{document.body\}/);
  assert.match(picker, /onChange\(next.slice\(9\)\)/);
  assert.doesNotMatch(picker, /Gauge|model-picker-gauge/);
  assert.match(picker, /className="workflow-picker-glyph"/);
  assert.equal((picker.match(/<rect /g) || []).length, 3);
  assert.match(picker, /PortalTooltip text=\{open \? '' : hint\}/);
  assert.match(picker, /aria-description=\{hint\}/);
  assert.doesNotMatch(picker, /<label\b|<SelectValue\b/);
  assert.match(composer, /executionMode === 'bot' \? <WorkflowPicker[^\n]+onChange=\{setAgentId\} \/> : <ModelPicker/);
});

test('full-width tabs split the row evenly with a thin selected underline', () => {
  assert.match(styles, /workflow-detail-tabs \[role="tab"\][^}]+font: 500 12px/);
  assert.match(styles, /workflow-detail-tabs \{[^}]+grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[^}]+width: 100%;/);
  assert.match(styles, /workflow-detail-tabs[^\n]+::after[^}]+height: 1px;/);
  assert.match(styles, /workflow-detail-tabs \[role="tab"\]\[aria-selected="true"\] \{[^}]+background: transparent; box-shadow: none;/);
  assert.match(styles, /workflow-runtime-field[^}]+font-size: 12px/);
  assert.match(styles, /workflow-picker-trigger:focus-visible[^}]+box-shadow:/);
  assert.match(styles, /workflow-detail-body\.is-config \{ padding: 8px 10px;/);
  assert.match(styles, /workflow-runtime-config \{ padding: 10px;/);
  assert.match(styles, /workflow-picker-trigger \{[^}]+width: 32px;[^}]+border: 0;/);
});

test('Workflow uses gray surfaces without nested selection or open-trigger frames', () => {
  assert.match(styles, /workflow-picker-trigger \{[^}]+color: #a0a0a0;/);
  assert.match(styles, /workflow-picker-glyph-link \{ stroke: currentColor;/);
  assert.match(styles, /workflow-picker-trigger\[data-state="open"\] \{[^}]+box-shadow: none;/);
  assert.match(styles, /workflow-runtime-select-menu\.workflow-picker-menu \{[^}]+background: #1b1b1b;/);
  assert.match(styles, /workflow-picker-menu \.workflow-runtime-select-option \{ border: 0; box-shadow: none;/);
  assert.match(styles, /workflow-picker-menu \[data-slot="select-item-indicator"\] \{ display: none;/);
  assert.match(styles, /workflow-picker-menu \.workflow-runtime-select-option \{ padding-right: 9px;/);
  assert.match(styles, /workflow-picker-menu \.workflow-runtime-select-option\[data-highlighted\] \{[^}]+box-shadow: none;/);
});

test('runtime dropdowns retain focus, pressed and reduced-motion feedback', () => {
  assert.match(styles, /workflow-runtime-select:focus-visible[^}]+box-shadow:/);
  assert.match(styles, /workflow-runtime-select-option\[data-highlighted\][^}]+box-shadow:/);
  assert.match(styles, /workflow-runtime-select-option:active/);
  assert.match(styles, /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.workflow-runtime-config \.workflow-runtime-select:not\(:disabled\):hover/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{\s*\.workflow-runtime-config \.workflow-runtime-select[^}]+transition: none/);
});
