import test from 'node:test';
import assert from 'node:assert/strict';
import { buildToolView } from '../../../src/features/chat/model/tool-view.js';
import { nestToolScriptCalls } from '../../../src/features/chat/model/tool-script.js';
import { runtimeEventToLog } from '../../../src/features/tasks/model/runtime-events.js';

globalThis.window = {};
const { buildChatTimeline, groupConsecutiveTools } = await import('../../../src/features/chat/model/chat-timeline.js');

const parent = (extra = {}) => ({ kind: 'tool', id: 'script', callId: 'script', toolName: 'code_mode', children: [], ...extra });
const child = (id = 'script/1', extra = {}) => ({ kind: 'tool', id, callId: id, parentCallId: 'script', toolName: 'read_file', children: [], ...extra });

test('Tool Script label ignores old display names and retains request/response fallback', () => {
  for (const toolName of ['code_mode', 'tool_script']) {
    const view = buildToolView({ toolName, label: 'code mode', toolInput: { code: 'return 42;' }, toolResponse: { status: 'ok', data: { output: ['42'] } } });
    assert.equal(view.mode, 'script');
    assert.equal(view.label, 'Tool Script');
    assert.match(view.requestJson, /return 42/);
    assert.match(view.responseJson, /42/);
  }
});

test('live child events nest once, preserve real inputs/results and do not group the parent away', () => {
  const events = [
    { type: 'tool_call_started', call_id: 'script', tool_name: 'code_mode', tool_input: { code: 'await tools.read_file({path:"a.txt"})' } },
    { type: 'tool_call_started', call_id: 'script/1', parent_call_id: 'script', tool_name: 'read_file', tool_input: { path: 'a.txt' } },
    { type: 'tool_call_completed', call_id: 'script/1', parent_call_id: 'script', tool_name: 'read_file', tool_response: { status: 'ok', summary: 'Read file' } },
    { type: 'tool_call_completed', call_id: 'script', tool_name: 'code_mode', tool_response: { status: 'ok', data: { calls: [{ tool_call_id: 'script/1', tool_name: 'read_file', status: 'ok' }] } } },
  ].map(runtimeEventToLog);
  for (const status of ['running', 'completed']) {
    const timeline = buildChatTimeline({ eventLog: events }, status);
    assert.equal(timeline.items.length, 1);
    const script = timeline.items[0];
    assert.equal(script.kind, 'tool');
    assert.equal(script.children.length, 1);
    assert.equal(script.children[0].status, 'done');
    assert.deepEqual(script.children[0].toolInput, { path: 'a.txt' });
    assert.equal(script.children[0].toolResponse.summary, 'Read file');
  }
  assert.equal(groupConsecutiveTools([child('other'), parent()]).length, 2);
});

test('restored snapshots and out-of-order parents preserve nesting by exact parent id', () => {
  const calls = [
    { callId: 'script/1', parentCallId: 'script', toolName: 'edit_file', state: 'completed', toolInput: { path: 'a.txt' }, toolResponse: { status: 'ok', artifacts: { diff: '-a\n+b' } } },
    { callId: 'script', toolName: 'code_mode', state: 'completed' },
  ];
  const timeline = buildChatTimeline({ toolCalls: calls }, 'completed');
  assert.equal(timeline.items.length, 1);
  assert.equal(timeline.items[0].children[0].callId, 'script/1');
  assert.equal(buildToolView(timeline.items[0].children[0]).mode, 'diff');
  const orphan = child('orphan', { parentCallId: 'missing' });
  assert.deepEqual(nestToolScriptCalls([orphan]), [orphan]);
});

test('legacy ledgers restore cards without inventing detail or retrying unknown effects', () => {
  const script = parent({ toolResponse: JSON.stringify({ data: { calls: [
    { tool_call_id: 'script/1', tool_name: 'exec_command', status: 'ok' },
    { tool_call_id: 'script/2', tool_name: 'edit_file', status: 'unknown', error: 'May still be executing' },
  ] } }) });
  const [result] = nestToolScriptCalls([script]);
  assert.equal(result.children.length, 2);
  assert.equal(buildToolView(result.children[0]).mode, 'json');
  assert.equal(result.children[0].toolInput, undefined);
  assert.equal(result.children[1].status, 'failed');
  assert.match(buildToolView(result.children[1]).responseJson, /May still be executing/);
});

test('failed read children expose their error and remapped ids do not duplicate ledger calls', () => {
  const failed = child('public-child', { status: 'failed', toolInput: { path: 'denied.txt' },
    toolResponse: { status: 'error', error: { message: 'Permission denied' } } });
  const script = parent({ toolResponse: { data: { calls: [{ tool_call_id: 'core/1', tool_name: 'read_file', status: 'error' }] } } });
  nestToolScriptCalls([script, failed]);
  assert.equal(script.children.length, 1);
  assert.equal(buildToolView(failed).mode, 'json');
  assert.match(buildToolView(failed).responseJson, /Permission denied/);
});

test('same-name calls and multiple scripts never cross-parent, including failed children', () => {
  const one = parent();
  const two = parent({ id: 'second', callId: 'second' });
  const nested = nestToolScriptCalls([one, child(), child('script/2', { status: 'failed' }), two,
    child('second/1', { parentCallId: 'second' })]);
  assert.deepEqual(nested.map(item => item.id), ['script', 'second']);
  assert.deepEqual(one.children.map(item => item.id), ['script/1', 'script/2']);
  assert.equal(one.children[1].status, 'failed');
  assert.equal(two.children.length, 1);
});
