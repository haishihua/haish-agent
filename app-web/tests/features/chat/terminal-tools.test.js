import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildToolView, TOOL_SHELL_NAMES } from '../../../src/features/chat/model/tool-view.js';

globalThis.window = {};
const { buildChatTimeline } = await import('../../../src/features/chat/model/chat-timeline.js');

const agentSettingsSource = fs.readFileSync(
  new URL('../../../src/features/agents/model/agent-settings.js', import.meta.url),
  'utf8',
);
const chatTimelineSource = fs.readFileSync(
  new URL('../../../src/features/chat/model/chat-timeline.js', import.meta.url),
  'utf8',
);
const terminalComponentSource = fs.readFileSync(
  new URL('../../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
  'utf8',
);
const toolDetailsSource = fs.readFileSync(
  new URL('../../../src/shared/ui/agent-elements/ToolDetails.jsx', import.meta.url),
  'utf8',
);

test('terminal capability exposes only the current two-tool protocol', () => {
  assert.match(
    agentSettingsSource,
    /id: 'terminal',[^\n]+tools: \['exec_command', 'write_stdin'\]/,
  );
  assert.deepEqual([...TOOL_SHELL_NAMES], ['exec_command', 'write_stdin']);
});

test('exec_command renders as a terminal card', () => {
  const view = buildToolView({
    toolName: 'exec_command',
    status: 'done',
    toolInput: { command: 'pytest -q' },
    toolResponse: {
      status: 'ok',
      result_state: 'resolved',
      data: { exit_code: 0 },
      artifacts: { output: '3 passed\n' },
    },
  });

  assert.equal(view.mode, 'terminal');
  assert.equal(view.label, 'Shell pytest -q');
  assert.equal(view.command, 'pytest -q');
  assert.equal(view.cwd, '');
  assert.equal(view.stdout, '3 passed\n');
  assert.equal(view.exitCode, 0);
});

test('terminal card uses assistant-ui with context, stderr and real process state', () => {
  assert.match(terminalComponentSource, /<TerminalDetail view=\{view\}/);
  assert.match(toolDetailsSource, /<TerminalBlock/);
  assert.match(toolDetailsSource, /cwd=\{view\.cwd\}/);
  assert.match(toolDetailsSource, /stderr=\{view\.stderr\}/);
  assert.match(toolDetailsSource, /exitCode=\{view\.exitCode\}/);
  assert.match(toolDetailsSource, /failed=\{view\.failed\}/);
});

test('failed terminal preserves nonzero exit code and stderr', () => {
  const FAILURE_EXIT_CODE = 7;
  const view = buildToolView({
    toolName: 'exec_command', status: 'failed', toolInput: { command: 'false' },
    toolResponse: { error: { exit_code: FAILURE_EXIT_CODE, message: 'failed' }, artifacts: { stderr: 'permission denied' } },
  });
  assert.equal(view.failed, true);
  assert.equal(view.exitCode, FAILURE_EXIT_CODE);
  assert.equal(view.stderr, 'permission denied');
  assert.equal(view.running, false);
});

test('failed diff retains the error rather than rendering a successful change', () => {
  const view = buildToolView({
    toolName: 'edit_file', status: 'failed',
    toolResponse: { error: { message: 'permission denied' } },
  });
  assert.equal(view.failed, true);
  assert.equal(view.body, 'permission denied');
});

test('write_stdin view keeps interaction details available outside the chat projection', () => {
  const view = buildToolView({
    toolName: 'write_stdin',
    status: 'done',
    toolInput: { session_id: 'session-1', chars: '' },
    toolResponse: {
      status: 'ok',
      operation: 'poll',
      result_state: 'resolved',
      data: { exit_code: 0 },
      artifacts: { output: 'still running\n' },
    },
  });

  assert.equal(view.mode, 'terminal');
  assert.equal(view.label, 'Process finished · exit 0');
  assert.equal(view.stdout, 'still running\n');
  assert.match(chatTimelineSource, /terminalItemsBySessionId/);
});

test('an orphan write_stdin does not create a chat card', () => {
  const timeline = buildChatTimeline({
    eventLog: [{
      type: 'tool_call_started',
      callId: 'poll-1',
      toolName: 'write_stdin',
      toolInput: { session_id: 'missing', chars: '' },
    }],
    toolCalls: [],
  }, 'running').items;

  assert.deepEqual(timeline, []);
});

test('write_stdin distinguishes polling, input, and interruption', () => {
  const build = (chars, operation) => buildToolView({
    toolName: 'write_stdin',
    status: 'done',
    toolInput: { session_id: 'session-1', chars },
    toolResponse: { status: 'ok', operation, result_state: 'partial', data: { session_id: 'session-1' } },
  });

  assert.equal(build('', 'poll').label, 'Checked process');
  assert.equal(build('yes\n', 'interact').label, 'Sent input');
  assert.equal(build('\u0003', 'interrupt').label, 'Interrupted process');
});

test('write_stdin updates the original exec_command card by session id', () => {
  const eventLog = [
    {
      type: 'tool_call_started',
      callId: 'exec-1',
      toolName: 'exec_command',
      toolInput: { command: 'pytest -q' },
    },
    {
      type: 'tool_call_completed',
      callId: 'exec-1',
      toolName: 'exec_command',
      toolResponse: {
        status: 'ok',
        result_state: 'partial',
        data: { session_id: 'session-1' },
        artifacts: { output: 'collecting...\n' },
      },
    },
    {
      type: 'tool_call_started',
      callId: 'poll-1',
      toolName: 'write_stdin',
      toolInput: { session_id: 'session-1', chars: '' },
    },
    {
      type: 'tool_call_completed',
      callId: 'poll-1',
      toolName: 'write_stdin',
      toolResponse: {
        status: 'ok',
        result_state: 'resolved',
        data: { exit_code: 0 },
        artifacts: { output: '3 passed\n' },
      },
    },
  ];

  const timeline = buildChatTimeline({ eventLog, toolCalls: [] }, 'done').items;
  assert.equal(timeline.length, 1);
  assert.equal(timeline[0].toolName, 'exec_command');
  assert.equal(timeline[0].status, 'done');

  const view = buildToolView(timeline[0]);
  assert.equal(view.label, 'Shell pytest -q');
  assert.equal(view.stdout, 'collecting...\n3 passed\n');
  assert.equal(view.exitCode, 0);
});

test('cmd inputs, including serialized inputs, display the command with command taking precedence', () => {
  for (const input of [{ cmd: 'printf test' }, JSON.stringify({ cmd: 'printf test' }), { command: 'printf test', cmd: 'ignored' }]) {
    const view = buildToolView({ toolName: 'exec_command', status: 'done', toolInput: input });
    assert.equal(view.command, 'printf test');
    assert.equal(view.label, 'Shell printf test');
  }
});

const terminalStart = (callId, toolName = 'exec_command', toolInput = { cmd: 'printf test' }) => ({
  type: 'tool_call_started', callId, toolName, toolInput,
});
const terminalDelta = (callId, delta) => ({ type: 'tool_output_delta', callId, delta });
const terminalDone = (callId, output, data = { exit_code: 0 }) => ({
  type: 'tool_call_completed', callId,
  toolResponse: { status: 'ok', result_state: data.session_id ? 'partial' : 'resolved', data, artifacts: { output } },
});
const terminalItems = (timeline) => timeline.items.flatMap((item) => item.kind === 'tool_group' ? item.tools : [item])
  .filter((item) => item.kind === 'tool');

for (const withSnapshot of [false, true]) {
  test(`streamed output and final snapshot appear exactly once (toolCalls snapshot: ${withSnapshot})`, () => {
    const output = '=== heading ===\nline one\nline two\n';
    const start = terminalStart('exec-1');
    const done = terminalDone('exec-1', output);
    const eventLog = [start, terminalDelta('exec-1', '=== heading ===\n'),
      terminalDelta('exec-1', 'line one\n'), terminalDelta('exec-1', 'line two\n'), done, done];
    const toolCalls = withSnapshot ? [{ ...start, ...done, toolName: 'exec_command', toolInput: start.toolInput, state: 'completed' }] : [];
    const [item] = terminalItems(buildChatTimeline({ eventLog, toolCalls }, 'done'));
    assert.equal(item.terminalOutput, output);
    assert.equal(buildToolView(item).stdout, output);
    assert.equal(item.status, 'done');
  });
}

test('repeated and overlapping terminal chunks are literal output, not answer fragments', () => {
  const events = [terminalStart('exec-1'), terminalDelta('exec-1', 'abab'),
    terminalDelta('exec-1', 'abab'), terminalDelta('exec-1', 'abc')];
  const [item] = terminalItems(buildChatTimeline({ eventLog: events }, 'running'));
  assert.equal(item.terminalOutput, 'abababababc');
});

test('each poll replaces only its streamed segment and keeps identical output from separate polls', () => {
  const eventLog = [terminalStart('exec-1'), terminalDelta('exec-1', 'tick\n'),
    terminalDone('exec-1', 'tick\n', { session_id: 'session-1' })];
  for (const callId of ['poll-1', 'poll-2']) {
    eventLog.push(terminalStart(callId, 'write_stdin', { session_id: 'session-1', chars: '' }),
      terminalDelta(callId, 'tick\n'), terminalDone(callId, 'tick\n', callId === 'poll-1' ? { session_id: 'session-1' } : { exit_code: 0 }));
  }
  const items = terminalItems(buildChatTimeline({ eventLog }, 'done'));
  assert.equal(items.length, 1);
  assert.equal(items[0].terminalOutput, 'tick\ntick\ntick\n');
  assert.equal(items[0].status, 'done');
});

test('partial streamed output is replaced by authoritative final output and missing final output preserves deltas', () => {
  for (const finalOutput of ['abc complete\n', undefined]) {
    const done = terminalDone('exec-1', finalOutput);
    if (finalOutput === undefined) done.toolResponse.artifacts = {};
    const [item] = terminalItems(buildChatTimeline({ eventLog: [terminalStart('exec-1'), terminalDelta('exec-1', 'abc'), done] }, 'done'));
    assert.equal(item.terminalOutput, finalOutput ?? 'abc');
  }
});

test('snapshots without events still display output and completed snapshots do not seed active streams', () => {
  const call = { callId: 'exec-1', toolName: 'exec_command', toolInput: { cmd: 'printf test' },
    toolResponse: { status: 'ok', data: { exit_code: 0 }, artifacts: { output: 'abc complete\n' } }, state: 'completed' };
  const [backfilled] = terminalItems(buildChatTimeline({ toolCalls: [call] }, 'done'));
  assert.equal(backfilled.terminalOutput, 'abc complete\n');
  const [streaming] = terminalItems(buildChatTimeline({ toolCalls: [call],
    eventLog: [terminalStart('exec-1'), terminalDelta('exec-1', 'abc')] }, 'running'));
  assert.equal(streaming.terminalOutput, 'abc');
});

test('independent commands remain separate cards rather than merging output by content', () => {
  const eventLog = [terminalStart('exec-1'), terminalDone('exec-1', 'tick\n'),
    terminalStart('exec-2'), terminalDone('exec-2', 'tick\n')];
  const items = terminalItems(buildChatTimeline({ eventLog }, 'done'));
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.terminalOutput), ['tick\n', 'tick\n']);
});

test('a yielded exec_command stays running without rendering its status summary as output', () => {
  const eventLog = [
    {
      type: 'tool_call_started',
      callId: 'exec-1',
      toolName: 'exec_command',
      toolInput: { command: 'python train.py' },
    },
    {
      type: 'tool_call_completed',
      callId: 'exec-1',
      toolName: 'exec_command',
      outputSummary: 'Command is still running.',
      toolOutput: '{"tool_name":"exec_command","result_state":"partial"}',
      toolResponse: {
        status: 'ok',
        result_state: 'partial',
        data: { session_id: 'session-1' },
      },
    },
  ];

  const [item] = buildChatTimeline({ eventLog, toolCalls: [] }, 'running').items;
  const view = buildToolView(item);
  assert.equal(item.status, 'running');
  assert.equal(view.stdout, '');
  assert.equal(view.running, true);
});
