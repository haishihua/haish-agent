import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowInputDisplayText } from './workflow-catalog.js';

test('workflow input displays the message instead of escaped transport JSON', () => {
  const result = workflowInputDisplayText({
    attachments: [],
    image_attachments: [],
    message: '第一段\n\n- 条目一\n- 条目二',
  });

  assert.equal(result, '第一段\n\n- 条目一\n- 条目二');
  assert.doesNotMatch(result, /attachments|\\n/);
});

test('workflow input restores line breaks from nested JSON strings', () => {
  const result = workflowInputDisplayText('{"message":"第一行\\n第二行","attachments":[]}');

  assert.equal(result, '第一行\n第二行');
});

test('workflow input keeps meaningful metadata in a formatted JSON block', () => {
  const result = workflowInputDisplayText({
    message: 'Run this task',
    attachments: [],
    workspace: '/tmp/project',
  });

  assert.match(result, /^Run this task\n\n\*\*Input metadata\*\*/);
  assert.match(result, /```json[\s\S]*"workspace": "\/tmp\/project"/);
  assert.doesNotMatch(result, /attachments/);
});

test('structured tool input is presented as formatted JSON', () => {
  const result = workflowInputDisplayText({ query: 'hello', limit: 5 });

  assert.match(result, /^```json\n\{/);
  assert.match(result, /"limit": 5/);
});
