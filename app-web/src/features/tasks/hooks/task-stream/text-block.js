// 文本块 / 思考块的开启 - 追加 - 关闭：只管“模型在说什么”，不碰工具与工作流。
// 纯函数：状态全部经 scope 传入，这里不持有任何模块级状态。

function thinkingState(run, loopIndex) {
  return {
    ...run,
    stage: 'in_progress',
    loopIndex,
    providerState: run.providerState ? { ...run.providerState, state: 'thinking' } : run.providerState,
  };
}

export function handleThinkingStarted(scope, _event) {
  const { taskId, loopIndex, updateTaskById } = scope;
  updateTaskById(taskId, (run) => thinkingState(run, loopIndex));
}

export function handleThinkingCompleted(scope, _event) {
  const { taskId, updateTaskById } = scope;
  updateTaskById(taskId, (run) => ({
    ...run,
    providerState: run.providerState ? { ...run.providerState, state: 'ready' } : run.providerState,
  }));
}

export function handleAnswerDelta(scope, event) {
  const {
    taskId,
    loopIndex,
    updateTaskById,
    getTaskById,
    chatFinalizedTaskIdsRef,
    setRuntimeAnswerBuffer,
    readRuntimeAnswerBuffer,
    appendAnswerDelta,
    eventDeltaText,
    isTerminalTaskStatus,
  } = scope;
  if (chatFinalizedTaskIdsRef.current.has(taskId) || getTaskById(taskId)?.serverFinished) return;
  setRuntimeAnswerBuffer(appendAnswerDelta(
    readRuntimeAnswerBuffer(),
    eventDeltaText(event)
  ));
  updateTaskById(taskId, (run) => ({
    ...run,
    status: isTerminalTaskStatus(run.status) ? run.status : 'running',
    stage: 'in_progress',
    answerText: readRuntimeAnswerBuffer(),
    chatStreamText: run.chatStreamText,
    loopIndex,
  }));
}

export function handleFinalAnswer(scope, event) {
  const {
    taskId,
    ownerConvId,
    loopIndex,
    updateTaskById,
    readRuntimeAnswerBuffer,
    setRuntimeAnswerBuffer,
    isChatOriginTask,
    chatFinalizedTaskIdsRef,
    isTerminalTaskStatus,
    toDisplayText,
  } = scope;
  const finalAnswerText = toDisplayText(
    event.content
    ?? event.answer_text
    ?? event.answer
    ?? event.final_answer
    ?? event.text
    ?? event.message
    ?? readRuntimeAnswerBuffer()
  );
  setRuntimeAnswerBuffer(finalAnswerText || readRuntimeAnswerBuffer());
  if (isChatOriginTask(taskId, ownerConvId)) {
    chatFinalizedTaskIdsRef.current.add(taskId);
    updateTaskById(taskId, (run) => ({
      ...run,
      stage: isTerminalTaskStatus(run.status) ? run.stage : 'check',
      loopIndex,
      answerText: readRuntimeAnswerBuffer(),
      providerState: run.providerState ? { ...run.providerState, state: 'completed' } : run.providerState,
    }));
    return;
  }
  updateTaskById(taskId, (run) => ({
    ...run,
    stage: 'check',
    loopIndex,
    answerText: readRuntimeAnswerBuffer(),
    providerState: run.providerState ? { ...run.providerState, state: 'completed' } : run.providerState,
  }));
}
