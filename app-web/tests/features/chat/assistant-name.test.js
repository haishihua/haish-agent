import test from 'node:test';
import assert from 'node:assert/strict';

import { assistantNameForTask } from '../../../src/features/chat/model/assistant-name.js';
import { agentDisplayNameForId } from '../../../src/features/agents/model/agent-settings.js';

const AGENT_OPTIONS = [
  { id: 'preset.general', label: 'Task Assistant' },
  { id: 'custom.agent-code', label: 'Code Agent' },
];

test('the agent recorded on the turn names the bubble', () => {
  assert.equal(
    assistantNameForTask({ profileDisplayName: 'Code Agent', profileId: 'custom.agent-code' }, null, AGENT_OPTIONS),
    'Code Agent',
  );
  // 改名 / 下线都不影响已落库的那一轮：记录里的名字优先于 catalog。
  assert.equal(
    assistantNameForTask({ profileDisplayName: 'Release Operator', profileId: 'custom.retired' }, null, AGENT_OPTIONS),
    'Release Operator',
  );
});

test('a turn that outranks the conversation keeps its own agent', () => {
  assert.equal(
    assistantNameForTask(
      { profileDisplayName: 'Test Engineer', profileId: 'custom.agent-tests' },
      { profileDisplayName: 'Code Agent', agentId: 'custom.agent-code' },
      AGENT_OPTIONS,
    ),
    'Test Engineer',
  );
});

test('a turn the server has not recorded yet uses the agent id of that round', () => {
  assert.equal(
    assistantNameForTask({ profileDisplayName: '', requestedAgentId: 'custom.agent-code' }, null, AGENT_OPTIONS),
    'Code Agent',
  );
  assert.equal(
    assistantNameForTask({ requestedAgentId: 'preset.general' }, { agentId: 'custom.agent-code' }, AGENT_OPTIONS),
    'Task Assistant',
  );
});

test('a turn without its own agent record falls back to the agent the conversation started with', () => {
  assert.equal(
    assistantNameForTask({}, { profileDisplayName: 'Simple Agent' }, AGENT_OPTIONS),
    'Simple Agent',
  );
  assert.equal(
    assistantNameForTask({}, { agentId: 'custom.agent-code' }, AGENT_OPTIONS),
    'Code Agent',
  );
});

test('an agent missing from the catalog keeps its recorded name and never leaks the id', () => {
  assert.equal(
    assistantNameForTask({ profileDisplayName: 'Benchmark Task Assistant', profileId: 'custom.agent-gone' }, null, AGENT_OPTIONS),
    'Benchmark Task Assistant',
  );
  assert.equal(assistantNameForTask({ profileId: 'custom.agent-gone' }, null, AGENT_OPTIONS), '');
  assert.equal(assistantNameForTask({}, { agentId: 'custom.agent-gone' }, AGENT_OPTIONS), '');
});

test('names are trimmed and an unknown assistant stays nameless for the view to decide', () => {
  assert.equal(assistantNameForTask({ profileDisplayName: '  Code Agent  ' }, null, AGENT_OPTIONS), 'Code Agent');
  assert.equal(assistantNameForTask({ profileDisplayName: '   ' }, { profileDisplayName: '  ' }, AGENT_OPTIONS), '');
  assert.equal(assistantNameForTask(null, null, AGENT_OPTIONS), '');
  assert.equal(assistantNameForTask({}, {}, []), '');
});

test('agent ids resolve through the picker catalog only', () => {
  assert.equal(agentDisplayNameForId('custom.agent-code', AGENT_OPTIONS), 'Code Agent');
  assert.equal(agentDisplayNameForId('', AGENT_OPTIONS), '');
  assert.equal(agentDisplayNameForId('custom.agent-code', null), '');
  // 选单里没有的 id 不许把内部 id 当名字显示。
  assert.equal(agentDisplayNameForId('custom.agent-code', [{ id: 'preset.general', label: 'Task Assistant' }]), '');
});
