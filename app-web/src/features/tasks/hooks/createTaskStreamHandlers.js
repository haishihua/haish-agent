import { appendStreamEvent, mergeAdjacentStreamEvent } from '../../chat/model/stream-events.js';
import { createRuntimeEventIngest } from '../../chat/model/event-identity.js';
import { executionConfigError } from '../../workflow/model/execution-config.js';
import { normalizeReasoningEffort } from '../../chat/model/run-catalog.js';
import { nodeRuntimeConfigsForWorkflow, nodeRuntimeConfigRequest } from '../../workflow/model/node-runtime-config.js';
import { usableWorkflowSnapshot } from '../../workflow/model/workflow-snapshot.js';
import { stripInjectedSkillInstruction } from '../../chat/model/chat-text.js';
import { runtimeEventToLog } from '../model/runtime-events.js';
import { contextUsageFromRuntimeEvent } from '../../chat/model/context-usage.js';
import { waitForAttemptConfigOperation } from '../../conversations/model/attempt-run-config.js';

// 后端在会话上持“一次只能跑一个任务”的占用锁，锁直到上一轮 stream 收尾
// 才释放。用户点“停止”后立刻编辑重发时，上一轮可能还在收尾（最长几秒）→ 409。
// 这里不把它当错误：保持“发送中”，用**同一个 request_id** 轮询重发（后端幂等 / 可 replay），
// 占用释放后自动发出，超时才算失败。
export const ACTIVE_TASK_CONFLICT_DETAIL = 'Conversation already has an active task.';
const ACTIVE_TASK_CONFLICT_MAX_WAITS = 20;
const ACTIVE_TASK_CONFLICT_WAIT_MS = 500;

const realtimeRequestId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

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

  function applyRuntimeEvent(event, targetConvId = null) {
    const eventConversationId = event.conversation_id || null;
    const ownerConvId = activeRuntimeTargetConvId(targetConvId);
    // Every event mutation/answer buffer belongs to its explicit conversation,
    // including unattended scheduled streams while another conversation is open.
    const updateTaskById = (id, updater) => ctx.updateTaskById(id, updater, ownerConvId);
    const getTaskById = (id) => ctx.getTaskById(id, ownerConvId);
    const readRuntimeAnswerBuffer = () => ctx.readRuntimeAnswerBuffer(ownerConvId);
    const setRuntimeAnswerBuffer = (value) => ctx.setRuntimeAnswerBuffer(value, ownerConvId);
    if (eventConversationId && ownerConvId && eventConversationId !== ownerConvId) {
      return;
    }
    const ownerRuntime = ownerConvId ? getRuntime(ownerConvId) : null;
    // Stop-before-visualization: drop every late event for the aborted run,
    // including run_finished, which would otherwise rehydrate empty shells.
    if (ownerRuntime?.abortRequested) {
      if (event.task_id) {
        userCancelledTaskIdsRef.current.add(event.task_id);
        chatFinalizedTaskIdsRef.current.add(event.task_id);
      }
      return;
    }
    if (event.task_id && userCancelledTaskIdsRef.current.has(event.task_id)) {
      chatFinalizedTaskIdsRef.current.add(event.task_id);
      return;
    }
    const taskId = ensureTaskForEvent(event, ownerConvId);
    if (!taskId) return;
    if (userCancelledTaskIdsRef.current.has(taskId)) {
      chatFinalizedTaskIdsRef.current.add(taskId);
      return;
    }
    if (
      chatFinalizedTaskIdsRef.current.has(taskId)
      && !CHAT_FINAL_FOLLOWUP_EVENT_TYPES.has(event.type)
    ) {
      updateTaskRuntimeState((state) => (
        state.activeTaskId === taskId ? { ...state, activeTaskId: null } : state
      ), ownerConvId);
      return;
    }
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
        updateTaskById(taskId, (run) => ({
          ...run,
          chatStreamText: appendChatProgressText(run.chatStreamText, progressLine),
        }));
      }
    }

    switch (event.type) {
      case 'workflow_started':
        updateTaskById(taskId, (run) => ({
          ...run,
          workflowRun: {
            workflow_id: event.workflow_id || run.requestedWorkflowId,
            run_id: event.workflow_run_id || '',
            status: 'running',
            current_node_id: null,
            nodes: {},
            input: event.input ?? null,
          },
        }));
        break;
      case 'workflow_resumed':
        updateTaskById(taskId, (run) => {
          const nodes = { ...(run.workflowRun?.nodes || {}) };
          for (const nodeId of event.invalidated_node_ids || []) delete nodes[nodeId];
          return {
            ...run,
            workflowRun: {
              ...(run.workflowRun || {}),
              workflow_id: event.workflow_id || run.requestedWorkflowId,
              run_id: event.workflow_run_id || run.workflowRun?.run_id || '',
              status: 'running',
              current_node_id: event.start_node_id || event.workflow_node_id || null,
              nodes,
            },
          };
        });
        break;
      case 'workflow_node_started':
        updateTaskById(taskId, (run) => ({
          ...run,
          workflowRun: {
            ...(run.workflowRun || {}),
            status: 'running',
            current_node_id: event.workflow_node_id,
            nodes: {
              ...(run.workflowRun?.nodes || {}),
              // A node snapshot represents one attempt. Never carry terminal
              // fields such as decision/error/summary into the next attempt.
              [event.workflow_node_id]: workflowNodeStartedState(event),
            },
          },
        }));
        break;
      case 'workflow_node_configured':
        updateTaskById(taskId, (run) => ({
          ...run,
          workflowRun: {
            ...(run.workflowRun || {}),
            nodes: {
              ...(run.workflowRun?.nodes || {}),
              [event.workflow_node_id]: workflowNodeConfiguredState(event, run.workflowRun?.nodes?.[event.workflow_node_id]),
            },
          },
        }));
        break;
      case 'workflow_run_waiting':
        updateTaskById(taskId, (run) => {
          const nodeId = event.workflow_node_id || event.node_id || run.workflowRun?.current_node_id;
          const waitStatus = event.status === 'waiting_approval' ? 'approval' : 'waiting_input';
          return {
            ...run,
            workflowRun: {
              ...(run.workflowRun || {}),
              status: event.status || 'waiting_input',
              current_node_id: nodeId || null,
              nodes: nodeId ? {
                ...(run.workflowRun?.nodes || {}),
                [nodeId]: {
                  ...(run.workflowRun?.nodes?.[nodeId] || {}),
                  status: waitStatus,
                },
              } : (run.workflowRun?.nodes || {}),
            },
          };
        });
        break;
      case 'workflow_run_resumed':
        updateTaskById(taskId, (run) => {
          const nodeId = run.workflowRun?.current_node_id;
          return {
            ...run,
            workflowRun: {
              ...(run.workflowRun || {}),
              status: 'running',
              nodes: nodeId ? {
                ...(run.workflowRun?.nodes || {}),
                [nodeId]: {
                  ...(run.workflowRun?.nodes?.[nodeId] || {}),
                  status: 'running',
                },
              } : (run.workflowRun?.nodes || {}),
            },
          };
        });
        break;
      case 'workflow_node_finished':
        updateTaskById(taskId, (run) => {
          const nodeId = event.workflow_node_id;
          if (!nodeId) return run;
          const completed = workflowNodeFinishedState(
            event,
            run.workflowRun?.nodes?.[nodeId],
            run.workflowRun?.node_attempts?.[nodeId],
            toDisplayText,
          );
          return {
            ...run,
            workflowRun: {
              ...(run.workflowRun || {}),
              current_node_id: nodeId,
              nodes: {
                ...(run.workflowRun?.nodes || {}),
                [nodeId]: completed.node,
              },
              node_attempts: {
                ...(run.workflowRun?.node_attempts || {}),
                [nodeId]: completed.attempts,
              },
            },
          };
        });
        break;
      case 'workflow_finished':
      case 'workflow_failed':
        updateTaskById(taskId, (run) => ({
          ...run,
          workflowRun: {
            ...(run.workflowRun || {}),
            status: event.type === 'workflow_failed' ? 'failed' : 'done',
            current_node_id: null,
          },
        }));
        break;
      case 'run_started':
        updateTaskRuntimeState((state) => ({ ...state, latestTaskId: taskId }), ownerConvId);
        chatFinalizedTaskIdsRef.current.delete(taskId);
        updateTaskById(taskId, (run) => ({
          ...run,
          status: 'running',
          stage: 'in_progress',
          loopIndex: 0,
        }));
        break;
      case 'provider_selected': {
        const providerMeta = resolveProviderMeta(event, getTaskById(taskId));
        updateTaskById(taskId, (run) => ({
          ...run,
          ...(event.node_runtime_configs ? { nodeRuntimeConfigs: event.node_runtime_configs } : {}),
          provider: providerMeta.label,
          providerKey: providerMeta.key,
          requestedProvider: providerMeta.key,
          providerState: {
            provider: providerMeta.label,
            state: 'selected',
            selected: true,
            reason: event.reason || '',
            model: event.model || null,
          },
        }));
        break;
      }
      case 'context_compaction_started': {
        updateTaskById(taskId, (run) => ({
          ...run,
          status: 'running',
          stage: 'in_progress',
          loopIndex,
          providerState: run.providerState ? { ...run.providerState, state: 'compressing_context' } : run.providerState,
        }));
        break;
      }
      case 'context_compaction_completed': {
        updateTaskById(taskId, (run) => ({
          ...run,
          status: 'running',
          stage: 'in_progress',
          loopIndex,
          providerState: run.providerState ? { ...run.providerState, state: 'ready' } : run.providerState,
        }));
        break;
      }
      case 'context_compaction_failed': {
        updateTaskById(taskId, (run) => ({
          ...run,
          status: 'running',
          stage: 'in_progress',
          loopIndex,
          providerState: run.providerState ? { ...run.providerState, state: 'ready' } : run.providerState,
        }));
        break;
      }
      case 'llm_thinking_started': {
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'in_progress',
          loopIndex,
          providerState: run.providerState ? { ...run.providerState, state: 'thinking' } : run.providerState,
        }));
        break;
      }
      case 'llm_thinking_delta': {
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'in_progress',
          loopIndex,
          providerState: run.providerState ? { ...run.providerState, state: 'thinking' } : run.providerState,
        }));
        break;
      }
      case 'agent_progress_delta': {
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'in_progress',
          loopIndex,
          providerState: run.providerState ? { ...run.providerState, state: 'thinking' } : run.providerState,
        }));
        break;
      }
      case 'llm_thinking_completed': {
        updateTaskById(taskId, (run) => ({
          ...run,
          providerState: run.providerState ? { ...run.providerState, state: 'ready' } : run.providerState,
        }));
        break;
      }
      case 'tool_call_started': {
        updateTaskById(taskId, (run) => {
          const waitingForInput = String(event.tool_name || '').toLowerCase() === 'ask_user';
          const nodeId = event.workflow_node_id || run.workflowRun?.current_node_id;
          return {
            ...run,
            stage: 'in_progress',
            loopIndex,
            toolCalls: upsertToolCall(run.toolCalls, event.call_id, {
              callId: event.call_id,
              parentCallId: event.parent_call_id || '',
              loopIndex,
            toolGroup: event.tool_group || 'external',
            kind: event.kind || 'tool',
            toolName: event.tool_name || 'unknown',
              skillName: event.skill_name || '',
              skillPath: event.skill_path || '',
            state: 'requested',
            inputSummary: event.input_summary || '',
            toolInput: event.tool_input || null,
            toolResponse: event.tool_response || null,
            toolOutput: event.tool_output || '',
            message: event.message || '',
            }),
            workflowRun: waitingForInput ? {
              ...(run.workflowRun || {}),
              status: 'waiting_input',
              current_node_id: nodeId || null,
              nodes: nodeId ? {
                ...(run.workflowRun?.nodes || {}),
                [nodeId]: {
                  ...(run.workflowRun?.nodes?.[nodeId] || {}),
                  status: 'waiting_input',
                },
              } : (run.workflowRun?.nodes || {}),
            } : run.workflowRun,
          };
        });
        break;
      }
      case 'tool_call_completed':
        updateTaskById(taskId, (run) => {
          const existingToolCall = Array.isArray(run.toolCalls)
            ? run.toolCalls.find((item) => item.callId === event.call_id)
            : null;
          let nextState = 'completed';
          const responseState = getToolResponseTraceStatus(event.tool_response, '');
          if (responseState === 'failed') {
            nextState = 'failed';
          } else if (responseState === 'done') {
            nextState = 'completed';
          }
          const askUserResolved = String(existingToolCall?.toolName || event.tool_name || '').toLowerCase() === 'ask_user'
            && event.type === 'tool_call_completed';
          const nodeId = event.workflow_node_id || run.workflowRun?.current_node_id;
          return {
            ...run,
            stage: 'in_progress',
            loopIndex,
            toolCalls: upsertToolCall(run.toolCalls, event.call_id, {
              callId: event.call_id,
              parentCallId: event.parent_call_id || existingToolCall?.parentCallId || '',
              loopIndex,
              toolGroup: event.tool_group || 'external',
              kind: event.kind || existingToolCall?.kind || 'tool',
              toolName: event.tool_name || 'unknown',
              skillName: event.skill_name || existingToolCall?.skillName || '',
              skillPath: event.skill_path || existingToolCall?.skillPath || '',
              state: nextState,
              inputSummary: event.input_summary || existingToolCall?.inputSummary || '',
              outputSummary: event.output_summary || existingToolCall?.outputSummary || '',
              toolInput: event.tool_input || existingToolCall?.toolInput || null,
              toolResponse: event.tool_response || existingToolCall?.toolResponse || null,
              toolOutput: event.tool_output || existingToolCall?.toolOutput || '',
              message: event.message || existingToolCall?.message || '',
            }),
            workflowRun: askUserResolved ? {
              ...(run.workflowRun || {}),
              status: 'running',
              nodes: nodeId ? {
                ...(run.workflowRun?.nodes || {}),
                [nodeId]: {
                  ...(run.workflowRun?.nodes?.[nodeId] || {}),
                  status: 'running',
                },
              } : (run.workflowRun?.nodes || {}),
            } : run.workflowRun,
          };
        });
        break;
      case 'todo_updated':
        updateTaskById(taskId, (run) => ({ ...run, stage: 'in_progress', loopIndex }));
        break;
      case 'tool_output_delta': {
        updateTaskById(taskId, (run) => {
          const deltaData = event.data && typeof event.data === 'object' ? event.data : {};
          const callId = event.call_id || deltaData.call_id || deltaData.tool_call_id || null;
          if (!callId || !Array.isArray(run.toolCalls)) return run;
          const existingToolCall = run.toolCalls.find((item) => item.callId === callId);
          if (!existingToolCall) return run;
          const delta = String(event.delta || deltaData.delta || '');
          if (!delta) return run;
          return {
            ...run,
            stage: 'in_progress',
            loopIndex,
            toolCalls: upsertToolCall(run.toolCalls, callId, {
              // 实时追加命令输出，卡片在 running 状态直接展示，像终端一样滚动。
              toolOutput: `${existingToolCall.toolOutput || ''}${delta}`,
            }),
          };
        });
        break;
      }
      case 'sub_agent_progress_delta':
      case 'sub_agent_answer_delta':
      case 'sub_agent_tool_call_started':
      case 'sub_agent_tool_call_completed':
      case 'sub_agent_started':
      case 'sub_agent_finished':
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'in_progress',
          loopIndex,
        }));
        break;
      case 'llm_answer_delta': {
        if (chatFinalizedTaskIdsRef.current.has(taskId) || getTaskById(taskId)?.serverFinished) {
          break;
        }
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
        break;
      }
      case 'llm_retry': {
        updateTaskById(taskId, (run) => ({
          ...run,
          status: isTerminalTaskStatus(run.status) ? run.status : 'running',
          stage: 'in_progress',
          loopIndex,
        }));
        break;
      }
      case 'final_answer': {
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
          break;
        }
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'check',
          loopIndex,
          answerText: readRuntimeAnswerBuffer(),
          providerState: run.providerState ? { ...run.providerState, state: 'completed' } : run.providerState,
        }));
        break;
      }
      case 'run_finished': {
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
            answerText: chatFinalizedTaskIdsRef.current.has(taskId) && run.answerText
              ? run.answerText
              : (persistedTask?.answer_text || (resolvedStatus === 'done' ? (toDisplayText(event.message) || run.answerText) : run.answerText)),
            error: terminalError,
            serverFinished: true,
          };
        });
        chatFinalizedTaskIdsRef.current.add(taskId);
        updateTaskRuntimeState((state) => ({ ...state, activeTaskId: null }), ownerConvId);
        setRuntimeBusy(false, ownerConvId);
        setRuntimeActiveTaskId(null, ownerConvId);
        setRuntimeFetchController(null, ownerConvId);
        break;
      }
      default:
        break;
    }

  }

  async function executeQuest(pendingTask, targetConversationId, streamRequest = null) {
    const runConversationId = targetConversationId;
    if (!runConversationId) {
      throw new Error('conversation is not ready');
    }
    // A Stop owns this conversation until cancellation and server recovery settle.
    // Re-read the same task after that barrier; never silently retarget a stale Retry.
    let stoppingRuntime = getRuntime(runConversationId);
    while (stoppingRuntime?.stopPromise) {
      await stoppingRuntime.stopPromise;
      stoppingRuntime = getRuntime(runConversationId);
    }
    if (streamRequest?.preflightSignal?.aborted) throw new Error('Retry was stopped. Your changes have not been sent.');
    if (stoppingRuntime?.stopError) throw new Error(stoppingRuntime.stopError);
    if (streamRequest?.attempt) {
      const state = stoppingRuntime?.taskRuntimeState;
      const sourceId = pendingTask.taskId || pendingTask.id;
      const replaced = Object.values(state?.tasksById || {}).some((task) =>
        task.sourceTaskId === sourceId && !task.rerunFromNodeId);
      if (replaced || (state?.latestTaskId && state.latestTaskId !== sourceId)) {
        throw new Error('This turn has been replaced or is no longer the latest turn. Retry the current turn instead.');
      }
      pendingTask = state?.tasksById?.[sourceId] || pendingTask;
    }
    const providers = ctx.providerOptions || [];
    const defaultEffort = (provider) => providers.find((item) => item.id === provider)?.defaultReasoningEffort;
    if (streamRequest?.runConfig) {
      const config = streamRequest.runConfig;
      streamRequest = { ...streamRequest, runConfig: {
        ...config,
        ...(config.nodeRuntimeConfig ? nodeRuntimeConfigRequest(config.nodeRuntimeConfig, providers) : {}),
        ...(config.provider ? { reasoningEffort: normalizeReasoningEffort(config.reasoningEffort, defaultEffort(config.provider)) } : {}),
      } };
    }
    pendingTask = { ...pendingTask,
      ...(pendingTask.executionMode === 'bot'
        ? { nodeRuntimeConfigs: nodeRuntimeConfigsForWorkflow(pendingTask.workflowSnapshot, pendingTask.nodeRuntimeConfigs, providers) }
        : { requestedReasoningEffort: normalizeReasoningEffort(pendingTask.requestedReasoningEffort, defaultEffort(pendingTask.requestedProvider)) }),
    };
    const rerunningNode = Boolean(streamRequest?.rerunNodeId);
    const fullAttempt = Boolean(streamRequest?.attempt);
    const previousRuntime = getRuntime(runConversationId);
    if (fullAttempt && (previousRuntime?.busy || previousRuntime?.fetchController || previousRuntime?.activeRunId)) {
      throw new Error('Wait for the current task to finish or stop before resending. Your changes have not been sent.');
    }
    const candidate = fullAttempt && streamRequest.runConfig ? {
      ...pendingTask, requestedProvider: streamRequest.runConfig.provider, requestedModelId: streamRequest.runConfig.modelId,
    } : pendingTask;
    const configs = rerunningNode && streamRequest.runConfig?.nodeRuntimeConfig
      ? { ...candidate.nodeRuntimeConfigs, [streamRequest.rerunNodeId]: streamRequest.runConfig.nodeRuntimeConfig } : candidate.nodeRuntimeConfigs;
    const configError = executionConfigError({ executionMode: candidate.executionMode, provider: candidate.requestedProvider,
      modelId: candidate.requestedModelId, workflow: candidate.workflowSnapshot, nodeRuntimeConfigs: configs, providerOptions: ctx.providerOptions || [] });
    if (configError) throw new Error(`${configError} Your changes have not been sent.`);
    const editedText = streamRequest?.attempt === 'edit' ? streamRequest.message : null;
    const sourceTaskId = pendingTask.taskId || pendingTask.id || null;
    const runId = (rerunningNode || fullAttempt) ? generateHexId() : (sourceTaskId || generateHexId());
    if (rerunningNode || fullAttempt) {
      const startedAt = Date.now();
      pendingTask = {
        ...pendingTask,
        ...(fullAttempt && streamRequest.runConfig ? {
          requestedProvider: streamRequest.runConfig.provider,
          requestedModelId: streamRequest.runConfig.modelId,
          requestedReasoningEffort: streamRequest.runConfig.reasoningEffort,
          ...(pendingTask.executionMode !== 'bot' ? { requestedAgentId: streamRequest.runConfig.agentId } : {}),
        } : {}),
        ...(rerunningNode && streamRequest.runConfig?.nodeRuntimeConfig ? {
          nodeRuntimeConfigs: { ...(pendingTask.nodeRuntimeConfigs || {}), [streamRequest.rerunNodeId]: streamRequest.runConfig.nodeRuntimeConfig },
        } : {}),
        id: runId,
        taskId: runId,
        sourceTaskId,
        awaitingRetryConfirmation: streamRequest?.attempt === 'rerun',
        sourceRunId: pendingTask.workflowRun?.run_id || null,
        rerunFromNodeId: streamRequest.rerunNodeId || null,
        title: fullAttempt && streamRequest.message != null ? streamRequest.message : pendingTask.title,
        displayText: editedText ?? pendingTask.displayText,
        requestText: editedText ?? pendingTask.requestText,
        status: 'running',
        stage: 'assigned',
        createdAt: startedAt,
        updatedAt: startedAt,
        completedAt: null,
        serverFinished: false,
        error: null,
        answerText: '',
        chatStreamText: '',
        eventLog: [],
        toolCalls: [],
        assistantMessageId: null,
      };
    }
    pendingTask.id = runId;
    if (rerunningNode || fullAttempt) {
      chatFinalizedTaskIdsRef.current.delete(runId);
      userCancelledTaskIdsRef.current.delete(runId);
    }
    // Ensure the runtime exists and prime its run-local state.
    mutateRuntime(runConversationId, (rt) => {
      rt.runGeneration = (rt.runGeneration || 0) + 1;
      rt.activeRunId = runId;
      rt.cancelledRunIds.delete(runId);
      rt.answerBuffer = '';
      rt.busy = true;
      rt.abortRequested = false;
      rt.shellSeeded = false;
    });
    updateTaskRuntimeState((state) => ({
      ...state,
      pendingTask: {
        ...pendingTask,
        status: 'running',
        stage: 'assigned',
      },
    }), runConversationId);
    if (rerunningNode || fullAttempt) {
      setRuntimeActiveTaskId(runId, runConversationId);
      setRuntimeBusy(true, runConversationId);
    }

    let rolledBack = false;
    const rollbackUnconfirmedRerun = () => {
      if (rolledBack || (!rerunningNode && !fullAttempt)) return;
      rolledBack = true;
      updateTaskRuntimeState((state) => {
        const tasksById = { ...(state.tasksById || {}) };
        delete tasksById[runId];
        return {
          ...state,
          tasksById,
          taskOrder: (state.taskOrder || []).filter((taskId) => taskId !== runId),
          activeTaskId: state.activeTaskId === runId ? null : state.activeTaskId,
          pendingTask: (state.pendingTask?.taskId || state.pendingTask?.id) === runId
            ? null
            : state.pendingTask,
        };
      }, runConversationId);
      const runtime = getRuntime(runConversationId);
      if (!runtime?.activeRunId || runtime.activeRunId === runId) {
        mutateRuntime(runConversationId, (rt) => { rt.activeRunId = null; });
        setRuntimeActiveTaskId(null, runConversationId);
        setRuntimeFetchController(null, runConversationId);
        setRuntimeBusy(false, runConversationId);
      }
      removeConversationTaskFromWorkspace(runConversationId, runId);
      chatFinalizedTaskIdsRef.current.delete(runId);
      userCancelledTaskIdsRef.current.delete(runId);
    };

    if (!rerunningNode && !fullAttempt && pendingTask.attachment?.file && !pendingTask.attachment?.uploaded) {
      const uploadController = new AbortController();
      const uploadName = pendingTask.attachment.name || pendingTask.attachment.file.name || 'document';
      setRuntimeFetchController(uploadController, runConversationId);
      setUploadState({ active: true, fileName: uploadName });
      try {
        const payload = await uploadAttachment(
          pendingTask.attachment.file,
          uploadController.signal,
          runConversationId,
          pendingTask.executionMode === 'bot'
            ? { workflowId: pendingTask.requestedWorkflowId }
            : { agentId: pendingTask.requestedAgentId },
        );
        const runRuntimeForGuard = getRuntime(runConversationId);
        if (!runRuntimeForGuard || runRuntimeForGuard.activeRunId !== runId) {
          return;
        }
        const nextAttachment = {
          name: payload?.attachment?.file_name || uploadName,
          size: payload?.attachment?.size_bytes ?? pendingTask.attachment.size,
          type: payload?.attachment?.content_type || pendingTask.attachment.type,
          uploaded: true,
          documentId: payload?.attachment?.document_id || payload?.document?.id || null,
          attachmentId: payload?.attachment?.attachment_id || null,
          title: payload?.attachment?.title || pendingTask.attachment.name || uploadName,
          conversationId: payload?.attachment?.conversation_id || runConversationId,
        };
        pendingTask.attachment = { ...pendingTask.attachment, ...nextAttachment };
        applyConversationSnapshot(payload?.conversation || null);
        setComposerAttachment(nextAttachment);
        showToast('success', `document uploaded: ${String(uploadName || '').toLowerCase()}`);
      } catch (error) {
        const runRuntimeForError = getRuntime(runConversationId);
        if (!((runRuntimeForError?.abortRequested) || error?.name === 'AbortError')) {
          showToast('error', `upload failed: ${String(uploadName || '').toLowerCase()}`);
        }
        throw error;
      } finally {
        const guardRt = getRuntime(runConversationId);
        if (guardRt && guardRt.fetchController === uploadController) {
          setRuntimeFetchController(null, runConversationId);
        }
        setUploadState({ active: false, fileName: '' });
      }
    }

    const controller = new AbortController();
    setRuntimeFetchController(controller, runConversationId);
    const waitForActiveTaskRelease = () => new Promise((resolve, reject) => {
      if (controller.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        controller.signal.removeEventListener('abort', onAbort);
        resolve();
      }, activeTaskConflictWaitMs);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const requestBody = fullAttempt ? {
      request_id: streamRequest.requestId,
      ...(streamRequest.attempt === 'edit' ? { message: streamRequest.message } : {}),
      ...(streamRequest.runConfig ? {
        llm_config_id: streamRequest.runConfig.provider,
        model_id: streamRequest.runConfig.modelId,
        reasoning_effort: streamRequest.runConfig.reasoningEffort,
      } : {}),
    } : rerunningNode ? {
      ...(streamRequest.runConfig?.nodeRuntimeConfig ? { runtime_config: streamRequest.runConfig.nodeRuntimeConfig } : {}),
      llm_config_id: streamRequest.runConfig?.provider,
      model_id: streamRequest.runConfig?.modelId,
      reasoning_effort: streamRequest.runConfig?.reasoningEffort,
    } : {
      message: pendingTask.requestText ?? pendingTask.title,
      annotations: pendingTask.annotations || [],
      // 「以任务产出为上下文」：只传任务引用，报告正文由服务端在起跑时取
      // （没挂上下文就是空数组）。
      context_tasks: (Array.isArray(pendingTask.contextTasks) ? pendingTask.contextTasks : [])
        .map((item) => ({ task_id: item.taskId || item.task_id || '' }))
        .filter((item) => item.task_id),
      attachments: pendingTask.attachment ? [{
        name: pendingTask.attachment.name,
        size: pendingTask.attachment.size,
        type: pendingTask.attachment.type,
        title: pendingTask.attachment.title || pendingTask.attachment.name,
        file_name: pendingTask.attachment.name,
        attachment_id: pendingTask.attachment.attachmentId || null,
        document_id: pendingTask.attachment.documentId || null,
      }] : [],
      image_attachments: Array.isArray(pendingTask.imageAttachments) ? pendingTask.imageAttachments : [],
      options: {
        ...(pendingTask.executionMode === 'bot' ? { node_runtime_configs: pendingTask.nodeRuntimeConfigs || {} } : {}),
        llm_config_id: pendingTask.requestedProvider || null,
        model_id: pendingTask.requestedModelId || null,
        agent_id: pendingTask.requestedAgentId || null,
        workflow_id: pendingTask.requestedWorkflowId || null,
        execution_mode: pendingTask.executionMode === 'bot' ? 'bot' : 'chat',
        reasoning_effort: pendingTask.requestedReasoningEffort ?? null,
        use_history: true,
      },
    };

    let confirmedTaskId = null;
    const queuedEvents = [];
    let flushTimer = null;
    const runRuntime = getRuntime(runConversationId, { create: true });
    let settleIdentity;
    let settleStream;
    const pendingRun = {
      runId, pendingTask, taskId: null,
      streamSettled: new Promise((resolve) => { settleStream = resolve; }),
      identitySettled: new Promise((resolve) => { settleIdentity = resolve; }),
      confirmStoppedTask(event) {
        const taskId = event.task_id;
        if (!taskId || (event.conversation_id && event.conversation_id !== runConversationId)
          || getRuntime(runConversationId) !== runRuntime) return;
        confirmedTaskId = taskId;
        pendingRun.taskId = taskId;
        userCancelledTaskIdsRef.current.add(taskId);
        chatFinalizedTaskIdsRef.current.add(taskId);
        settleIdentity(taskId);
        // A background schedule may start while an older Stop is failing.
        // Track/cancel this request's identity without replacing the newer run.
        if (runRuntime.activeRunId && runRuntime.activeRunId !== runId) return;
        updateTaskRuntimeState((state) => {
          const previous = state.tasksById[taskId];
          const task = previous || buildTaskRuntimeRecord({ ...event, conversation_id: runConversationId }, pendingTask);
          const tasksById = { ...state.tasksById, [taskId]: isTerminalTaskStatus(task.status)
            ? task : applyTerminalTaskState(task, 'cancelled', { aborted: true }) };
          if (runId !== taskId) delete tasksById[runId];
          return { ...state, tasksById, latestTaskId: taskId,
            pendingTask: (state.pendingTask?.taskId || state.pendingTask?.id) === runId ? null : state.pendingTask,
            activeTaskId: state.activeTaskId === runId || state.activeTaskId === taskId ? null : state.activeTaskId,
            taskOrder: [...new Set([...state.taskOrder.filter((id) => id !== runId), taskId])],
          };
        }, runConversationId);
      },
    };
    mutateRuntime(runConversationId, (rt) => { rt.pendingRun = pendingRun; });
    const flushQueuedEvents = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      const batch = queuedEvents.splice(0);
      if (!batch.length) return;
      const previousTarget = streamTargetConvIdRef.current;
      streamTargetConvIdRef.current = runConversationId;
      try {
        batchRuntimeMutations(runConversationId, () => {
          for (const event of batch) {
            if (
              getRuntime(runConversationId) !== runRuntime
              || controller.signal.aborted
              || runRuntime.abortRequested
              || runRuntime.activeRunId !== runId
              || runRuntime.cancelledRunIds.has(runId)
              || (event.conversation_id && event.conversation_id !== runConversationId)
            ) {
              continue;
            }
            if (event.type === 'run_started' && event.task_id) {
              confirmedTaskId = event.task_id;
              pendingRun.taskId = event.task_id;
            }
            if (
              event.task_id
              && runRuntime.activeTaskId !== event.task_id
              && !chatFinalizedTaskIdsRef.current.has(event.task_id)
            ) {
              setRuntimeActiveTaskId(event.task_id, runConversationId);
            }
            applyRuntimeEvent(event, runConversationId);
            if (event.type === 'run_started' && event.task_id) {
              settleIdentity(event.task_id);
              streamRequest?.onAccepted?.();
            }
          }
        });
      } finally {
        streamTargetConvIdRef.current = previousTarget;
      }
    };
    const queueRuntimeEvent = (event) => {
      if (STREAM_IMMEDIATE_EVENT_TYPES.has(event.type)) {
        flushQueuedEvents();
        queuedEvents.push(event);
        flushQueuedEvents();
        return;
      }
      const lastIndex = queuedEvents.length - 1;
      const mergedEvent = coalesceStreamEvent(queuedEvents[lastIndex], event);
      if (mergedEvent) queuedEvents[lastIndex] = mergedEvent;
      else queuedEvents.push(event);
      if (!flushTimer) {
        flushTimer = setTimeout(flushQueuedEvents, STREAM_EVENT_BATCH_MS);
      }
    };
    try {
      for (let attempt = 0; ; attempt += 1) {
        const command = {
          request_id: `${realtimeRequestId()}-${attempt}`,
          operation: fullAttempt
            ? (streamRequest.attempt === 'edit' ? 'edit' : 'rerun')
            : (rerunningNode ? 'rerun_node' : 'start'),
          conversation_id: runConversationId,
          ...(fullAttempt || rerunningNode ? { task_id: sourceTaskId } : {}),
          ...(rerunningNode ? { node_id: streamRequest.rerunNodeId } : {}),
          payload: requestBody,
        };
        try {
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          await runTaskStream(command, (event) => {
            const normalized = normalizeRuntimeEvent(event);
            if (!normalized || (normalized.conversation_id && normalized.conversation_id !== runConversationId)
              || getRuntime(runConversationId) !== runRuntime) return;
            // Identity confirmation is control-plane data, not generated content.
            // Keep it even when Stop has already aborted the local projection.
            if (normalized.type === 'run_started' && normalized.task_id && !confirmedTaskId
              && (controller.signal.aborted || runRuntime.cancelledRunIds.has(runId))) {
              pendingRun.confirmStoppedTask(normalized);
              return;
            }
            if (controller.signal.aborted || runRuntime.abortRequested
              || runRuntime.activeRunId !== runId || runRuntime.cancelledRunIds.has(runId)) return;
            // Never combine an already-seen fragment with a fresh one: once
            // text is merged, the identities alone cannot split partial replay.
            if (!acceptRuntimeEvent(normalized, runConversationId)) return;
            queueRuntimeEvent(normalized);
          });
          break;
        } catch (error) {
          const detail = String(error?.message || error || '');
          const waitable = fullAttempt
            && (error?.status == null || Number(error.status) === 409)
            && detail === ACTIVE_TASK_CONFLICT_DETAIL;
          if (!waitable || attempt >= activeTaskConflictMaxWaits) {
            if (detail === ACTIVE_TASK_CONFLICT_DETAIL) {
              throw new Error('The previous task is still running or stopping. Your changes have not been sent. Wait for it to stop, then try again.');
            }
            throw error;
          }
          if (attempt === 0) showToast?.('info', 'The previous task is still stopping — sending automatically once it is done…');
          await waitForActiveTaskRelease();
        }
      }
    } catch (error) {
      // Drain first: run_started may have promoted the local placeholder to a
      // server task. Rolling back first clears its pointer and strands that task
      // in running state, permanently blocking the next Retry.
      flushQueuedEvents();
      if (!confirmedTaskId) {
        rollbackUnconfirmedRerun();
      } else if (fullAttempt || rerunningNode) {
        updateTaskById(confirmedTaskId, (task) => isTerminalTaskStatus(task.status)
          ? task
          : applyTerminalTaskState(task, 'failed', { error: String(error?.message || error) }), runConversationId);
        chatFinalizedTaskIdsRef.current.add(confirmedTaskId);
        updateTaskRuntimeState((state) => ({ ...state,
          activeTaskId: state.activeTaskId === confirmedTaskId ? null : state.activeTaskId,
        }), runConversationId);
        const runtime = getRuntime(runConversationId);
        if (runtime?.activeRunId === runId) {
          mutateRuntime(runConversationId, (rt) => { rt.activeRunId = null; });
          setRuntimeBusy(false, runConversationId);
          setRuntimeActiveTaskId(null, runConversationId);
        }
      }
      if (fullAttempt && Number(error?.status) === 409
        && ['Only the latest turn can be retried or edited.', 'Task is not eligible for this operation.']
          .includes(String(error?.message))) {
        const recoveryController = new AbortController();
        const signal = streamRequest?.preflightSignal;
        const abortRecovery = () => recoveryController.abort();
        signal?.addEventListener('abort', abortRecovery, { once: true });
        if (signal?.aborted) abortRecovery();
        try {
          await waitForAttemptConfigOperation(
            recoverConversationTasks(runConversationId, { expectedRuntime: runRuntime, signal: recoveryController.signal }),
            { signal: recoveryController.signal, timeoutMs: ctx.attemptConfigTimeoutMs ?? 30_000,
              timeoutMessage: 'Timed out refreshing task status. Nothing was retried. Please try again.' },
          );
        } finally {
          recoveryController.abort();
          signal?.removeEventListener('abort', abortRecovery);
        }
      }
      throw error;
    } finally {
      flushQueuedEvents();
      if (!confirmedTaskId) rollbackUnconfirmedRerun();
      settleIdentity(confirmedTaskId);
      settleStream();
      if (getRuntime(runConversationId)?.pendingRun === pendingRun) {
        mutateRuntime(runConversationId, (rt) => { rt.pendingRun = null; });
      }
      const guardRt = getRuntime(runConversationId);
      if (guardRt && guardRt.fetchController === controller) {
        setRuntimeFetchController(null, runConversationId);
      }
    }
  }

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
