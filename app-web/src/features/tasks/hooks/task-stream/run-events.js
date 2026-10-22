// 一轮运行的起止：run_started 建立运行态，run_finished 用服务端落盘结果收尾
// （终态正文、图片、附件都以服务端为准）。Stop 相关的判定不在这里，见 event-dispatch。
import { stripInjectedSkillInstruction } from '../../../chat/model/chat-text.js';
import { usableWorkflowSnapshot } from '../../../workflow/model/workflow-snapshot.js';

export function handleRunStarted(scope, _event) {
  const { taskId, ownerConvId, updateTaskRuntimeState, chatFinalizedTaskIdsRef, updateTaskById } = scope;
  updateTaskRuntimeState((state) => ({ ...state, latestTaskId: taskId }), ownerConvId);
  chatFinalizedTaskIdsRef.current.delete(taskId);
  updateTaskById(taskId, (run) => ({
    ...run,
    status: 'running',
    stage: 'in_progress',
    loopIndex: 0,
  }));
}

export function handleRunFinished(scope, event) {
  const {
    taskId,
    ownerConvId,
    updateTaskById,
    updateTaskRuntimeState,
    chatFinalizedTaskIdsRef,
    userCancelledTaskIdsRef,
    mutateRuntime,
    normalizeTaskStatus,
    normalizeChatImageRefs,
    applyTerminalTaskState,
    isTerminalTaskStatus,
    stripChatImageAugmentation,
    mergeChatImageRefs,
    toDisplayText,
    setRuntimeBusy,
    setRuntimeActiveTaskId,
    setRuntimeFetchController,
  } = scope;
  const persistedTask = event.task || null;
  const terminalStatus = normalizeTaskStatus(persistedTask?.status || event.status);
  mutateRuntime(ownerConvId, (runtime) => {
    runtime.activeRunId = null;
  });
  if (terminalStatus === 'cancelled') {
    chatFinalizedTaskIdsRef.current.add(taskId);
    userCancelledTaskIdsRef.current.add(taskId);
  }
  updateTaskById(taskId, (run) => {
    const persistedImages = normalizeChatImageRefs(
      persistedTask?.image_attachments || persistedTask?.imageAttachments || [],
      persistedTask?.conversation_id || event.conversation_id || run.conversationId,
    );
    const persistedAnswerImages = normalizeChatImageRefs(
      persistedTask?.answer_images || persistedTask?.answerImages || [],
      persistedTask?.conversation_id || event.conversation_id || run.conversationId,
    );
    const resolvedStatus = normalizeTaskStatus(
      persistedTask?.status
      || event.status
      || run.status
    );
    const terminalError = persistedTask?.error || event.error || run.error;
    const terminalBase = isTerminalTaskStatus(resolvedStatus) && resolvedStatus !== 'done'
      ? applyTerminalTaskState(run, resolvedStatus, {
          error: terminalError,
          aborted: resolvedStatus === 'cancelled' ? true : run.aborted,
        })
      : run;
    return {
      ...terminalBase,
      taskId: persistedTask?.task_id || run.taskId,
      conversationId: persistedTask?.conversation_id || event.conversation_id || run.conversationId,
      // Keep the local display title. The persisted title contains the
      // transport-only skill instruction sent to the model.
      title: run.title
        || stripChatImageAugmentation(stripInjectedSkillInstruction(persistedTask?.title)).text
        || 'Task',
      status: resolvedStatus,
      stage: 'done',
      requestedAgentId: persistedTask?.agent_id || persistedTask?.profile_id || run.requestedAgentId || null,
      requestedWorkflowId: persistedTask?.workflow_id || run.requestedWorkflowId || null,
      executionMode: persistedTask?.execution_mode === 'bot' ? 'bot' : (run.executionMode || 'chat'),
      originViewMode: persistedTask?.execution_mode === 'bot' ? 'workflow' : (run.originViewMode || 'chat'),
      workflowSnapshot: usableWorkflowSnapshot(
        persistedTask?.workflow_snapshot,
        run.workflowSnapshot || null,
      ),
      sourceTaskId: persistedTask?.source_task_id || run.sourceTaskId || null,
      userMessageId: persistedTask?.user_message_id || run.userMessageId || null,
      annotations: persistedTask?.annotations ?? run.annotations ?? [],
      displayText: persistedTask?.display_text ?? run.displayText ?? null,
      assistantMessageId: persistedTask?.assistant_message_id || null,
      sourceRunId: persistedTask?.source_run_id || run.sourceRunId || null,
      rerunFromNodeId: persistedTask?.rerun_from_node_id || run.rerunFromNodeId || null,
      profileId: persistedTask?.profile_id || run.profileId || null,
      profileDisplayName: persistedTask?.profile_display_name || run.profileDisplayName || '',
      completedAt: persistedTask?.completed_at
        ? (Date.parse(persistedTask.completed_at) || Date.now())
        : Date.now(),
      attachment: Array.isArray(persistedTask?.attachments) && persistedTask.attachments.length
        ? { ...persistedTask.attachments[0], uploaded: true }
        : run.attachment,
      attachments: Array.isArray(persistedTask?.attachments)
        ? persistedTask.attachments.map((attachment) => ({ ...attachment, uploaded: true }))
        : run.attachments,
      imageAttachments: persistedImages.length > 0
        ? mergeChatImageRefs(run.imageAttachments || [], persistedImages)
        : run.imageAttachments,
      answerImages: persistedAnswerImages.length > 0
        ? persistedAnswerImages
        : (run.answerImages || []),
      // 终态是服务端落盘后的权威答案：图片固化会改写路径，不能因为
      // final_answer 已经先到就继续保留旧文本；没有终态正文时才回退到
      // 流式缓冲。
      answerText: persistedTask?.answer_text
        || (resolvedStatus === 'done' && event.message != null ? toDisplayText(event.message) : '')
        || run.answerText,
      error: terminalError,
      serverFinished: true,
    };
  });
  chatFinalizedTaskIdsRef.current.add(taskId);
  updateTaskRuntimeState((state) => ({ ...state, activeTaskId: null }), ownerConvId);
  setRuntimeBusy(false, ownerConvId);
  setRuntimeActiveTaskId(null, ownerConvId);
  setRuntimeFetchController(null, ownerConvId);
}
