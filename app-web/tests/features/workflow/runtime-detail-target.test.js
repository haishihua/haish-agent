import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeDetailTarget } from '../../../src/features/workflow/model/runtime-detail-target.js';
const nodes = [{ id: 'agent', type: 'agent' }, { id: 'judge', type: 'llm' }, { id: 'end', type: 'output' }];
const choose = (status, entries, currentNodeId, canOpen = () => true) => runtimeDetailTarget({ status, nodes, statuses: new Map(entries), currentNodeId, canOpen });
test('running selects current eligible detail, including LLM', () => {
  assert.equal(choose('running', [['judge', 'running']], 'judge'), 'judge');
  assert.equal(choose('running', [['agent', 'running']], 'gate'), 'agent');
  assert.equal(choose('running', [['agent', 'running']], 'agent', () => false), '');
});
test('terminal targets End, pending and queued never open', () => {
  for (const status of ['done', 'failed', 'cancelled']) assert.equal(choose(status, []), 'end');
  for (const status of ['pending', 'queued', '']) assert.equal(choose(status, [['agent', 'running']]), '');
});
test('no available node produces no stale target', () => {
  assert.equal(choose('running', []), '');
  assert.equal(runtimeDetailTarget({ status: 'failed', nodes: [], statuses: new Map(), canOpen: () => true }), '');
});
