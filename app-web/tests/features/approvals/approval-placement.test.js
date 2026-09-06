import test from 'node:test';
import assert from 'node:assert/strict';
import { placeToolApprovals } from '../../../src/features/approvals/model/approval-placement.js';
import { buildToolView } from '../../../src/features/chat/model/tool-view.js';

const tool = { kind: 'tool', id: 'write-1', status: 'running', toolName: 'write_file', toolInput: { path: 'example.txt' } };
const request = { request_id: 'approval-1', task_id: 'task-1', conversation_id: 'chat-1', tool_name: 'write_file', raw_command: 'write_file: example.txt' };
const place = (items, req = request) => placeToolApprovals(items, [req], 'task-1', 'chat-1');

test('approval attaches to the unique active tool inside a group', () => {
  assert.equal(place([{ kind: 'tool_group', tools: [tool] }]).get(tool.id), request);
});

test('approval never attaches to another task, conversation, target or completed call', () => {
  assert.equal(place([tool], { ...request, task_id: 'other' }).size, 0);
  assert.equal(place([tool], { ...request, conversation_id: 'other' }).size, 0);
  assert.equal(place([tool], { ...request, raw_command: 'write_file: other.txt' }).size, 0);
  assert.equal(place([{ ...tool, status: 'done' }]).size, 0);
  assert.equal(placeToolApprovals([tool], [request], null, 'chat-1').size, 0);
});

test('ambiguous same-target calls remain in standalone approval slot', () => {
  assert.equal(place([tool, { ...tool, id: 'write-2' }]).size, 0);
});

test('explicit call id selects the correct call', () => {
  assert.equal(place([{ ...tool, callId: 'call-1' }, { ...tool, id: 'write-2', callId: 'call-2' }], { ...request, tool_call_id: 'call-2' }).has('write-2'), true);
});

test('pending writes do not claim completion or no changes', () => {
  assert.equal(buildToolView(tool).label, 'Writing example.txt');
  assert.equal(buildToolView({ ...tool, status: 'done' }).label, 'Wrote example.txt (no changes)');
});
