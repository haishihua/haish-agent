// 节点端口与回环落点：配置页和运行页共用同一份判断，所以这里的输入输出就是「两页画出来一样」的证据。
// 以前这两个函数在 WorkflowFlowNode.jsx 里，测试只能 grep 源码里那几行；现在直接对拍结果。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  workflowFeedbackTargetIds,
  workflowNodePorts,
} from '../../../src/features/workflow/model/workflow-node-ports.js';

test('主链端口面对面：向右走右出左进，向左走左出右进', () => {
  const cases = [
    ['right', 'right', 'left'],
    ['left', 'left', 'right'],
    // 没有方向（布局还没算出来）时按向右走。
    [undefined, 'right', 'left'],
  ];
  for (const [direction, source, target] of cases) {
    const ports = workflowNodePorts({ type: 'agent' }, { direction, kind: 'primary' });
    assert.equal(ports.sourcePosition, source, `direction=${direction} 出端口`);
    assert.equal(ports.targetPosition, target, `direction=${direction} 进端口`);
    // 主链节点没有分支端口。
    assert.equal(ports.branchSourcePositions, undefined);
  }
});

test('返工节点输入统一走顶部，出口跟方向反向；loop 的 retry 出口与自己出端口同侧', () => {
  // 次级链里的普通节点：进来走顶部，出去朝主链那一侧。
  assert.deepEqual(workflowNodePorts({ type: 'agent' }, { kind: 'secondary', direction: 'right' }), {
    sourcePosition: 'left',
    targetPosition: 'top',
    branchSourcePositions: undefined,
  });
  // loop 的 retry 必须挂在节点自己的出端口上（配置页曾把它画到顶部，同一条边两页形状不同），
  // 并且要把 retry 这一路的端口位置显式交给 React Flow。
  assert.deepEqual(workflowNodePorts({ type: 'loop' }, { kind: 'secondary', direction: 'right' }), {
    sourcePosition: 'left',
    targetPosition: 'right',
    branchSourcePositions: { retry: 'left' },
  });
  assert.deepEqual(workflowNodePorts({ type: 'loop' }, { kind: 'secondary', direction: 'left' }), {
    sourcePosition: 'right',
    targetPosition: 'left',
    branchSourcePositions: { retry: 'right' },
  });
  // loop 即便没有布局信息也算次级链（回环节点永远不在主链上），不能退回主链端口。
  assert.deepEqual(workflowNodePorts({ type: 'loop' }, undefined), {
    sourcePosition: 'left',
    targetPosition: 'right',
    branchSourcePositions: { retry: 'left' },
  });
  // 次级链里的判定节点不是 loop：不给 retry 端口。
  assert.deepEqual(workflowNodePorts({ type: 'condition' }, { kind: 'secondary' }), {
    sourcePosition: 'left',
    targetPosition: 'top',
    branchSourcePositions: undefined,
  });
});

test('回环端口只落在主链节点上：retry 边与「次级链 → 主链」的边都要', () => {
  const meta = new Map([
    ['rework', { kind: 'secondary' }],
    ['worker', { kind: 'primary' }],
  ]);
  // retry 边没有 branch 也能从「源在次级链、目标在主链」认出来。
  assert.deepEqual([...workflowFeedbackTargetIds([{ from: 'rework', to: 'worker', branch: 'retry' }], meta)], ['worker']);
  assert.deepEqual([...workflowFeedbackTargetIds([{ from: 'rework', to: 'worker' }], meta)], ['worker']);
  // exhausted 走的是同一条回环落点（它不是 retry 分支，靠次级链判断）。
  assert.deepEqual(
    [...workflowFeedbackTargetIds(
      [{ from: 'rework', to: 'end' }],
      new Map([['rework', { kind: 'secondary' }], ['end', { kind: 'primary' }]]),
    )],
    ['end'],
  );
  // 主链内部的边走普通端口，不该多长出一个回环把手；次级链之间的边同理。
  assert.deepEqual([...workflowFeedbackTargetIds([{ from: 'worker', to: 'end' }], meta)], []);
  assert.deepEqual(
    [...workflowFeedbackTargetIds([{ from: 'a', to: 'b' }], new Map([['a', { kind: 'secondary' }], ['b', { kind: 'secondary' }]]))],
    [],
  );
  // React Flow 的边用 source/target，工作流定义用 from/to：两种命名都要认。
  assert.deepEqual([...workflowFeedbackTargetIds([{ source: 'rework', target: 'worker', branch: 'retry' }], meta)], ['worker']);
  // 没有边（工作流还没连）/ 不是数组时给空集合，不炸。
  assert.deepEqual([...workflowFeedbackTargetIds(undefined, meta)], []);
  assert.deepEqual([...workflowFeedbackTargetIds({}, meta)], []);
});
