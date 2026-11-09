import test from 'node:test';
import assert from 'node:assert/strict';
import { goalJudgeInput } from '../../../src/core/node-attempts.js';

const judge = { id: 'judge', type: 'llm' };
const task = { workflowSnapshot: { workflow_id: 'workflow.goal-loop' } };

test('Goal Judge input displays the original goal, not its LLM configuration object', () => {
  const input = { prompt: JSON.stringify({ goal: 'Continue the work\nwith checks' }), system: 'internal rule', runtime_config_from: 'agent' };
  assert.deepEqual(goalJudgeInput(judge, task, input), { goal: 'Continue the work\nwith checks' });
  assert.deepEqual(goalJudgeInput(judge, task, { prompt: { goal: 'Direct goal' } }), { goal: 'Direct goal' });
  assert.deepEqual(goalJudgeInput(judge, task, null), { goal: '' });
  assert.deepEqual(goalJudgeInput(judge, task, { prompt: 'broken JSON' }), { goal: '' });
});

test('Other nodes and workflows keep their normal input display', () => {
  assert.equal(goalJudgeInput({ id: 'agent', type: 'agent' }, task, {}), null);
  assert.equal(goalJudgeInput(judge, { workflowSnapshot: { workflow_id: 'custom.review' } }, {}), null);
});
