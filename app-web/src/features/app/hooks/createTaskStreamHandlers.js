// @haish-esm
// Extracted from AppShell.jsx (Phase C2). Behavior-preserving factory.
export function createTaskStreamHandlers(ctx) {
  const {
    API_BASE,
    CHAT_FINAL_FOLLOWUP_EVENT_TYPES,
    STREAM_EVENT_BATCH_MS,
    STREAM_IMMEDIATE_EVENT_TYPES,
    WORKFLOW_SCENE_EVENT_TYPES,
    WORLD_SCENE_EVENT_TYPES,
    activeRuntimeTargetConvId,
    appendAnswerDelta,
    appendChatProgressText,
    appendTaskEvent,
    applyConversationSnapshot,
    applyTerminalTaskState,
    authFetch,
    buildApiHeaders,
    buildAgentLiveSnapshot,
    chatFinalizedTaskIdsRef,
    compactPendingSceneItems,
    completeAgentLiveEntries,
    completeLatestAgentLiveEntry,
    completeTaskAgents,
    conversationId,
    conversationIdRef,
    defaultQuestDescription,
    dropPendingSceneItems,
    ensureTaskForEvent,
    eventDeltaText,
    extractTodosFromToolItem,
    finalizeTaskPresentation,
    flushRuntimeTasksToWorkspace,
    generateHexId,
    getActiveRoleFromWorldEvents,
    getChatProgressLine,
    getLoopIndexFromWorldEvents,
    getRuntime,
    getTaskById,
    getToolResponseTraceStatus,
    isBotWorkflowTask,
    isChatOriginTask,
    isTerminalTaskStatus,
    mergeAgentLiveEntry,
    mergeChatImageRefs,
    mutateRuntime,
    normalizeChatImageRefs,
    normalizeContextUsage,
    normalizeTaskStatus,
    normalizeWorldEvent,
    pendingPresentationTaskIdsRef,
    readRuntimeAnswerBuffer,
    removeConversationTaskFromWorkspace,
    resetSceneActors,
    resolveProviderMeta,
    saveStoredContextUsage,
    scheduleSceneEvent,
    setAgentLive,
    setComposerAttachment,
    setContextUsage,
    setHollow,
    setRuntimeActiveTaskId,
    setRuntimeAnswerBuffer,
    setRuntimeBusy,
    setRuntimeFetchController,
    setUploadState,
    showToast,
    stopThinkingPulse,
    stopThinkingPulsesForTask,
    streamTargetConvIdRef,
    stripChatImageAugmentation,
    taskHasAssistantStreamContent,
    taskImageAttachmentsRef,
    toDisplayText,
    updateTaskById,
    updateWorldTaskState,
    uploadAttachment,
    upsertToolCall,
    userCancelledTaskIdsRef,
    userIdRef,
    worldEventToRuntimeLog,
  } = ctx;

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
            const event = normalizeWorldEvent(JSON.parse(line));
            if (event && !signal?.aborted) onEvent(event);
          }
          newlineIndex = buffer.indexOf('\n');
        }
      }
      if (signal?.aborted) return;
      const tail = buffer.trim();
      if (tail) {
        const event = normalizeWorldEvent(JSON.parse(tail));
        if (event && !signal?.aborted) onEvent(event);
      }
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') return;
      throw error;
    } finally {
      signal?.removeEventListener?.('abort', cancelReader);
    }
  }

  function applyWorldEvent(event, targetConvId = null) {
    const eventConversationId = event.conversation_id || null;
    const ownerConvId = activeRuntimeTargetConvId(targetConvId);
    if (eventConversationId && ownerConvId && eventConversationId !== ownerConvId) {
      return;
    }
    const ownerRuntime = ownerConvId ? getRuntime(ownerConvId) : null;
    // Stop-before-visualization: drop every late event for the aborted run,
    // including CHAT_FINAL_FOLLOWUP types like run_cancelled that would otherwise
    // rehydrate empty You / Assistant shells.
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
      updateWorldTaskState((state) => (
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
          },
        }));
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
              [event.workflow_node_id]: {
                ...(run.workflowRun?.nodes?.[event.workflow_node_id] || {}),
                status: 'running',
                success: null,
                started_at: event.started_at || event.created_at,
              },
            },
          },
        }));
        break;
      case 'workflow_node_finished':
        updateTaskById(taskId, (run) => ({
          ...run,
          workflowRun: {
            ...(run.workflowRun || {}),
            current_node_id: event.workflow_node_id,
            nodes: {
              ...(run.workflowRun?.nodes || {}),
              [event.workflow_node_id]: {
                ...(run.workflowRun?.nodes?.[event.workflow_node_id] || {}),
                status: event.status || (event.success === false ? 'failed' : 'done'),
                success: event.success !== false,
                summary: event.summary || '',
                error: event.error || '',
                started_at: event.started_at || run.workflowRun?.nodes?.[event.workflow_node_id]?.started_at,
                finished_at: event.finished_at || event.created_at,
                duration_ms: event.duration_ms,
              },
            },
          },
        }));
        break;
      case 'workflow_finished':
      case 'workflow_failed':
        pendingPresentationTaskIdsRef.current.add(taskId);
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
      case 'user_message_received':
        chatFinalizedTaskIdsRef.current.delete(taskId);
        dropPendingSceneItems();
        resetSceneActors();
        updateTaskById(taskId, (run) => ({
          ...run,
          status: 'queued',
          stage: 'assigned',
          loopIndex: 0,
        }));
        break;
      case 'agent_gateway_received':
        updateTaskById(taskId, (run) => ({ ...run, status: 'running', stage: 'in_progress' }));
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
      case 'llm_tool_call_requested': {
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'in_progress',
          loopIndex,
            toolCalls: upsertToolCall(run.toolCalls, event.call_id, {
              callId: event.call_id,
              loopIndex,
            toolGroup: event.tool_group || 'external',
            kind: event.kind || 'tool',
            toolName: event.tool_name || 'unknown',
              executorRole: event.executor_role || null,
              executorActorId: event.executor_actor_id || null,
              skillName: event.skill_name || '',
              skillPath: event.skill_path || '',
            state: 'requested',
            inputSummary: event.input_summary || '',
            toolInput: event.tool_input || null,
            toolResponse: event.tool_response || null,
            toolOutput: event.tool_output || '',
            message: event.message || '',
          }),
          }));
        break;
      }
      case 'tool_manager_received':
      case 'tool_dispatched':
      case 'tool_executor_started':
      case 'tool_executor_completed':
      case 'tool_result_returned':
        updateTaskById(taskId, (run) => {
          const existingToolCall = Array.isArray(run.toolCalls)
            ? run.toolCalls.find((item) => item.callId === event.call_id)
            : null;
          let nextState = event.type === 'tool_manager_received'
            ? 'received'
            : event.type === 'tool_dispatched'
              ? 'dispatched'
              : event.type === 'tool_executor_started'
                ? 'running'
                : event.type === 'tool_executor_completed'
                  ? 'completed'
                  : 'returned';
          const responseState = getToolResponseTraceStatus(event.tool_response, '');
          if (responseState === 'failed') {
            nextState = 'failed';
          } else if (responseState === 'done' && (nextState === 'completed' || nextState === 'returned')) {
            nextState = 'completed';
          }
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
              executorRole: event.executor_role || existingToolCall?.executorRole || event.target || event.actor || null,
              executorActorId: event.executor_actor_id || existingToolCall?.executorActorId || null,
              skillName: event.skill_name || existingToolCall?.skillName || '',
              skillPath: event.skill_path || existingToolCall?.skillPath || '',
              state: nextState,
              // 关键：必须用 existing 值兜底，否则后续事件（tool_manager_received / tool_dispatched 等）
              // 不携带 input_summary 时，patch 里的 undefined 会通过 spread 把已设值覆盖回 undefined。
              inputSummary: event.input_summary || existingToolCall?.inputSummary || '',
              outputSummary: event.output_summary || existingToolCall?.outputSummary || '',
              toolInput: event.tool_input || existingToolCall?.toolInput || null,
              toolResponse: event.tool_response || existingToolCall?.toolResponse || null,
              toolOutput: event.tool_output || existingToolCall?.toolOutput || '',
              message: event.message || existingToolCall?.message || '',
            }),
          };
        });
        break;
      case 'sub_agent_progress_delta':
      case 'sub_agent_answer_delta':
      case 'sub_agent_tool_call_requested':
      case 'sub_agent_tool_executor_completed':
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
      case 'llm_final_answer': {
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
            status: 'done',
            stage: 'done',
            completedAt: run.completedAt || Date.now(),
            loopIndex,
            answerText: readRuntimeAnswerBuffer(),
            presentationPending: false,
            serverFinished: true,
            sceneCatchup: false,
            providerState: run.providerState ? { ...run.providerState, state: 'completed' } : run.providerState,
          }));
          updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
          setRuntimeBusy(false);
          setRuntimeActiveTaskId(null);
          completeTaskAgents(taskId, 'done');
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
      case 'agent_gateway_reported':
        if (isChatOriginTask(taskId, ownerConvId)) {
          chatFinalizedTaskIdsRef.current.add(taskId);
          pendingPresentationTaskIdsRef.current.delete(taskId);
          updateTaskById(taskId, (run) => ({
            ...run,
            status: 'done',
            stage: 'done',
            completedAt: run.completedAt || Date.now(),
            answerText: run.answerText || event.content || readRuntimeAnswerBuffer(),
            presentationPending: false,
            serverFinished: true,
            sceneCatchup: false,
          }));
          updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
          setRuntimeBusy(false);
          setRuntimeActiveTaskId(null);
          setRuntimeFetchController(null);
          dropPendingSceneItems(taskId);
          completeTaskAgents(taskId, 'done');
          break;
        }
        pendingPresentationTaskIdsRef.current.add(taskId);
        updateTaskById(taskId, (run) => ({
          ...run,
          stage: 'check',
          loopIndex,
          answerText: event.content || readRuntimeAnswerBuffer(),
          presentationPending: true,
        }));
        break;
      case 'run_cancelled': {
        pendingPresentationTaskIdsRef.current.delete(taskId);
        chatFinalizedTaskIdsRef.current.add(taskId);
        userCancelledTaskIdsRef.current.add(taskId);
        const existing = getTaskById(taskId, ownerConvId);
        const answerBuffer = String(readRuntimeAnswerBuffer(ownerConvId) || '').trim();
        // Any cancel that never produced agent-visible content must drop both
        // bubbles. Do not require the local cancel-id set: late server task ids
        // after a pending-only Stop may not match the original pending draft id.
        const shouldRollbackEmptyCancel = Boolean(
          !taskHasAssistantStreamContent(existing)
          && !answerBuffer
        );
        if (shouldRollbackEmptyCancel) {
          updateWorldTaskState((state) => {
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
        } else {
          updateTaskById(taskId, (run) => applyTerminalTaskState(run, 'cancelled', { aborted: true }), ownerConvId);
          updateWorldTaskState((state) => ({ ...state, activeTaskId: null }), ownerConvId);
        }
        setRuntimeBusy(false, ownerConvId);
        setRuntimeActiveTaskId(null, ownerConvId);
        setRuntimeFetchController(null, ownerConvId);
        dropPendingSceneItems(taskId);
        resetSceneActors();
        completeTaskAgents(taskId, 'cancelled');
        break;
      }
      case 'run_error':
        pendingPresentationTaskIdsRef.current.delete(taskId);
        chatFinalizedTaskIdsRef.current.add(taskId);
        updateTaskById(taskId, (run) => applyTerminalTaskState(run, 'failed', {
          error: toDisplayText(event.message),
          aborted: false,
        }));
        updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
        setRuntimeBusy(false);
        setRuntimeActiveTaskId(null);
        setRuntimeFetchController(null);
        dropPendingSceneItems(taskId);
        resetSceneActors();
        completeTaskAgents(taskId, 'failed');
        break;
      case 'run_finished':
        const shouldWaitForPresentation = pendingPresentationTaskIdsRef.current.has(taskId)
          || !!getTaskById(taskId)?.presentationPending;
        updateTaskById(taskId, (run) => {
          const hasPresentationPending = pendingPresentationTaskIdsRef.current.has(taskId)
            || !!run.presentationPending;
          const persistedTask = event.task || null;
          const persistedImages = normalizeChatImageRefs(
            persistedTask?.image_attachments || persistedTask?.imageAttachments || [],
            persistedTask?.conversation_id || event.conversation_id || run.conversationId,
            userIdRef.current,
          );
          const terminalStatus = normalizeTaskStatus(
            persistedTask?.status
            || event.status
            || run.status
          );
          const terminalError = persistedTask?.error || run.error;
          const terminalBase = isTerminalTaskStatus(terminalStatus) && terminalStatus !== 'done'
            ? applyTerminalTaskState(run, terminalStatus, {
                error: terminalError,
                aborted: terminalStatus === 'cancelled' ? true : run.aborted,
              })
            : run;
          return {
            ...terminalBase,
            taskId: persistedTask?.task_id || run.taskId,
            conversationId: persistedTask?.conversation_id || event.conversation_id || run.conversationId,
            title: stripChatImageAugmentation(persistedTask?.title || run.title).text || run.title,
            status: terminalStatus,
            stage: terminalStatus === 'done'
              ? (hasPresentationPending ? (persistedTask?.stage || run.stage) : (persistedTask?.stage || 'done'))
              : 'done',
            requestedAgentId: persistedTask?.agent_id || persistedTask?.profile_id || run.requestedAgentId || null,
            requestedWorkflowId: persistedTask?.workflow_id || run.requestedWorkflowId || null,
            executionMode: persistedTask?.execution_mode === 'bot' ? 'bot' : (run.executionMode || 'chat'),
            originViewMode: persistedTask?.execution_mode === 'bot' ? 'world' : (run.originViewMode || 'chat'),
            workflowSnapshot: persistedTask?.workflow_snapshot || run.workflowSnapshot || null,
            profileId: persistedTask?.profile_id || run.profileId || null,
            profileDisplayName: persistedTask?.profile_display_name || run.profileDisplayName || '',
            completedAt: persistedTask?.completed_at
              ? (Date.parse(persistedTask.completed_at) || Date.now())
              : (hasPresentationPending ? run.completedAt : Date.now()),
            sources: Array.isArray(persistedTask?.sources)
              ? persistedTask.sources
              : (Array.isArray(event.sources) ? event.sources : run.sources),
            memory: Array.isArray(persistedTask?.memory)
              ? persistedTask.memory
              : (Array.isArray(event.memory) ? event.memory : run.memory),
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
              : (persistedTask?.answer_text || (terminalStatus === 'done' ? (toDisplayText(event.message) || run.answerText) : run.answerText)),
            error: terminalError,
            serverFinished: true,
            sceneCatchup: hasPresentationPending,
          };
        });
        if (shouldWaitForPresentation && !isChatOriginTask(taskId, ownerConvId)) {
          compactPendingSceneItems(taskId, ownerConvId);
          break;
        }
        updateWorldTaskState((state) => ({ ...state, activeTaskId: null }));
        setRuntimeBusy(false);
        setRuntimeActiveTaskId(null);
        setRuntimeFetchController(null);
        dropPendingSceneItems(taskId);
        resetSceneActors();
        completeTaskAgents(taskId, getTaskById(taskId)?.status || event.status || 'done');
        break;
      default:
        break;
    }

    if (
      (isBotWorkflowTask(taskId, ownerConvId) && WORKFLOW_SCENE_EVENT_TYPES.has(event.type))
      || (!isBotWorkflowTask(taskId, ownerConvId) && WORLD_SCENE_EVENT_TYPES.has(event.type) && !isChatOriginTask(taskId, ownerConvId))
    ) {
      scheduleSceneEvent(event, taskId, ownerConvId);
    }
  }

  async function executeQuest(pendingTask, targetConversationId) {
    const runConversationId = targetConversationId;
    if (!runConversationId) {
      throw new Error('conversation is not ready');
    }
    const runId = pendingTask.id || generateHexId();
    pendingTask.id = runId;
    // Ensure the runtime exists and prime its run-local state.
    mutateRuntime(runConversationId, (rt) => {
      rt.activeRunId = runId;
      rt.cancelledRunIds.delete(runId);
      rt.answerBuffer = '';
      rt.busy = true;
      rt.abortRequested = false;
      rt.shellSeeded = false;
    });
    updateWorldTaskState((state) => ({
      ...state,
      pendingTask: {
        ...pendingTask,
        status: 'running',
        stage: 'assigned',
      },
    }), runConversationId);

    if (pendingTask.attachment?.file && !pendingTask.attachment?.uploaded) {
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
    const response = await authFetch(`${API_BASE}/api/conversations/${runConversationId}/tasks/stream`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({
        message: pendingTask.title,
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
          // Fallback when no per-task choice exists. Matches DEFAULT_REASONING_EFFORT
          // in panels.jsx — kept in sync so request payload mirrors UI default.
          reasoning_effort: pendingTask.requestedReasoningEffort || 'high',
          use_history: true,
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`world stream failed: ${response.status}`);
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
      const previousTarget = streamTargetConvIdRef.current;
      streamTargetConvIdRef.current = runConversationId;
      try {
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
          if (event.task_id && !chatFinalizedTaskIdsRef.current.has(event.task_id)) {
            setRuntimeActiveTaskId(event.task_id, runConversationId);
          }
          applyWorldEvent(event, runConversationId);
        }
      } finally {
        streamTargetConvIdRef.current = previousTarget;
      }
    };
    const queueWorldEvent = (event) => {
      if (STREAM_IMMEDIATE_EVENT_TYPES.has(event.type)) {
        flushQueuedEvents();
        queuedEvents.push(event);
        flushQueuedEvents();
        return;
      }
      queuedEvents.push(event);
      if (!flushTimer) {
        flushTimer = setTimeout(flushQueuedEvents, STREAM_EVENT_BATCH_MS);
      }
    };
    try {
      await readNdjsonStream(response, queueWorldEvent, controller.signal);
    } finally {
      flushQueuedEvents();
      const guardRt = getRuntime(runConversationId);
      if (guardRt && guardRt.fetchController === controller) {
        setRuntimeFetchController(null, runConversationId);
      }
    }
  }

  return {
    readNdjsonStream,
    applyWorldEvent,
    executeQuest,
  };
}
