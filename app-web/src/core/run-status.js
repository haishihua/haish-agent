// 一次 run（任务/quest）的状态词表与存活判据。唯一一份。
//
// 这一层比 features 低：chat / conversations / tasks / workflow / approvals 都读它，
// 它不读任何 feature。状态字符串的别名归一、落地终态、存活判据、展示态都只在这里定义，
// 别处再抄一份就会出现「卡片写着 PENDING、侧栏却按已收工排序」。

/** 原始状态串的「落地终态」清单（大小写不敏感）。 */
const TERMINAL_STATUSES = new Set([
  'done',
  'completed',
  'success',
  'failed',
  'error',
  'cancelled',
  'canceled',
  'aborted',
]);

/** 这个状态串是不是「已经收工」（大小写不敏感，容错空值）。 */
export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(String(status || '').toLowerCase());
}

/**
 * 状态别名归一到规范词：done / failed / cancelled，其余原样（空值按 queued）。
 *
 * 流式事件、分页、卡片文案都读这一份，别处不准再列一份别名表。
 */
export function normalizeTaskStatus(status) {
  if (status === 'aborted' || status === 'canceled') return 'cancelled';
  if (status === 'completed' || status === 'success') return 'done';
  if (status === 'error') return 'failed';
  return status || 'queued';
}

/** normalize 之后更窄的终态判据（流式事件、分页用）。 */
export function isTerminalTaskStatus(status) {
  const normalized = normalizeTaskStatus(status);
  return normalized === 'done' || normalized === 'failed' || normalized === 'cancelled';
}

/** 任务展示态：任务自身状态优先，未收工时再看 workflowRun 的等待态。 */
export function workflowTaskDisplayStatus(task) {
  const taskStatus = String(task?.status || '').toLowerCase();
  if (isTerminalStatus(taskStatus)) return taskStatus;
  const workflowStatus = String(task?.workflowRun?.status || '').toLowerCase();
  if (workflowStatus === 'waiting_approval' || workflowStatus === 'approval') return 'approval';
  if (workflowStatus === 'waiting_input') return 'waiting_input';
  if (isTerminalStatus(workflowStatus)) return workflowStatus;
  return taskStatus;
}

/** 已落地的完成标记：比 status 更可信，凡是「还在跑 / 还在等」的判断都要先过这一关。 */
function taskHasFinishedMarker(task) {
  return Boolean(task?.completedAt || task?.completed_at || task?.serverFinished === true);
}

/**
 * 这份任务拷贝自己算不算「已经收工」：落地标记或终态状态串。
 *
 * 面板判「这一轮收工了没」、分页判「这份拷贝停在半路」、侧边栏判排序锚点，全都用它。
 */
export function isTaskSettled(task) {
  return taskHasFinishedMarker(task) || isTerminalStatus(task?.status);
}

/**
 * 任务级唯一判据：这个任务现在还活着吗（在跑 / 在排队）。
 *
 * 会话状态灯、面板的 streaming、轮询开关全部只认这一个函数——它只看两件事：
 * 原始 status 是否 running/queued，以及有没有落地终态标记。解析出来的
 * answerText / 进行中的工具卡 / workflowRun 快照都不参与。
 */
export function isTaskLive(task) {
  const status = String(task?.status || '').toLowerCase();
  if (status !== 'running' && status !== 'queued') return false;
  return !taskHasFinishedMarker(task);
}

/** 通知用的终态归类：done / failed / cancelled，非终态返回空串。 */
export function terminalNoticeStatus(status) {
  const value = normalizeTaskStatus(String(status || '').toLowerCase());
  return isTerminalStatus(value) ? value : '';
}

// 会话当前处于哪一步；只描述「现在」，终态由 TERMINAL_STATUSES 表达。
export const RUN_STATE_IDLE = 'idle';
export const RUN_STATE_RUNNING = 'running';
export const RUN_STATE_WAITING_INPUT = 'waiting_input';
export const RUN_STATE_APPROVAL = 'approval';
