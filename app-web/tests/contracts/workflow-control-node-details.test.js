import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/features/settings/components/WorkflowConfigEditor.jsx', import.meta.url), 'utf8');
function nodeFields(type, nextType) {
  const start = source.indexOf(`    if (selectedNode.type === '${type}')`);
  const end = source.indexOf(`    if (selectedNode.type === '${nextType}')`, start);
  assert.ok(start >= 0 && end > start);
  return source.slice(start, end);
}

test('control node settings omit generated Outputs without changing data contracts', () => {
  for (const [type, nextType] of [['condition', 'human_approval'], ['human_approval', 'loop'], ['loop', 'output']]) {
    assert.doesNotMatch(nodeFields(type, nextType), /WorkflowOutputContract/);
  }
  assert.match(nodeFields('llm', 'tool'), /WorkflowOutputContract/);
  assert.match(nodeFields('tool', 'condition'), /WorkflowOutputContract/);
});

test('Approval exposes request content instead of generic Inputs and internal payload', () => {
  const approval = nodeFields('human_approval', 'loop');
  assert.match(approval, /title="Approval request" icon="workflow-approval"/);
  assert.match(approval, /aria-label="Approval title"/);
  assert.match(approval, /workflow-control-label/);
  assert.match(approval, /rows=\{4\}\s+compact/);
  assert.match(approval, /title="Review content"/);
  assert.doesNotMatch(approval, /title="Inputs"|label="payload"|WorkflowVariableSelect|WorkflowParameterEditor/);
  assert.match(approval, /input: \{ \.\.\.approvalInput, title: event\.target\.value \}/);
  assert.match(approval, /input: \{ \.\.\.approvalInput, summaryText \}/);
});

test('Condition retains expressions and aliases; Retry retains its policy', () => {
  const condition = nodeFields('condition', 'human_approval');
  assert.match(condition, /parameterEntries\.length \? renderInputParameters\('expression'/);
  assert.match(condition, /title="Condition" icon="workflow-condition"/);
  assert.match(condition, /rows=\{3\}\s+compact/);
  assert.match(condition, /variables=\{availableVariables\}/);
  assert.match(condition, /workflowTemplateWithParameterAliases\(value, parameterEntries\)/);
  const loop = nodeFields('loop', 'output');
  assert.match(loop, /title="Retry policy"/);
  assert.match(loop, /selectedNode\.max_loops === null/);
  assert.match(loop, /max_loops: value === 'unlimited' \? null : 3/);
});
