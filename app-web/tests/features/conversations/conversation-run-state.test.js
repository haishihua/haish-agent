import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { isTaskLive } from '../../../src/features/conversations/model/conversation-status.js';
import {
  RUN_STATE_APPROVAL,
  RUN_STATE_IDLE,
  RUN_STATE_RUNNING,
  RUN_STATE_WAITING_INPUT,
  isRunStateLive,
  resolveConversationRunState,
  resolveConversationWaitState,
  settledTaskIds,
} from '../../../src/features/conversations/model/conversation-run-state.js';

// 用户报的问题：「这会话状态是不是有 bug 啊，暂停之后应该要继续 loading 啊」——面板说在跑、
// 侧边栏那行什么都没亮。原因是两处各自算「还在跑」：面板看本地运行时任务，侧边栏看服务端
// 列表 + workflowRun 快照，收尾/恢复慢半拍就打架。
// 现在只有一份判据（model/conversation-run-state.js）：
//   在跑 = 任务自身未落终态（isTaskLive）；等用户动手 = 后端实时快照；终态 = 熄灯。
// 三盏灯（侧边栏蓝灯/黄灯、面板 streaming、面板活动文案）都读它。
const nodeSource = readFileSync(
  new URL('../../../src/features/conversations/components/ConversationNode.jsx', import.meta.url),
  'utf8',
);
const iconsSource = readFileSync(
  new URL('../../../src/features/conversations/components/ConversationIcons.jsx', import.meta.url),
  'utf8',
);
const hookSource = readFileSync(
  new URL('../../../src/features/conversations/hooks/useConversationRunState.js', import.meta.url),
  'utf8',
);
const modelSource = readFileSync(
  new URL('../../../src/features/conversations/model/conversation-run-state.js', import.meta.url),
  'utf8',
);
const appShellSource = readFileSync(
  new URL('../../../src/features/app/AppShell.jsx', import.meta.url),
  'utf8',
);
const timelineNodesSource = readFileSync(
  new URL('../../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
  'utf8',
);
const panelStyles = readFileSync(new URL('../../../styles/panels.css', import.meta.url), 'utf8');

const runningTask = (taskId, extra = {}) => ({ taskId, status: 'running', ...extra });

test('an unanswered ask_user request lights up its own conversation row', () => {
  const inputs = [{ request_id: 'req-1', conversation_id: 'conv-a', task_id: 'task-a' }];
  const tasks = [runningTask('task-a')];

  assert.deepEqual(
    resolveConversationRunState({ conversationId: 'conv-a', tasks, pendingInputs: inputs, pendingApprovals: [] }),
    { state: RUN_STATE_WAITING_INPUT, taskId: 'task-a' },
  );
  assert.deepEqual(
    resolveConversationRunState({ conversationId: 'conv-b', tasks, pendingInputs: inputs, pendingApprovals: [] }),
    { state: RUN_STATE_RUNNING, taskId: 'task-a' },
    'other rows stay quiet',
  );
});

test('a pending approval lights up as the approval state', () => {
  const approvals = [
    { request_id: 'req-tool', conversation_id: 'conv-a', task_id: 'task-a' },
    { request_id: 'req-flow', conversation_id: 'conv-b', task_id: 'task-b', approval_kind: 'workflow_human_approval' },
  ];

  assert.equal(
    resolveConversationWaitState({ conversationId: 'conv-b', pendingApprovals: approvals }).state,
    RUN_STATE_APPROVAL,
  );
  assert.equal(
    resolveConversationWaitState({ conversationId: 'conv-c', pendingApprovals: approvals }).state,
    RUN_STATE_IDLE,
  );
});

test('waiting for an answer outranks waiting for an approval', () => {
  const conversationId = 'conv-a';
  const task = runningTask('task-a');

  assert.equal(
    resolveConversationRunState({
      conversationId,
      tasks: [task],
      pendingInputs: [{ request_id: 'req-1', conversation_id: conversationId, task_id: 'task-a' }],
      pendingApprovals: [{ request_id: 'req-2', conversation_id: conversationId, task_id: 'task-a' }],
    }).state,
    RUN_STATE_WAITING_INPUT,
  );
});

test('answering the question flips the row straight back to the running lamp', () => {
  // 用户提交答案时后端立刻发 input_resolved，快照清空；任务拷贝里的 workflowRun.status
  // 还是轮询回来的 waiting_input 旧值——旧实现会一直亮黄灯，直到下一次轮询把它写回 running。
  const staleWorkflowCopy = [runningTask('task-a', { workflowRun: { status: 'waiting_input' } })];

  assert.deepEqual(
    resolveConversationRunState({
      conversationId: 'conv-a',
      tasks: staleWorkflowCopy,
      pendingInputs: [],
      pendingApprovals: [],
    }),
    { state: RUN_STATE_RUNNING, taskId: 'task-a' },
  );
});

test('the raw status snapshot alone decides the running lamp', () => {
  // 会话灯只看任务自身：running/queued 且没有终态标记 => 亮；workflowRun 快照不参与。
  assert.equal(isTaskLive(runningTask('task-a')), true);
  assert.equal(isTaskLive({ taskId: 'task-a', status: 'queued' }), true);
  assert.equal(isTaskLive({ taskId: 'task-a', status: 'done' }), false);
  assert.equal(isTaskLive({ taskId: 'task-a', status: 'running', completedAt: '2026-01-01' }), false);
  assert.equal(isTaskLive({ taskId: 'task-a', status: 'running', completed_at: '2026-01-01' }), false);
  assert.equal(isTaskLive({ taskId: 'task-a', status: 'running', serverFinished: true }), false);
});

test('a landed terminal state turns the lamp off even while the snapshot still lists the task', () => {
  const finished = { taskId: 'task-a', status: 'running', completedAt: '2026-01-01' };

  assert.deepEqual(
    resolveConversationRunState({
      conversationId: 'conv-a',
      tasks: [finished],
      pendingInputs: [{ request_id: 'req-1', conversation_id: 'conv-a', task_id: 'task-a' }],
      pendingApprovals: [],
    }),
    { state: RUN_STATE_IDLE, taskId: '' },
  );
});

test('a wait snapshot for a task the list has not loaded yet still counts as waiting', () => {
  assert.deepEqual(
    resolveConversationRunState({
      conversationId: 'conv-a',
      tasks: [],
      pendingInputs: [{ request_id: 'req-1', conversation_id: 'conv-a', task_id: 'unknown-task' }],
      pendingApprovals: [],
    }),
    { state: RUN_STATE_WAITING_INPUT, taskId: 'unknown-task' },
  );
});

test('a row without conversation id never lights up', () => {
  assert.deepEqual(
    resolveConversationRunState({
      conversationId: '',
      tasks: [runningTask('task-a')],
      pendingInputs: [{ request_id: 'req-1', conversation_id: '' }],
      pendingApprovals: [],
    }),
    { state: RUN_STATE_IDLE, taskId: '' },
  );
});

test('a conversation with only settled tasks is idle', () => {
  assert.deepEqual(
    resolveConversationRunState({
      conversationId: 'conv-a',
      tasks: [{ taskId: 'task-a', status: 'done', completedAt: 1 }, { taskId: 'task-b', status: 'cancelled', completedAt: 2 }],
    }),
    { state: RUN_STATE_IDLE, taskId: '' },
  );
});

test('any copy of a task that landed terminal settles the whole turn', () => {
  // 面板同时拿着本地运行时拷贝和服务端列表拷贝：过期的本地拷贝（还写着 running、没有
  // completedAt）不能让气泡一直转圈。
  const settled = settledTaskIds([
    { taskId: 'task-a', status: 'running' },
    { task_id: 'task-a', status: 'done', completed_at: '2026-01-01' },
    { taskId: 'task-b', status: 'running' },
  ]);

  assert.equal(settled.has('task-a'), true);
  assert.equal(settled.has('task-b'), false);
});

test('the lamp vocabulary is shared by both surfaces', () => {
  assert.equal(isRunStateLive(RUN_STATE_RUNNING), true);
  assert.equal(isRunStateLive(RUN_STATE_WAITING_INPUT), true);
  assert.equal(isRunStateLive(RUN_STATE_APPROVAL), true);
  assert.equal(isRunStateLive(RUN_STATE_IDLE), false);
  assert.equal(isRunStateLive(''), false);
});

test('the state hook reads the two live snapshots without extra requests', () => {
  assert.match(hookSource, /approvalStore\.subscribeInputs\(/);
  assert.match(hookSource, /approvalStore\.subscribe\(/);
  assert.match(hookSource, /return \(\) => \{\n\s+unsubscribeInputs\(\);\n\s+unsubscribeApprovals\(\);/);
  assert.doesNotMatch(hookSource, /fetch\(/, 'the indicator must not add network traffic');
  assert.match(hookSource, /resolveConversationRunState\(\{/);
});

test('the conversation row renders the three states from the single judge', () => {
  assert.match(nodeSource, /const runState = useConversationRunState\(\{/);
  assert.match(nodeSource, /const waitIndicator = WAIT_INDICATORS\[runState\.state\];/);
  assert.match(nodeSource, /\{WaitGlyph \? \(/);
  assert.match(nodeSource, /className=\{`conversation-running-indicator \$\{waitIndicator\.className\}`\}/);
  assert.match(nodeSource, /role="status" aria-label=\{waitIndicator\.label\}>/);
  // 原来的「在跑」蓝色转圈保持不动，只是退到第二优先。
  assert.match(
    nodeSource,
    /: runState\.state === RUN_STATE_RUNNING \? \(\n\s+<span className="conversation-running-indicator" role="status" aria-label="Task running">\n\s+<span className="ico ico-loading" aria-hidden="true" \/>/,
  );
  assert.doesNotMatch(nodeSource, /conversationHasRunningTask|useConversationActivity/);
  assert.doesNotMatch(modelSource, /workflowTaskDisplayStatus|conversationTaskWaitActivity/);
});

test('the row table speaks the run-state vocabulary the model exports', () => {
  assert.match(
    nodeSource,
    /import \{\n\s+RUN_STATE_APPROVAL,\n\s+RUN_STATE_RUNNING,\n\s+RUN_STATE_WAITING_INPUT,\n\} from '\.\.\/model\/conversation-run-state\.js';/,
  );
  assert.match(nodeSource, /\[RUN_STATE_WAITING_INPUT\]: \{\n\s+className: 'waiting-input',\n\s+label: 'Waiting for your answer',\n\s+Glyph: WaitingInputGlyph,/);
  assert.match(nodeSource, /\[RUN_STATE_APPROVAL\]: \{\n\s+className: 'awaiting-approval',\n\s+label: 'Awaiting approval',\n\s+Glyph: ApprovalGlyph,/);
  assert.doesNotMatch(nodeSource, /runState\.state === 'waiting_input'|runState\.state === 'approval'/);
});

test('the message panel reads the same judge for streaming and for the activity copy', () => {
  // 气泡还在转圈 = 这一轮还活着：任务自身在跑，且没有任何一份拷贝落地终态。
  assert.match(appShellSource, /const settled = settledTaskIds\(\[\.\.\.orderedTasks, \.\.\.\(currentConversation\?\.tasks \|\| \[\]\)\]\);/);
  assert.match(appShellSource, /const live = isTaskLive\(task\) && !settled\.has\(String\(task\.taskId \|\| task\.id \|\| ''\)\);/);
  assert.match(appShellSource, /const streaming = live;/);
  assert.match(appShellSource, /const currentConversationRunState = useConversationRunState\(\{/);
  assert.match(appShellSource, /const currentConversationActive = isRunStateLive\(currentConversationRunState\.state\);/);
  // 活动文案的「在等人」也来自同一份快照，不再看 ask_user 卡片在不在飞。
  assert.match(timelineNodesSource, /const waitState = useConversationWaitState\(conversationId\);/);
  assert.match(timelineNodesSource, /resolveAgentActivity\(safeItems, streaming, waitState\.state\)/);
});

test('both the row indicator and the task card share the same wait glyphs', () => {
  assert.match(iconsSource, /export function WaitingInputGlyph\(\)/);
  assert.match(iconsSource, /export function ApprovalGlyph\(\)/);
  assert.match(nodeSource, /import \{ ApprovalGlyph, ConversationAction, WaitingInputGlyph \} from '\.\/ConversationIcons\.jsx';/);
  assert.equal(
    (iconsSource.match(/<svg className="conversation-status-glyph"/g) || []).length,
    2,
    'the glyph markup must exist once per state, not duplicated in the row',
  );
  // 描边样式也只有一份：尺寸按场景覆盖（任务卡 17px / 会话行 15px）。
  const glyphRule = panelStyles.match(/\n\.conversation-status-glyph\s*\{([^}]*)\}/);
  assert.ok(glyphRule, 'the shared glyph class needs its stroke definition');
  assert.match(glyphRule[1], /stroke:\s*currentColor/);
  assert.match(glyphRule[1], /fill:\s*none/);
  assert.match(panelStyles, /\.conversation-task-status-icon \.conversation-status-glyph\s*\{[^}]*width:\s*17px/);
  assert.match(panelStyles, /\.conversation-running-indicator \.conversation-status-glyph\s*\{[^}]*width:\s*15px/);
});

test('the amber wait indicator still yields to pin/trash on hover', () => {
  const amber = panelStyles.match(/\.conversation-running-indicator\.waiting-input,\s*\n\.conversation-running-indicator\.awaiting-approval\s*\{([^}]*)\}/);
  assert.ok(amber, 'the amber indicator needs its own rule');
  assert.match(amber[1], /color:\s*#efbf64/, 'waiting uses the amber already used by task cards');
  // hover 让位：`.conversation-row:hover .conversation-running-indicator` (0,3,0) 必须压得住
  // 这个两条 class 的规则 (0,2,0)。
  const hover = panelStyles.match(/\.conversation-row:hover \.conversation-running-indicator,\s*\n\.conversation-row:not\(:focus\):focus-within \.conversation-running-indicator\s*\{([^}]*)\}/);
  assert.ok(hover, 'hover must keep hiding the indicator');
  assert.match(hover[1], /opacity:\s*0/);
});
