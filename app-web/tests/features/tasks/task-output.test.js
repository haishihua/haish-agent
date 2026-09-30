import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = {
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
};

const { taskFinalOutputText, taskRunOutputText } = await import(
  '../../../src/features/tasks/model/runtime-events.js'
);

const WORKER_REPORT = '扫描完成。以下是只读分析结果。\n\n## 结论（BLUF）\n\n三天 trace 里确实存在两处层间提示词冲突。';
const VERDICT_JSON = JSON.stringify({ verdict: 'DONE', reason: 'The goal was delivered and reproduced.' });
const GOAL_SNAPSHOT_NODES = [
  { id: 'start', type: 'start' },
  { id: 'goal_worker', type: 'agent' },
  { id: 'goal_verifier', type: 'agent' },
  { id: 'goal_gate', type: 'condition' },
  { id: 'output', type: 'output' },
];

// 和线上那只任务同形状的 goal-loop 运行：Worker 交人话报告，Verifier 交 verdict JSON，
// Gate 是条件节点（summary 是 `matched:DONE->output` 这种控制串），老快照的 End 映射的
// 也是 verdict JSON（value 是结构化对象）。
function goalRunTask({ endValue = { verdict: 'DONE' }, snapshot = { nodes: GOAL_SNAPSHOT_NODES } } = {}) {
  return {
    executionMode: 'bot',
    title: '扫一下当前项目这三天的trace',
    workflowSnapshot: snapshot,
    workflowRun: {
      nodes: {
        start: { status: 'done', summary: '扫一下当前项目这三天的trace' },
        goal_worker: { status: 'done', summary: WORKER_REPORT },
        goal_verifier: { status: 'done', summary: VERDICT_JSON, structured: { verdict: 'DONE' } },
        goal_gate: { status: 'done', summary: 'matched:DONE->output' },
        output: { status: 'done', summary: VERDICT_JSON, value: endValue },
      },
    },
  };
}

test('goal-loop 老快照的报告取 Worker 的人话报告，不再摊 Gate 匹配串或 verdict JSON', () => {
  for (const task of [goalRunTask(), goalRunTask({ snapshot: null })]) {
    const result = taskFinalOutputText(task, '');
    assert.equal(result, WORKER_REPORT);
    assert.notEqual(result, 'matched:DONE->output');
    assert.notEqual(result, VERDICT_JSON);
  }
});

test('新的 Goal Loop（End 直接输出报告文本）优先取 End 节点的字符串产出', () => {
  const task = goalRunTask({ endValue: WORKER_REPORT });
  task.workflowRun.nodes.output.summary = WORKER_REPORT;
  assert.equal(taskFinalOutputText(task, ''), WORKER_REPORT);
});

test('全是机器产出时不编内容：回落到旧口径的最后一个节点摘要', () => {
  const task = goalRunTask({ endValue: { verdict: 'DONE' } });
  delete task.workflowRun.nodes.goal_worker;
  assert.equal(taskFinalOutputText(task, ''), VERDICT_JSON);
});

test('taskRunOutputText：value 是字符串用 value，是结构化对象返回空，缺省用 summary', () => {
  const withString = goalRunTask({ endValue: '  End 文本产出  ' });
  assert.equal(taskRunOutputText(withString), 'End 文本产出');

  const withObject = goalRunTask({ endValue: { verdict: 'DONE' } });
  assert.equal(taskRunOutputText(withObject), '');

  const withSummaryOnly = goalRunTask({ endValue: null });
  assert.equal(taskRunOutputText(withSummaryOnly), VERDICT_JSON);
});

test('聊天任务没有工作流时回落到 answerText / 错误', () => {
  assert.equal(taskFinalOutputText({ executionMode: 'chat', answerText: '聊天回答' }, ''), '聊天回答');
  assert.equal(taskFinalOutputText({ executionMode: 'chat', error: '跑挂了' }, ''), '跑挂了');
});

const taskCardsSource = fs.readFileSync(
  new URL('../../../src/features/conversations/components/ConversationTaskCards.jsx', import.meta.url),
  'utf8',
);
const projectNodeSource = fs.readFileSync(
  new URL('../../../src/features/conversations/components/ProjectNode.jsx', import.meta.url),
  'utf8',
);
const appShellSource = fs.readFileSync(
  new URL('../../../src/features/app/AppShell.jsx', import.meta.url),
  'utf8',
);
const conversationHandlersSource = fs.readFileSync(
  new URL('../../../src/features/conversations/hooks/createConversationHandlers.js', import.meta.url),
  'utf8',
);
const panelsCss = fs.readFileSync(
  new URL('../../../styles/panels.css', import.meta.url),
  'utf8',
);
const appIconSource = fs.readFileSync(
  new URL('../../../src/shared/ui/AppIcon.jsx', import.meta.url),
  'utf8',
);

test('报告入口只在收工且真有产出的任务卡尾部出现，聊天模式仍隐掉', () => {
  assert.match(taskCardsSource, /isTerminalTaskStatus\(status\)/, 'the entry is gated on settled tasks');
  assert.match(taskCardsSource, /hasReport \? ' has-report' : ''/);
  assert.match(taskCardsSource, /aria-label="View report"/);
  // 图标走共享矢量图标表里的 report（FileText）：旧 report.png 是「剪贴板 + 图表 +
  // 两个勾」，缩到 16px 细节糊成一团；矢量描边 15px 下才看得清，也和旁边同一颗
  // 按钮皮里的 retry 图标同一档（AppIcon，见 contracts/llm-retry-timeline.test.js）。
  assert.match(taskCardsSource, /<AppIcon name="report" size=\{15\} \/>/);
  assert.doesNotMatch(taskCardsSource, /ico-report/);
  assert.match(appIconSource, /report: FileText/);
  assert.match(appIconSource, /^ {2}FileText,$/m);
  assert.match(panelsCss, /\.app-body\.chat-mode \.conversation-report-btn\s*\{[^}]*display:\s*none/);
});

test('Task 模式的侧栏行和会话任务卡都把报告入口接到 onOpenTaskReport 上', () => {
  assert.match(projectNodeSource, /onOpenReport=\{onOpenTaskReport\}/);
  assert.match(projectNodeSource, /onOpenTaskReport=\{onOpenTaskReport\}/);
  assert.match(appShellSource, /onOpenTaskReport=\{handleOpenTaskReport\}/);
});

test('报告内容只有一个出口：handleOpenTaskReport 用 taskFinalOutputText', () => {
  assert.match(conversationHandlersSource, /import \{ taskFinalOutputText \}/);
  assert.match(conversationHandlersSource, /const result = taskFinalOutputText\(/);
});

test('报告入口和悬停操作不叠在一起（has-report 给入口让位）', () => {
  assert.match(panelsCss, /\.conversation-task-card\.has-report \.conversation-actions\s*\{[^}]*right:\s*36px/);
  // 标题留白 44 → 24px（跟无报告那一档 40 → 20px 一起收，任务标题多显示 20px）：
  // 报告按钮 24px + 组间距 10px + 留白 24px = 标题框右端离行右缘 69px，
  // 仍在悬停删除按钮（离行右缘 36 → 61px）左侧留 8px。
  assert.match(panelsCss, /\.conversation-task-card\.has-actions\.has-report \.conversation-task-copy\s*\{[^}]*padding-right:\s*24px/);
  assert.doesNotMatch(panelsCss, /\.conversation-task-card\.has-actions\.has-report \.conversation-task-copy\s*\{[^}]*padding-right:\s*44px/);
});

test('收工不自动弹报告（结果只从报告入口进）', () => {
  const notifyBody = appShellSource.match(/function notifyTaskComplete\(([\s\S]*?)\n {2}\}/);
  assert.ok(notifyBody, 'notifyTaskComplete must exist');
  assert.doesNotMatch(notifyBody[0], /setHollow/);
});
