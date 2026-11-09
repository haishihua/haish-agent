import test from 'node:test';
import assert from 'node:assert/strict';

import { assistantNameForTask, workflowAgentName, workflowNodeAgentName } from '../../../src/features/chat/model/assistant-name.js';
import { agentDisplayNameForId } from '../../../src/core/agent-settings.js';

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

test('a workflow agent node names its reply from the agent configured on that node', () => {
  assert.equal(
    workflowNodeAgentName({ id: 'requirements', type: 'agent', agent_id: 'custom.agent-code' }, AGENT_OPTIONS),
    'Code Agent',
  );
  // 节点配置里没绑 agent（老配置）或绑的 agent 已下线 → 不给名字，气泡退回 "Assistant"。
  assert.equal(workflowNodeAgentName({ type: 'agent' }, AGENT_OPTIONS), '');
  assert.equal(workflowNodeAgentName({ type: 'agent', agent_id: 'custom.agent-gone' }, AGENT_OPTIONS), '');
  assert.equal(workflowNodeAgentName({ type: 'agent', agent_id: 'custom.agent-code' }, null), '');
});

test('workflow nodes resolve an executed name without a task yet', () => {
  // 刚进 /goal、任务还没建：首屏也会算名字，读任务字段前必须先看任务是否存在。
  assert.equal(workflowAgentName('preset.general', null, AGENT_OPTIONS), 'Task Assistant');
  assert.equal(workflowAgentName('custom.agent-code', undefined, AGENT_OPTIONS), 'Code Agent');
  assert.equal(workflowAgentName(undefined, null, AGENT_OPTIONS), '');
  assert.equal(workflowAgentName('custom.agent-gone', null, AGENT_OPTIONS), '');
});

test('the recorded execution identity wins over a renamed or retired catalog entry', () => {
  const task = { profileId: 'custom.agent-code', profileDisplayName: 'Release Operator' };
  assert.equal(workflowAgentName('custom.agent-code', task, AGENT_OPTIONS), 'Release Operator');
  assert.equal(workflowAgentName('custom.agent-code', task, []), 'Release Operator');
  // 任务记录的是别的 agent 时不能借用它的名字。
  assert.equal(workflowAgentName('preset.general', task, AGENT_OPTIONS), 'Task Assistant');
  assert.equal(workflowAgentName('preset.general', { ...task, profileDisplayName: '' }, AGENT_OPTIONS), 'Task Assistant');
});

test('only agent nodes carry a reply name; the others have no agent to sign with', () => {
  for (const type of ['llm', 'tool', 'condition', 'human_approval', 'loop', 'start', 'output']) {
    assert.equal(
      workflowNodeAgentName({ id: 'node', type, agent_id: 'custom.agent-code' }, AGENT_OPTIONS),
      '',
      `${type} nodes have no configured agent`,
    );
  }
  assert.equal(workflowNodeAgentName(null, AGENT_OPTIONS), '');
  assert.equal(workflowNodeAgentName(undefined, AGENT_OPTIONS), '');
});
