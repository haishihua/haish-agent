import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL(`../../../src/features/settings/components/${name}.jsx`, import.meta.url), 'utf8');
const workflow = read('WorkflowConfigEditor');

test('layout persistence reports success and storage failure through shared toast', () => {
  const body = workflow.match(/const onCanvasNodeDragStop = \(_, node, draggedNodes\) => \{([\s\S]*?)\n {2}\};/)[1];
  const run = new Function('saveWorkflowLayout', 'onToast', `const node = {id: 'agent', position: {x: 0, y: 0}}, draggedNodes = []; const isEditable = false, readOnly = false, workflow = {workflow_id: 'preset', custom: false}; const capturedLayoutPositions = () => ({}); const setLayoutRevision = () => {}; ${body}`);
  for (const stored of [true, false]) {
    const notices = [];
    run(() => stored, (...args) => notices.push(args));
    assert.deepEqual(notices, [[stored ? 'success' : 'error', stored ? 'Layout saved' : 'Could not save layout locally.']]);
  }
});

test('workflow has no private transient status and receives the app toast callback', () => {
  assert.doesNotMatch(workflow, /layoutSavedPulse|workflow-layout-status/);
  assert.match(read('SettingsPage'), /<WorkflowConfigEditor[\s\S]*?onToast=\{onToast\}/);
  assert.match(workflow, /stored \? 'Layout reset' : 'Could not reset layout locally\.'/);
});

test('OAuth start and polling failures use toast instead of private error feedback', () => {
  const llm = read('LlmConfigEditor');
  assert.equal((llm.match(/onToast\?\.\('error', String\(error\?\.message \|\| error\)\)/g) || []).length, 2);
  assert.doesNotMatch(llm, /detail=\{oauthStartError\}/);
});

test('delete and install failures receive shared toast, while package validation remains inline', () => {
  assert.match(read('SettingsPrimitives'), /catch \(failure\) \{ onToast\?\.\('error'/);
  assert.match(read('SettingsPage'), /<SettingsDeleteDialog onToast=\{onToast\}/);
  assert.match(read('ToolsConfigEditor'), /<SettingsDeleteDialog onToast=\{onToast\}/);
  assert.match(read('ToolsConfigEditor'), /<SkillUpload onToast=\{onToast\}/);
  assert.match(read('SkillUpload'), /catch \(failure\) \{ onToast\?\.\('error'/);
  assert.match(read('SkillUpload'), /error && <ErrorState/);
});
