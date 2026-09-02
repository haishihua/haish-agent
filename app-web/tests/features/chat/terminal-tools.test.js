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
const chatStyleSource = fs.readFileSync(
  new URL('../../../styles/chat.css', import.meta.url),
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

test('terminal card reuses the macOS frame with context and process state', () => {
  assert.match(terminalComponentSource, /chat-terminal-bar/);
  assert.match(terminalComponentSource, /chat-terminal-dots/);
  assert.match(terminalComponentSource, /view\.cwd \|\| 'Terminal'/);
  assert.match(terminalComponentSource, /`exit \$\{view\.exitCode\}`/);
  assert.match(chatStyleSource, /\.chat-terminal-bar/);
  assert.match(chatStyleSource, /\.chat-terminal-state\.running/);
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
