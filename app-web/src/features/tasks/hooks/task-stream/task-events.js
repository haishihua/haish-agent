// 只改“任务在这一步处于什么阶段”的事件：重试、上下文压缩、子智能体进度、待办。
// 它们不产生正文，也不碰工具卡片，统一把 stage 推到 in_progress。

export function handleLlmRetry(scope, _event) {
  const { taskId, loopIndex, updateTaskById, isTerminalTaskStatus } = scope;
  updateTaskById(taskId, (run) => ({
    ...run,
    status: isTerminalTaskStatus(run.status) ? run.status : 'running',
    stage: 'in_progress',
    loopIndex,
  }));
}

export function handleContextCompactionStarted(scope, _event) {
  const { taskId, loopIndex, updateTaskById } = scope;
  updateTaskById(taskId, (run) => ({
    ...run,
    status: 'running',
    stage: 'in_progress',
    loopIndex,
    providerState: run.providerState ? { ...run.providerState, state: 'compressing_context' } : run.providerState,
  }));
}

export function handleContextCompactionSettled(scope, _event) {
  const { taskId, loopIndex, updateTaskById } = scope;
  updateTaskById(taskId, (run) => ({
    ...run,
    status: 'running',
    stage: 'in_progress',
    loopIndex,
    providerState: run.providerState ? { ...run.providerState, state: 'ready' } : run.providerState,
  }));
}

export function handleSubAgentProgress(scope, _event) {
  const { taskId, loopIndex, updateTaskById } = scope;
  updateTaskById(taskId, (run) => ({
    ...run,
    stage: 'in_progress',
    loopIndex,
  }));
}

export function handleTodoUpdated(scope, _event) {
  const { taskId, loopIndex, updateTaskById } = scope;
  updateTaskById(taskId, (run) => ({ ...run, stage: 'in_progress', loopIndex }));
}
