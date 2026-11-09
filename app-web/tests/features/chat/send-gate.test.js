// 发送判据的真值表：重构前它散成三份（ChatComposer 的 sendBlockedReason、SendControls
// 两个提交按钮各自的 disabled 表达式），这里把原始表达式原样留在基准里，逐条比对
// model/send-gate.js 的结论。判据以后要改，先让这张表全绿——否则改的就不是「搬家」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSendGate } from '../../../src/features/chat/model/send-gate.js';

const AGENT_DISABLED = 'This Agent is disabled. Select an enabled Agent before starting.';

function legacyBlockedReason({ goal, modelConfigError, selectionDisabled }) {
  return ((!goal || goal.prompt) && modelConfigError)
    || (selectionDisabled ? AGENT_DISABLED : '');
}

// ChatComposer.sendBlockedReason 原本只喂 tooltip；主发送按钮的 disabled 里那一条
// Boolean((!goal || goal.prompt) && modelConfigError) 与它同源。
function legacyMainDisabled(input) {
  const {
    disabled, waitingForSend, goalPending, configReady, selectionDisabled, canSubmitPayload, modelConfigError, goal,
  } = input;
  return disabled || waitingForSend || goalPending || !configReady || selectionDisabled
    || !canSubmitPayload || Boolean((!goal || goal.prompt) && modelConfigError);
}

function legacyRuntimeInputDisabled(input) {
  const {
    disabled, waitingForSend, runtimeInputPending, goalPending, canSubmitPayload,
  } = input;
  return disabled || waitingForSend || runtimeInputPending || goalPending || !canSubmitPayload;
}

const BOOLEAN_KEYS = [
  'disabled', 'waitingForSend', 'goalPending', 'canSubmitPayload',
  'configReady', 'selectionDisabled', 'runtimeInputPending',
];
const GOALS = [null, { prompt: '' }, { prompt: '整理一下这个仓库' }];
const MODEL_ERRORS = ['', 'Chat: select a saved model configuration before sending.'];

function* everyInput() {
  for (let mask = 0; mask < 2 ** BOOLEAN_KEYS.length; mask += 1) {
    const flags = Object.fromEntries(BOOLEAN_KEYS.map((key, index) => [key, Boolean(mask & (1 << index))]));
    for (const goal of GOALS) {
      for (const modelConfigError of MODEL_ERRORS) {
        yield { ...flags, goal, modelConfigError };
      }
    }
  }
}

test('主发送：canSend / blockedReason 与重构前的表达式逐条一致', () => {
  let checked = 0;
  for (const input of everyInput()) {
    const gate = resolveSendGate({ ...input, runtimeInput: false });
    assert.equal(gate.canSend, !legacyMainDisabled(input), `canSend 变了：${JSON.stringify(input)}`);
    assert.equal(gate.blockedReason, legacyBlockedReason(input), `blockedReason 变了：${JSON.stringify(input)}`);
    checked += 1;
  }
  assert.equal(checked, 2 ** BOOLEAN_KEYS.length * GOALS.length * MODEL_ERRORS.length);
});

test('运行中纠偏：只认禁用 / 在途 / goal 在跑 / 载荷，配置三条不参与', () => {
  for (const input of everyInput()) {
    const gate = resolveSendGate({ ...input, runtimeInput: true });
    assert.equal(gate.canSend, !legacyRuntimeInputDisabled(input), `canSend 变了：${JSON.stringify(input)}`);
  }
});

test('Goal 只有命令没有任务描述时不校验模型路由', () => {
  assert.equal(resolveSendGate({ canSubmitPayload: true, goal: { prompt: '' }, modelConfigError: AGENT_DISABLED }).canSend, true);
  assert.equal(resolveSendGate({ canSubmitPayload: true, goal: { prompt: 'do it' }, modelConfigError: 'x' }).canSend, false);
  // 没选 /goal 的普通发送照旧按模型路由拦。
  assert.equal(resolveSendGate({ canSubmitPayload: true, goal: null, modelConfigError: 'x' }).canSend, false);
});

test('Agent 被停用：挡住发送，并且给出的还是那句提示', () => {
  const gate = resolveSendGate({ canSubmitPayload: true, selectionDisabled: true });
  assert.equal(gate.canSend, false);
  assert.equal(gate.blockedReason, AGENT_DISABLED);
});

test('空载荷、配置没同步完、等待上一次发送都发不出去', () => {
  assert.equal(resolveSendGate({}).canSend, false);
  assert.equal(resolveSendGate({ canSubmitPayload: true, configReady: false }).canSend, false);
  assert.equal(resolveSendGate({ canSubmitPayload: true, waitingForSend: true }).canSend, false);
  assert.equal(resolveSendGate({ canSubmitPayload: true }).canSend, true);
});
