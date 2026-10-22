import { appendStreamEvent, mergeAdjacentStreamEvent } from '../../chat/model/stream-events.js';
import { createRuntimeEventIngest } from '../../chat/model/event-identity.js';
import { runtimeEventToLog } from '../model/runtime-events.js';
import { contextUsageFromRuntimeEvent } from '../../chat/model/context-usage.js';
import { admitRuntimeEvent, dispatchRuntimeEvent } from './task-stream/event-dispatch.js';
import { createBackpressureRecovery } from './task-stream/recovery.js';
import { createQuestExecutor } from './task-stream/quest-execution.js';

// 后端在会话上持“一次只能跑一个任务”的占用锁，锁直到上一轮 stream 收尾
// 才释放。用户点“停止”后立刻编辑重发时，上一轮可能还在收尾（最长几秒）→ 409。
// 这里不把它当错误：保持“发送中”，用**同一个 request_id** 轮询重发（后端幂等 / 可 replay），
// 占用释放后自动发出，超时才算失败。
export const ACTIVE_TASK_CONFLICT_DETAIL = 'Conversation already has an active task.';
const ACTIVE_TASK_CONFLICT_MAX_WAITS = 20;
const ACTIVE_TASK_CONFLICT_WAIT_MS = 500;

const RUNTIME_EVENT_INGESTS = new WeakMap();

export function workflowNodeStartedState(event) {
  return {
    status: 'running',
    success: null,
    input: event.input ?? event.node_input ?? null,
    attempt: event.attempt ?? event.node_attempt ?? null,
    started_at: event.started_at || event.created_at,
  };
}

export function workflowNodeConfiguredState(event, currentNode = {}) {
  return { ...currentNode, runtime_config: { ...event.runtime_config } };
}

export function workflowNodeFinishedState(event, currentNode = {}, savedAttempts = [], toText = String) {
  const attempts = Array.isArray(savedAttempts) ? savedAttempts : [];
  const finishedAt = event.finished_at || event.created_at;
  const completed = {
    ...currentNode,
    status: event.status || (event.success === false ? 'failed' : 'done'),
    success: event.success !== false,
    summary: toText(
      event.summary
      ?? event.output
      ?? event.result
      ?? event.content
      ?? event.answer_text
      ?? event.answer
      ?? ''
    ).trim() || currentNode.summary || '',
    error: event.error || '',
    decision: event.decision || currentNode.decision || '',
    feedback: event.feedback ?? currentNode.feedback ?? '',
    attempt: event.attempt ?? currentNode.attempt ?? attempts.length + 1,
    started_at: event.started_at || currentNode.started_at,
    finished_at: finishedAt,
    duration_ms: event.duration_ms,
    runtime_config: event.runtime_config || currentNode.runtime_config,
  };
  const lastAttempt = attempts.at(-1);
  const duplicate = Boolean(
    finishedAt
    && lastAttempt?.finished_at === finishedAt
    && lastAttempt?.started_at === completed.started_at
  );
  return {
    node: completed,
    attempts: duplicate ? attempts : [...attempts, completed],
  };
}

export function createTaskStreamHandlers(ctx) {
  const {
    CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
    STREAM_EVENT_BATCH_MS,
    STREAM_IMMEDIATE_EVENT_TYPES,
    activeRuntimeTargetConvId,
    appendAnswerDelta,
    appendChatProgressText,
    applyConversationSnapshot,
    applyContextUsage,
    applyTerminalTaskState,
    batchRuntimeMutations,
    buildTaskRuntimeRecord,
    chatFinalizedTaskIdsRef,
    conversationId,
    ensureTaskForEvent,
    eventDeltaText,
    fetchTaskRuntimeDetail,
    generateHexId,
    getChatProgressLine,
    getRuntime,
    getTaskById,
    getToolResponseTraceStatus,
    isTerminalTaskStatus,
    mergeChatImageRefs,
    mutateRuntime,
    normalizeChatImageRefs,
    normalizeTaskStatus,
    normalizeRuntimeEvent,
    removeConversationTaskFromWorkspace,
    recoverConversationTasks,
    runTaskStream = (command, onEvent) => window.haish.runTaskStream(command, onEvent),
    resolveProviderMeta,
    restoreLatestTaskRuntime,
    setComposerAttachment,
    setRuntimeActiveTaskId,
    setRuntimeBusy,
    setRuntimeFetchController,
    setUploadState,
    showToast,
    streamTargetConvIdRef,
    stripChatImageAugmentation,
    toDisplayText,
    updateTaskById,
    updateTaskRuntimeState,
    uploadAttachment,
    upsertToolCall,
    userCancelledTaskIdsRef,
  } = ctx;

  // 测试 / 特殊宿主可以缩小等特窗口；默认 20 × 500ms = 10s。
  const activeTaskConflictMaxWaits = Number.isFinite(ctx?.activeTaskConflictRetry?.maxWaits)
    ? ctx.activeTaskConflictRetry.maxWaits
    : ACTIVE_TASK_CONFLICT_MAX_WAITS;
  const activeTaskConflictWaitMs = Number.isFinite(ctx?.activeTaskConflictRetry?.waitMs)
    ? ctx.activeTaskConflictRetry.waitMs
    : ACTIVE_TASK_CONFLICT_WAIT_MS;

  const isChatOriginTask = (taskId, targetConvId = null) => (
    getTaskById(taskId, targetConvId)?.originViewMode === 'chat'
  );

  const acceptRuntimeEvent = (event, ownerConvId) => {
    const runtime = getRuntime(ownerConvId, { create: true });
    let tasks = RUNTIME_EVENT_INGESTS.get(runtime);
    if (!tasks) {
      tasks = new Map();
      RUNTIME_EVENT_INGESTS.set(runtime, tasks);
    }
    const taskId = event.task_id || runtime.activeRunId;
    const eventLog = getTaskById(taskId, ownerConvId)?.eventLog;
    let ingest = tasks.get(taskId);
    if (!ingest) {
      ingest = { accept: createRuntimeEventIngest(eventLog), eventLog };
      tasks.set(taskId, ingest);
    } else if (ingest.eventLog !== eventLog) {
      // A history restore can replace the log while the consumer is alive.
      // Seed that snapshot once; our own appends keep this pointer current.
      for (const previous of eventLog || []) ingest.accept(previous);
      ingest.eventLog = eventLog;
    }
    return ingest.accept(event);
  };

  const appendTaskEvent = (taskId, event, ownerConvId) => {
    updateTaskById(taskId, (task) => {
      const runtimeEvent = runtimeEventToLog(event);
      const eventLog = appendStreamEvent(task.eventLog, {
        ...runtimeEvent,
        workflowNodeId: runtimeEvent.workflowNodeId
          || task.workflowRun?.current_node_id
          || null,
      });
      const ingest = RUNTIME_EVENT_INGESTS.get(getRuntime(ownerConvId))?.get(taskId);
      if (ingest) ingest.eventLog = eventLog;
      return {
        ...task,
        loopIndex: Math.max(task.loopIndex || 0, event.loop_index || 0),
        eventLog,
      };
    }, ownerConvId);
  };

  const coalesceStreamEvent = (previous, event) => (
    mergeQueuedStreamDelta(previous, event, eventDeltaText)
  );

  // 每条事件都要用、且与事件无关的依赖：只建一次，事件进来时再拼上 per-event 值。
  const eventHandlerDependencies = {
    updateTaskRuntimeState,
    chatFinalizedTaskIdsRef,
    userCancelledTaskIdsRef,
    appendAnswerDelta,
    eventDeltaText,
    isTerminalTaskStatus,
    toDisplayText,
    isChatOriginTask,
    upsertToolCall,
    getToolResponseTraceStatus,
    resolveProviderMeta,
    workflowNodeStartedState,
    workflowNodeConfiguredState,
    workflowNodeFinishedState,
    normalizeTaskStatus,
    mutateRuntime,
    normalizeChatImageRefs,
    applyTerminalTaskState,
    stripChatImageAugmentation,
    mergeChatImageRefs,
    setRuntimeBusy,
    setRuntimeActiveTaskId,
    setRuntimeFetchController,
  };

  function applyRuntimeEvent(event, targetConvId = null) {
    const eventConversationId = event.conversation_id || null;
    const ownerConvId = activeRuntimeTargetConvId(targetConvId);
    // Every event mutation/answer buffer belongs to its explicit conversation,
    // including unattended scheduled streams while another conversation is open.
    const scopedUpdateTaskById = (id, updater) => updateTaskById(id, updater, ownerConvId);
    const scopedGetTaskById = (id) => getTaskById(id, ownerConvId);
    const readRuntimeAnswerBuffer = () => ctx.readRuntimeAnswerBuffer(ownerConvId);
    const setRuntimeAnswerBuffer = (value) => ctx.setRuntimeAnswerBuffer(value, ownerConvId);
    const taskId = admitRuntimeEvent(event, {
      eventConversationId,
      ownerConvId,
      getOwnerRuntime: () => (ownerConvId ? getRuntime(ownerConvId) : null),
      ensureTaskForEvent,
      userCancelledTaskIdsRef,
      chatFinalizedTaskIdsRef,
      chatFinalFollowUpEventTypes: CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
      updateTaskRuntimeState,
    });
    if (!taskId) return;
    appendTaskEvent(taskId, event, ownerConvId);
    const nextContextUsage = contextUsageFromRuntimeEvent(event, ownerConvId || conversationId);
    if (nextContextUsage) {
      // 走表盘唯一写入入口：当前会话改表盘 + 落盘，后台会话只落盘。哪个会话算
      // “当前”由表盘自己判断（它手上就是最新的 conversationIdRef），这里不重复判一次。
      applyContextUsage(nextContextUsage, { ownerConversationId: ownerConvId || conversationId });
    }
    const loopIndex = Math.max(1, event.loop_index || 1);
    if (isChatOriginTask(taskId, ownerConvId)) {
      const progressLine = getChatProgressLine(event);
      if (progressLine) {
        scopedUpdateTaskById(taskId, (run) => ({
          ...run,
          chatStreamText: appendChatProgressText(run.chatStreamText, progressLine),
        }));
      }
    }
    dispatchRuntimeEvent(event, {
      ...eventHandlerDependencies,
      taskId,
      ownerConvId,
      loopIndex,
      updateTaskById: scopedUpdateTaskById,
      getTaskById: scopedGetTaskById,
      readRuntimeAnswerBuffer,
      setRuntimeAnswerBuffer,
    });
  }

  const resyncTaskRuntimeAfterBackpressure = createBackpressureRecovery({
    getRuntime,
    getTaskById,
    restoreLatestTaskRuntime,
    fetchTaskRuntimeDetail,
    batchRuntimeMutations,
    acceptRuntimeEvent,
    applyRuntimeEvent,
  });

  const executeQuest = createQuestExecutor({
    ctx,
    getRuntime,
    mutateRuntime,
    updateTaskById,
    updateTaskRuntimeState,
    generateHexId,
    chatFinalizedTaskIdsRef,
    userCancelledTaskIdsRef,
    setRuntimeActiveTaskId,
    setRuntimeBusy,
    setRuntimeFetchController,
    setUploadState,
    setComposerAttachment,
    removeConversationTaskFromWorkspace,
    uploadAttachment,
    applyConversationSnapshot,
    showToast,
    buildTaskRuntimeRecord,
    applyTerminalTaskState,
    isTerminalTaskStatus,
    runTaskStream,
    activeTaskConflictDetail: ACTIVE_TASK_CONFLICT_DETAIL,
    activeTaskConflictMaxWaits,
    activeTaskConflictWaitMs,
    streamEventBatchMs: STREAM_EVENT_BATCH_MS,
    streamImmediateEventTypes: STREAM_IMMEDIATE_EVENT_TYPES,
    coalesceStreamEvent,
    batchRuntimeMutations,
    streamTargetConvIdRef,
    applyRuntimeEvent,
    acceptRuntimeEvent,
    normalizeRuntimeEvent,
    recoverConversationTasks,
    resyncTaskRuntimeAfterBackpressure,
  });

  return {
    applyScheduledEvent: (message) => {
      const cid = message.conversation_id;
      if (!cid || !message.schedule_id) throw new Error('Scheduled event requires an owner.');
      if (message.type !== 'task.event') return;
      const event = normalizeRuntimeEvent(message.event);
      if (!event || (event.conversation_id && event.conversation_id !== cid)) return;
      if (!acceptRuntimeEvent(event, cid)) return;
      batchRuntimeMutations(cid, () => {
        if (event.type === 'run_started') {
          mutateRuntime(cid, (runtime) => {
            runtime.runGeneration = (runtime.runGeneration || 0) + 1;
            runtime.abortRequested = false;
            runtime.answerBuffer = '';
            runtime.activeRunId = `schedule:${message.run_id}`;
          });
          setRuntimeBusy(true, cid);
        }
        applyRuntimeEvent({ ...event, conversation_id: cid }, cid);
      });
    },
    executeQuest,
    executeWorkflowNodeRerun: (task, nodeId, runConfig) => {
      return executeQuest(
        { ...task, id: task?.taskId || task?.id },
        task?.conversationId || task?.conversation_id,
        { rerunNodeId: nodeId, runConfig },
      );
    },
  };
}

export function mergeQueuedStreamDelta(previous, event, eventDeltaTextFn) {
  return mergeAdjacentStreamEvent(previous, event, eventDeltaTextFn);
}
