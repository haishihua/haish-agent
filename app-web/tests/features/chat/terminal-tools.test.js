import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildToolView, TOOL_SHELL_NAMES } from '../../../src/features/chat/model/tool-view.js';

const agentSettingsSource = fs.readFileSync(
  new URL('../../../src/features/agents/model/agent-settings.js', import.meta.url),
  'utf8',
);
const chatTimelineSource = fs.readFileSync(
  new URL('../../../src/features/chat/model/chat-timeline.js', import.meta.url),
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
  assert.equal(view.command, 'pytest -q');
  assert.equal(view.stdout, '3 passed\n');
  assert.equal(view.exitCode, 0);
});

test('write_stdin remains a terminal interaction', () => {
  const view = buildToolView({
    toolName: 'write_stdin',
    status: 'done',
    toolInput: { session_id: 'session-1', chars: '' },
    toolResponse: {
      status: 'ok',
      result_state: 'partial',
      data: { session_id: 'session-1' },
      artifacts: { output: 'still running\n' },
    },
  });

  assert.equal(view.mode, 'terminal');
  assert.equal(view.label, 'Shell input');
  assert.equal(view.stdout, 'still running\n');
  assert.match(chatTimelineSource, /name === 'exec_command' \|\| name === 'write_stdin'/);
});
