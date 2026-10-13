import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSubAgentTimelineItems, buildToolView } from '../../../src/features/chat/model/tool-view.js';

globalThis.window = {};
const { buildChatTimeline } = await import('../../../src/features/chat/model/chat-timeline.js');
const { runtimeEventToLog } = await import('../../../src/features/tasks/model/runtime-events.js');

const start = (callId, toolName, toolInput) => ({
  type: 'sub_agent_tool_call_started', callId, toolName, toolInput,
});
const done = (callId, toolName, output, data = { exit_code: 0 }, extra = {}) => ({
  type: 'sub_agent_tool_call_completed', callId, toolName,
  toolResponse: { status: 'ok', result_state: data.session_id ? 'partial' : 'resolved',
    data, artifacts: { output }, ...extra },
});
const exec = (id = 'exec', command = 'npm test') => start(id, 'exec_command', { command });
const poll = (id = 'poll', session = 'session', chars = '') => start(id, 'write_stdin', { session_id: session, chars });
const subItems = (progressEvents, state = {}) => buildSubAgentTimelineItems({ progressEvents, isRunning: true, ...state });
const tools = (items) => items.flatMap((item) => item.kind === 'tool_group' ? item.tools : [item]).filter((item) => item.kind === 'tool');

const sessionEvents = () => [
  exec(), done('exec', 'exec_command', 'collecting\n', { session_id: 'session' }),
  start('read', 'read_file', { path: 'README.md' }), done('read', 'read_file', ''),
  poll(), done('poll', 'write_stdin', '3 passed\n'),
];

test('sub-agent polls merge into the original Shell without moving it past intervening tools', () => {
  const events = sessionEvents();
  const [shell, read] = tools(subItems(events.slice(0, 4)));
  assert.equal(shell.status, 'running', 'yielded command is not finished');
  assert.equal(read.toolName, 'read_file');
  const finished = tools(subItems(events));
  assert.deepEqual(finished.map((item) => item.toolName), ['exec_command', 'read_file']);
  assert.equal(finished[0].id, shell.id, 'poll completion keeps disclosure identity');
  assert.equal(finished[0].status, 'done');
  const view = buildToolView(finished[0]);
  assert.equal(view.command, 'npm test');
  assert.equal(view.stdout, 'collecting\n3 passed\n');
  assert.equal(view.exitCode, 0);
  assert.equal(view.running, false);
});

test('main and sub-agent terminal projection share output and status at every event boundary', () => {
  const events = [exec(), done('exec', 'exec_command', 'tick\n', { session_id: 'session' }),
    poll('poll-1'), done('poll-1', 'write_stdin', 'tick\n', { session_id: 'session' }),
    poll('poll-2', 'session', 'yes\n'), done('poll-2', 'write_stdin', 'tick\n')];
  const projection = (items) => tools(items).map((item) => {
    const view = buildToolView(item);
    return { status: item.status, command: view.command, stdout: view.stdout, stderr: view.stderr,
      exitCode: view.exitCode, running: view.running, failed: view.failed };
  });
  for (let size = 1; size <= events.length; size += 1) {
    const prefix = events.slice(0, size);
    const main = buildChatTimeline({ eventLog: prefix.map((event) => ({ ...event, type: event.type.replace('sub_agent_', '') })) }, 'running');
    assert.deepEqual(projection(subItems(prefix)), projection(main.items), `event boundary ${size}`);
  }
  assert.equal(buildToolView(subItems(events)[0]).stdout, 'tick\ntick\ntick\n', 'identical output from separate polls is preserved');
});

test('interruption and nonzero exit update the original shell failure and stderr', () => {
  const events = [exec(), done('exec', 'exec_command', 'started\n', { session_id: 'session' }),
    poll('interrupt', 'session', '\u0003'),
    done('interrupt', 'write_stdin', 'stopped\n', { exit_code: 130 }, {
      status: 'error', result_state: 'failed', operation: 'interrupt',
      error: { message: 'interrupted' }, artifacts: { output: 'stopped\n', stderr: 'KeyboardInterrupt\n' },
    })];
  const items = subItems(events);
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'failed');
  assert.equal(buildToolView(items[0]).label, 'Shell npm test');
  assert.equal(buildToolView(items[0]).stdout, 'started\nstopped\n');
  assert.equal(buildToolView(items[0]).stderr, 'KeyboardInterrupt\n');
  assert.equal(buildToolView(items[0]).exitCode, 130);
  assert.equal(buildToolView(items[0]).failed, true);
});

test('two concurrent shells and interleaved polls stay linked only by session id', () => {
  const events = [exec('a', 'command A'), exec('b', 'command B'),
    done('b', 'exec_command', 'B1\n', { session_id: 'b-session' }),
    done('a', 'exec_command', 'A1\n', { session_id: 'a-session' }),
    poll('pb', 'b-session'), poll('pa', 'a-session'),
    done('pa', 'write_stdin', 'A2\n'), done('pb', 'write_stdin', 'B2\n')];
  const items = subItems(events);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => buildToolView(item).command), ['command A', 'command B']);
  assert.deepEqual(items.map((item) => buildToolView(item).stdout), ['A1\nA2\n', 'B1\nB2\n']);
});

test('orphan polls do not create standalone cards or attach to an unrelated shell', () => {
  const events = [exec(), done('exec', 'exec_command', 'own\n', { session_id: 'owned' }),
    poll('orphan', 'missing'), done('orphan', 'write_stdin', 'foreign\n'),
    { type: 'sub_agent_answer_delta', message: 'Continuing review.' }];
  const items = subItems(events);
  assert.equal(tools(items).length, 1);
  assert.equal(buildToolView(items[0]).stdout, 'own\n');
  assert.equal(items.at(-1).text, 'Continuing review.');
  assert.deepEqual(subItems([poll('orphan'), done('orphan', 'write_stdin', 'missing\n')]), []);
});

test('duplicate completion replay does not duplicate output and serialized cmd/session fields work', () => {
  const begin = start('exec', 'exec_command', JSON.stringify({ cmd: 'printf tick' }));
  const partial = done('exec', 'exec_command', 'tick\n', { session_id: 'session' });
  partial.toolResponse = JSON.stringify(partial.toolResponse);
  const query = start('poll', 'write_stdin', JSON.stringify({ session_id: 'session', chars: '' }));
  const finish = done('poll', 'write_stdin', 'tick\n');
  const items = subItems([begin, partial, partial, query, finish, finish]);
  assert.equal(items.length, 1);
  assert.equal(buildToolView(items[0]).command, 'printf tick');
  assert.equal(buildToolView(items[0]).stdout, 'tick\ntick\n');
});

test('a completion-only poll with input can find its origin; completed execs can seed sessions', () => {
  const first = { ...done('exec', 'exec_command', 'start\n', { session_id: 'session' }), toolInput: { command: 'npm test' } };
  const last = { ...done('poll', 'write_stdin', 'finish\n'), toolInput: { session_id: 'session', chars: '' } };
  const items = subItems([first, last]);
  assert.equal(items.length, 1);
  assert.equal(buildToolView(items[0]).stdout, 'start\nfinish\n');
  assert.equal(buildToolView(items[0]).exitCode, 0);
});

test('same-name calls with distinct ids never consume another pending command', () => {
  const items = subItems([exec('pending', 'sleep 1'),
    { ...done('other', 'exec_command', 'independent\n'), toolInput: { command: 'echo independent' } }]);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => buildToolView(item).command), ['sleep 1', 'echo independent']);
});

test('duplicate start replay keeps one original card before and after completion', () => {
  const begin = exec();
  const finish = done('exec', 'exec_command', 'passed\n');
  const items = subItems([begin, begin, finish, begin, finish]);
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'done');
  assert.equal(buildToolView(items[0]).stdout, 'passed\n');
});

test('legacy events without call ids still pair after the enclosing agent settles', () => {
  const events = [exec('', 'legacy first'), done('', 'exec_command', 'first\n'),
    exec('', 'legacy second'), done('', 'exec_command', 'second\n')];
  for (const state of [{ isRunning: true }, { isRunning: false }, { isRunning: false, failed: true }]) {
    const items = subItems(events, state);
    assert.equal(items.length, 2);
    assert.deepEqual(items.map((item) => buildToolView(item).stdout), ['first\n', 'second\n']);
    assert.deepEqual(items.map((item) => item.status), ['done', 'done']);
  }
});

test('running shells follow the sub-agent final state without changing completed exit codes', () => {
  const events = [exec(), done('exec', 'exec_command', '', { session_id: 'session' })];
  for (const [state, expected] of [[{ isRunning: true }, 'running'], [{ isRunning: false }, 'done'],
    [{ isRunning: false, cancelled: true }, 'cancelled'], [{ isRunning: false, failed: true }, 'failed']]) {
    assert.equal(subItems(events, state)[0].status, expected);
  }
  assert.equal(subItems(sessionEvents(), { isRunning: false, failed: true })[0].status, 'done');
});

test('raw runtime replay isolates two delegates and the main agent even when ids and sessions match', () => {
  const eventLog = [];
  for (const parent of ['delegate-a', 'delegate-b']) {
    eventLog.push(runtimeEventToLog({ type: 'tool_call_started', call_id: parent, tool_name: 'dispatch_sub_agent', tool_input: { agent: 'reviewer' } }));
    for (const event of sessionEvents()) {
      eventLog.push(runtimeEventToLog({ type: event.type, parent_call_id: parent, call_id: event.callId,
        tool_name: event.toolName, tool_input: event.toolInput,
        tool_response: event.toolResponse, output_summary: event.toolResponse ? 'Tool completed.' : '',
        message: event.toolResponse ? 'Tool completed.' : 'Tool requested.' }));
    }
  }
  eventLog.push({ type: 'tool_call_started', callId: 'exec', toolName: 'exec_command', toolInput: { command: 'main command' } },
    { type: 'tool_call_completed', callId: 'exec', toolName: 'exec_command', toolResponse: { status: 'ok', data: { session_id: 'session' }, artifacts: { output: 'main only\n' } } });
  const main = tools(buildChatTimeline({ eventLog }, 'running').items);
  const delegates = main.filter((item) => item.toolName === 'dispatch_sub_agent');
  assert.equal(delegates.length, 2);
  for (const delegate of delegates) {
    const childTools = tools(buildSubAgentTimelineItems(buildToolView(delegate)));
    assert.deepEqual(childTools.map((item) => item.toolName), ['exec_command', 'read_file']);
    assert.equal(buildToolView(childTools[0]).stdout, 'collecting\n3 passed\n');
  }
  const mainShell = main.find((item) => item.toolName === 'exec_command');
  assert.equal(buildToolView(mainShell).stdout, 'main only\n');
  assert.equal(mainShell.status, 'running');
});
