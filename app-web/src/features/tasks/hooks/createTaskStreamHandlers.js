import { appendStreamEvent, mergeAdjacentStreamEvent } from '../../chat/model/stream-events.js';
import { DEFAULT_REASONING_EFFORT } from '../../chat/model/run-catalog.js';
import { usableWorkflowSnapshot } from '../../workflow/model/workflow-snapshot.js';
import { stripInjectedSkillInstruction } from '../../chat/model/chat-text.js';
import { runtimeEventToLog } from '../model/runtime-events.js';

export function workflowNodeStartedState(event) {
  return {
    status: 'running',
    success: null,
    input: event.input ?? event.node_input ?? null,
    attempt: event.attempt ?? event.node_attempt ?? null,
    started_at: event.started_at || event.created_at,
  };
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
    API_BASE,
    CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
    STREAM_EVENT_BATCH_MS,
    STREAM_IMMEDIATE_EVENT_TYPES,
    activeRuntimeTargetConvId,
    appendAnswerDelta,
    appendChatProgressText,
    applyConversationSnapshot,
    applyTerminalTaskState,
    batchRuntimeMutations,
    apiFetch,
    buildApiHeaders,
    chatFinalizedTaskIdsRef,
    conversationId,
    conversationIdRef,
    ensureTaskForEvent,
    eventDeltaText,
    flushRuntimeTasksToWorkspace,
    generateHexId,
    getChatProgressLine,
    getRuntime,
    getTaskById,
    getToolResponseTraceStatus,
    isTerminalTaskStatus,
    mergeChatImageRefs,
    mutateRuntime,
    normalizeChatImageRefs,
    normalizeContextUsage,
    normalizeTaskStatus,
    normalizeRuntimeEvent,
    readRuntimeAnswerBuffer,
    removeConversationTaskFromWorkspace,
    resolveProviderMeta,
    saveStoredContextUsage,
    setComposerAttachment,
    setContextUsage,
    setRuntimeActiveTaskId,
    setRuntimeAnswerBuffer,
    setRuntimeBusy,
    setRuntimeFetchController,
    setUploadState,
    showToast,
    streamTargetConvIdRef,
    stripChatImageAugmentation,
    taskHasAssistantStreamContent,
    toDisplayText,
    updateTaskById,
    updateTaskRuntimeState,
    uploadAttachment,
    upsertToolCall,
    userCancelledTaskIdsRef,
  } = ctx;

  const isChatOriginTask = (taskId, targetConvId = null) => (
    getTaskById(taskId, targetConvId)?.originViewMode === 'chat'
  );

  const appendTaskEvent = (taskId, event) => {
    updateTaskById(taskId, (task) => {
      const runtimeEvent = runtimeEventToLog(event);
      return {
        ...task,
        loopIndex: Math.max(task.loopIndex || 0, event.loop_index || 0),
        eventLog: appendStreamEvent(task.eventLog, {
          ...runtimeEvent,
          workflowNodeId: runtimeEvent.workflowNodeId
            || task.workflowRun?.current_node_id
            || null,
        }),
      };
    });
  };

  const coalesceStreamEvent = (previous, event) => (
    mergeQueuedStreamDelta(previous, event, eventDeltaText)
  );

  async function readNdjsonStream(response, onEvent, signal) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const cancelReader = () => {
      reader.cancel().catch(() => undefined);
    };
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      return;
    }
    signal?.addEventListener?.('abort', cancelReader, { once: true });
    let buffer = '';
    try {
      while (true) {
        if (signal?.aborted) return;
        const { value, done } = await reader.read();
        if (done || signal?.aborted) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex = buffer.indexOf('\n');
        while (newlineIndex >= 0) {
          if (signal?.aborted) return;
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) {
            const event = normalizeRuntimeEvent(JSON.parse(line));
            if (event && !signal?.aborted) onEvent(event);
          }
          newlineIndex = buffer.indexOf('\n');
        }
      }
      if (signal?.aborted) return;
      const tail = buffer.trim();
      if (tail) {
        const event = normalizeRuntimeEvent(JSON.parse(tail));
        if (event && !signal?.aborted) onEvent(event);
      }
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') return;
      throw error;
    } finally {
      signal?.removeEventListener?.('abort', cancelReader);
    }
  }

  function applyRuntimeEvent(event, targetConvId = null) {
    const eventConversationId = event.conversation_id || null;
    const ownerConvId = activeRuntimeTargetConvId(targetConvId);
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
    appendTaskEvent(taskId, event);
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
      case 'context_usage_updated': {
        if (event.source === 'provider_usage' && event.context_used_tokens == null && event.usedTokens == null) {
          break;
        }
        const usageConversationId = event.conversation_id || ownerConvId || conversationId;
        const nextContextUsage = normalizeContextUsage({
          conversationId: usageConversationId,
          contextUsedTokens: event.context_used_tokens,
          contextTotalTokens: event.context_total_tokens,
          usedTokens: event.usedTokens ?? event.used_tokens,
          totalTokens: event.totalTokens ?? event.total_tokens,
          valid: event.valid_context_usage,
          compressed: event.compressed,
          compressedCount: event.compressed_count,
          updatedAt: event.created_at || event.timestamp || new Date().toISOString(),
        }, usageConversationId);
        if (!nextContextUsage.valid) {
          break;
        }
        if (!ownerConvId || ownerConvId === conversationIdRef.current) {
          setContextUsage(nextContextUsage);
        }
        saveStoredContextUsage(nextContextUsage);
        break;
      }
      case 'run_started':
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
          const existing = getTaskById(taskId, ownerConvId);
          const answerBuffer = String(readRuntimeAnswerBuffer(ownerConvId) || '').trim();
          if (!taskHasAssistantStreamContent(existing) && !answerBuffer) {
            updateTaskRuntimeState((state) => {
              const nextTasksById = { ...(state.tasksById || {}) };
              delete nextTasksById[taskId];
              return {
                ...state,
                activeTaskId: null,
                pendingTask: null,
                taskOrder: (state.taskOrder || []).filter((id) => id !== taskId),
                tasksById: nextTasksById,
              };
            }, ownerConvId);
            removeConversationTaskFromWorkspace(ownerConvId, taskId);
            if (ownerConvId) flushRuntimeTasksToWorkspace(ownerConvId);
            setRuntimeBusy(false, ownerConvId);
            setRuntimeActiveTaskId(null, ownerConvId);
            setRuntimeFetchController(null, ownerConvId);
            break;
          }
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
    const rerunningNode = Boolean(streamRequest?.rerunNodeId);
    const sourceTaskId = pendingTask.id || pendingTask.taskId || null;
    const runId = rerunningNode ? generateHexId() : (sourceTaskId || generateHexId());
    if (rerunningNode) {
      pendingTask = {
        ...pendingTask,
        id: runId,
        taskId: runId,
        sourceTaskId,
        sourceRunId: pendingTask.workflowRun?.run_id || null,
        rerunFromNodeId: streamRequest.rerunNodeId,
        status: 'running',
        stage: 'assigned',
        completedAt: null,
        serverFinished: false,
        error: null,
        answerText: '',
        chatStreamText: '',
      };
    }
    pendingTask.id = runId;
    if (rerunningNode) {
      chatFinalizedTaskIdsRef.current.delete(runId);
      userCancelledTaskIdsRef.current.delete(runId);
    }
    // Ensure the runtime exists and prime its run-local state.
    mutateRuntime(runConversationId, (rt) => {
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
    if (rerunningNode) {
      setRuntimeActiveTaskId(runId, runConversationId);
      setRuntimeBusy(true, runConversationId);
    }

    const rollbackUnconfirmedRerun = () => {
      if (!rerunningNode) return;
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
      mutateRuntime(runConversationId, (rt) => {
        if (rt.activeRunId === runId) rt.activeRunId = null;
      });
      setRuntimeActiveTaskId(null, runConversationId);
      setRuntimeFetchController(null, runConversationId);
      setRuntimeBusy(false, runConversationId);
      removeConversationTaskFromWorkspace(runConversationId, runId);
      chatFinalizedTaskIdsRef.current.delete(runId);
      userCancelledTaskIdsRef.current.delete(runId);
    };

    if (!rerunningNode && pendingTask.attachment?.file && !pendingTask.attachment?.uploaded) {
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
    const streamUrl = rerunningNode
      ? `${API_BASE}/api/tasks/${sourceTaskId}/workflow/nodes/${encodeURIComponent(streamRequest.rerunNodeId)}/rerun/stream`
      : `${API_BASE}/api/conversations/${runConversationId}/tasks/stream`;
    const requestBody = rerunningNode ? JSON.stringify({
      provider: streamRequest.runConfig.provider,
      model_id: streamRequest.runConfig.modelId,
      reasoning_effort: streamRequest.runConfig.reasoningEffort,
    }) : JSON.stringify({
      message: pendingTask.requestText || pendingTask.title,
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
        provider: pendingTask.requestedProvider || null,
        model_id: pendingTask.requestedModelId || null,
        agent_id: pendingTask.requestedAgentId || null,
        workflow_id: pendingTask.requestedWorkflowId || null,
        execution_mode: pendingTask.executionMode === 'bot' ? 'bot' : 'chat',
        reasoning_effort: pendingTask.requestedReasoningEffort || DEFAULT_REASONING_EFFORT,
        use_history: true,
      },
    });
    let response;
    try {
      response = await apiFetch(streamUrl, {
        method: 'POST',
        headers: buildApiHeaders(),
        body: requestBody,
        signal: controller.signal,
      });
    } catch (error) {
      rollbackUnconfirmedRerun();
      throw error;
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const detail = typeof payload?.detail === 'string'
        ? payload.detail
        : (payload?.detail ? JSON.stringify(payload.detail) : '');
      rollbackUnconfirmedRerun();
      throw new Error(detail || `task stream failed: ${response.status}`);
    }
    if (!response.body) {
      rollbackUnconfirmedRerun();
      throw new Error('task stream failed: empty response');
    }

    const queuedEvents = [];
    let flushTimer = null;
    const runRuntime = getRuntime(runConversationId, { create: true });
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
              controller.signal.aborted
              || runRuntime.abortRequested
              || runRuntime.activeRunId !== runId
              || runRuntime.cancelledRunIds.has(runId)
              || (event.conversation_id && event.conversation_id !== runConversationId)
            ) {
              continue;
            }
            if (
              event.task_id
              && runRuntime.activeTaskId !== event.task_id
              && !chatFinalizedTaskIdsRef.current.has(event.task_id)
            ) {
              setRuntimeActiveTaskId(event.task_id, runConversationId);
            }
            applyRuntimeEvent(event, runConversationId);
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
      await readNdjsonStream(response, queueRuntimeEvent, controller.signal);
    } finally {
      flushQueuedEvents();
      const guardRt = getRuntime(runConversationId);
      if (guardRt && guardRt.fetchController === controller) {
        setRuntimeFetchController(null, runConversationId);
      }
    }
  }

  return {
    executeQuest,
    executeWorkflowNodeRerun: (task, nodeId, runConfig) => {
      if (!runConfig?.provider || !runConfig?.modelId || !runConfig?.reasoningEffort) {
        return Promise.reject(new Error('Select a provider, model, and reasoning effort before rerunning.'));
      }
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
