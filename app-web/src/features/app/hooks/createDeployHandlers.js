// @haish-esm
// Extracted from AppShell.jsx (Phase C2). Behavior-preserving factory.
export function createDeployHandlers(ctx) {
  const {
    API_BASE,
    APP_DEFAULT_AGENT_OPTIONS,
    abortRef,
    activeRunIdRef,
    activeTaskIdRef,
    answerBufferRef,
    applyTerminalTaskState,
    authFetch,
    buildApiHeaders,
    busy,
    cancelActiveConversationTask,
    cancelActiveTask,
    chatFinalizedTaskIdsRef,
    clearDraftConversationState,
    completeTaskAgents,
    conversationDetailToWorkspaceConversation,
    conversationError,
    conversationId,
    conversationIdRef,
    conversationReady,
    conversationSelectionPending,
    createEmptyWorldTaskState,
    createPendingTaskDraft,
    defaultAgentId,
    defaultWorkflowId,
    draftConversationRef,
    dropPendingSceneItems,
    executeQuest,
    fetchAbortRef,
    findConversationById,
    flushRuntimeTasksToWorkspace,
    getRuntime,
    isDefaultConversationName,
    isTaskActuallyActive,
    materializeDraftConversationForSend,
    mutateRuntime,
    normalizeWorkflowSettings,
    normalizeWorkspaceOrdering,
    pendingCreatedDetailRef,
    pendingPresentationTaskIdsRef,
    queuedDeploy,
    readRuntimeAnswerBuffer,
    resetSceneActors,
    selectedConversationId,
    setAgentLive,
    setBusy,
    setChatDraft,
    setComposerAttachment,
    setHollow,
    setQueuedDeploy,
    setRuntimeActiveRunId,
    setRuntimeActiveTaskId,
    setRuntimeAnswerBuffer,
    setRuntimeBusy,
    setRuntimeFetchController,
    setUploadState,
    setWorkspaceState,
    showToast,
    streamTargetConvIdRef,
    taskHasAssistantStreamContent,
    taskUpdatedTimestamp,
    titleFromTaskText,
    updateConversationTitle,
    updateTaskById,
    updateWorldTaskState,
    userCancelledTaskIdsRef,
    viewMode,
    viewModeRef,
    workflowSettingsDraft,
    workspaceState,
    workspaceStateWithConversationDetail,
    workspaceStateWithConversationRuntimeTask,
    workspaceStateWithTouchedConversation,
    worldTaskStateRef,
  } = ctx;

  function removeConversationTaskFromWorkspace(convId, taskKey) {
    if (!convId || !taskKey) return;
    setWorkspaceState((state) => {
      let touched = false;
      const projects = state.projects.map((project) => {
        if (!project.conversations.some((conversation) => conversation.id === convId)) return project;
        touched = true;
        const now = Date.now();
        return {
          ...project,
          updatedAt: now,
          conversations: project.conversations.map((conversation) => {
            if (conversation.id !== convId) return conversation;
            const tasks = (Array.isArray(conversation.tasks) ? conversation.tasks : []).filter((task) => {
              const key = task?.taskId || task?.task_id || task?.id;
              return key !== taskKey;
            });
            return { ...conversation, tasks, updatedAt: now };
          }),
        };
      });
      if (!touched) return state;
      return normalizeWorkspaceOrdering({ ...state, projects });
    });
  }

  function handleStop() {
    const queuedRequest = queuedDeploy;
    const hadQueuedDeploy = Boolean(queuedRequest);
    if (hadQueuedDeploy) setQueuedDeploy(null);
    // Stop targets the currently-shown conversation only — other backgrounded
    // conversations continue running. All ref/state reads scope to its runtime.
    const targetConvId = conversationIdRef.current;
    const targetRuntime = targetConvId ? getRuntime(targetConvId) : null;
    const currentTaskState = targetRuntime ? targetRuntime.worldTaskState : worldTaskStateRef.current;
    let taskId = (targetRuntime ? targetRuntime.activeTaskId : activeTaskIdRef.current)
      || currentTaskState.activeTaskId
      || null;
    if (!taskId) {
      const tasksById = currentTaskState.tasksById || {};
      const candidates = Object.values(tasksById).filter((task) => isTaskActuallyActive(task));
      candidates.sort((a, b) => taskUpdatedTimestamp(b) - taskUpdatedTimestamp(a));
      const fallback = candidates[0];
      if (fallback?.taskId) taskId = fallback.taskId;
    }
    const runId = targetRuntime ? targetRuntime.activeRunId : activeRunIdRef.current;
    const controllerToAbort = targetRuntime ? targetRuntime.fetchController : fetchAbortRef.current;
    const runtimeBusy = targetRuntime ? targetRuntime.busy : busy;
    const pendingTask = currentTaskState.pendingTask || null;
    const activeTask = taskId ? (currentTaskState.tasksById?.[taskId] || null) : null;
    const restoreText = String(
      activeTask?.title
      || pendingTask?.title
      || queuedRequest?.text
      || ''
    ).trim();
    // Only agent-visible content (thinking/answer/tool/trace) counts as started.
    // Lifecycle receipts before visualization must still roll the turn back.
    const answerBuffer = String(
      (targetConvId ? readRuntimeAnswerBuffer(targetConvId) : answerBufferRef.current) || ''
    ).trim();
    const hasAssistantOutput = taskHasAssistantStreamContent(activeTask || pendingTask)
      || Boolean(answerBuffer);
    const hasActiveRun = runtimeBusy || taskId || pendingTask || controllerToAbort || hadQueuedDeploy;
    if (!hasActiveRun) return '';
    // Mark abort BEFORE any async cancel / abort side effects so in-flight
    // NDJSON flushes and late applyWorldEvent calls cannot recreate the turn.
    if (targetRuntime) {
      targetRuntime.abortRequested = true;
      if (runId) targetRuntime.cancelledRunIds.add(runId);
    } else {
      abortRef.current = true;
    }
    // Block any in-flight / late SSE from re-materializing this turn.
    if (taskId) {
      userCancelledTaskIdsRef.current.add(taskId);
      chatFinalizedTaskIdsRef.current.add(taskId);
    }
    if (pendingTask?.id) {
      userCancelledTaskIdsRef.current.add(pendingTask.id);
      chatFinalizedTaskIdsRef.current.add(pendingTask.id);
    }
    if (pendingTask?.taskId) {
      userCancelledTaskIdsRef.current.add(pendingTask.taskId);
      chatFinalizedTaskIdsRef.current.add(pendingTask.taskId);
    }
    // Also mark every currently-active task in this conversation, so a pending
    // local draft that later resolves to a server task_id cannot reappear.
    Object.values(currentTaskState.tasksById || {}).forEach((task) => {
      if (!isTaskActuallyActive(task)) return;
      const key = task?.taskId || task?.task_id || task?.id;
      if (!key) return;
      userCancelledTaskIdsRef.current.add(key);
      chatFinalizedTaskIdsRef.current.add(key);
    });
    if (taskId) {
      cancelActiveTask(taskId).catch((error) => {
        console.error('cancel failed', error);
      });
    } else {
      cancelActiveConversationTask(targetConvId).catch((error) => {
        console.error('conversation cancel failed', error);
      });
    }
    controllerToAbort?.abort?.();
    if (taskId) {
      if (hasAssistantOutput) {
        // Assistant already produced visible content: keep the partial turn.
        updateTaskById(taskId, (task) => applyTerminalTaskState(task, 'cancelled', { aborted: true }), targetConvId);
        updateWorldTaskState((state) => ({
          ...state,
          activeTaskId: null,
          pendingTask: null,
          taskOrder: state.taskOrder.includes(taskId) ? state.taskOrder : [...state.taskOrder, taskId],
        }), targetConvId);
      } else {
        // No agent-visible content yet: drop both bubbles and restore composer.
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
        }, targetConvId);
        removeConversationTaskFromWorkspace(targetConvId, taskId);
      }
      dropPendingSceneItems(taskId);
    } else if (pendingTask) {
      const pendingKey = pendingTask.id || pendingTask.taskId || null;
      // Pending-only turns never have agent-visible content yet.
      updateWorldTaskState((state) => ({
        ...state,
        activeTaskId: null,
        pendingTask: null,
      }), targetConvId);
      if (pendingKey) removeConversationTaskFromWorkspace(targetConvId, pendingKey);
      dropPendingSceneItems();
    } else {
      // Queued deploy only — nothing rendered yet; just restore composer text.
      dropPendingSceneItems();
    }
    if (targetConvId) {
      mutateRuntime(targetConvId, (rt) => {
        // Keep abortRequested=true until the next executeQuest starts a fresh run.
        rt.abortRequested = true;
        if (runId) rt.cancelledRunIds.add(runId);
        rt.activeTaskId = null;
        rt.activeRunId = null;
        rt.fetchController = null;
        rt.answerBuffer = '';
        rt.busy = false;
      });
      // Keep sidebar task list in sync after a hard rollback/cancel.
      flushRuntimeTasksToWorkspace(targetConvId);
    } else {
      activeTaskIdRef.current = null;
      activeRunIdRef.current = null;
      fetchAbortRef.current = null;
      answerBufferRef.current = '';
      setBusy(false);
    }
    resetSceneActors();
    return hasAssistantOutput ? '' : restoreText;
  }

  function buildDeployRequest(text, attachment, modelId, reasoningEffort, imageAttachments, selectionId, providerRequest) {
    const sanitizedImageAttachments = Array.isArray(imageAttachments)
      ? imageAttachments
          .filter((ref) => ref && ref.image_id && ref.path)
          .map((ref) => ({
            image_id: ref.image_id,
            path: ref.path,
            mime: ref.mime || null,
            previewUrl: ref.previewUrl || null,
          }))
      : [];
    return {
      id: `queued-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      text,
      attachment,
      modelId,
      reasoningEffort,
      imageAttachments: sanitizedImageAttachments,
      executionMode: viewModeRef.current === 'chat' ? 'chat' : 'bot',
      agentId: viewModeRef.current === 'chat' ? selectionId : null,
      workflowId: viewModeRef.current === 'chat' ? null : selectionId,
      providerRequest: providerRequest || '',
      targetConversationId: selectedConversationId || conversationIdRef.current || conversationId || null,
    };
  }

  function canStartDeployForConversation(targetConversationId = null) {
    const activeConversationId = conversationIdRef.current || conversationId;
    if (!conversationReady || conversationSelectionPending || conversationError) return false;
    // Draft chats are ready for the first send even though they have no list entry yet.
    if (draftConversationRef.current) {
      if (!targetConversationId) return true;
      return targetConversationId === draftConversationRef.current.id
        || targetConversationId === pendingCreatedDetailRef.current?.conversation_id
        || targetConversationId === activeConversationId;
    }
    if (!activeConversationId) return false;
    return !targetConversationId || activeConversationId === targetConversationId;
  }

  function startDeploy(request, deployConvId, seedDetail = null) {
    if (!deployConvId) return;
    const text = request.text;
    const attachment = request.attachment || null;
    const modelId = request.modelId || '';
    const reasoningEffort = request.reasoningEffort || 'high';
    const executionMode = request.executionMode === 'bot' ? 'bot' : 'chat';
    const agentId = executionMode === 'chat'
      ? (request.agentId || defaultAgentId || APP_DEFAULT_AGENT_OPTIONS[0].id)
      : null;
    const workflowId = executionMode === 'bot'
      ? (request.workflowId || defaultWorkflowId)
      : null;
    const sanitizedImageAttachments = Array.isArray(request.imageAttachments) ? request.imageAttachments : [];
    const pendingTask = createPendingTaskDraft(text, attachment, sanitizedImageAttachments);
    pendingTask.requestedModelId = modelId || '';
    pendingTask.requestedAgentId = agentId;
    pendingTask.requestedWorkflowId = workflowId;
    pendingTask.executionMode = executionMode;
    if (executionMode === 'bot') {
      const workflows = normalizeWorkflowSettings(workflowSettingsDraft);
      pendingTask.workflowSnapshot = [...workflows.presets, ...workflows.custom]
        .find((item) => item.workflow_id === workflowId) || null;
    }
    // Match DEFAULT_REASONING_EFFORT in panels.jsx (kept in sync).
    pendingTask.requestedReasoningEffort = reasoningEffort || 'high';
    pendingTask.requestedProvider = request.providerRequest || '';
    pendingTask.originViewMode = viewModeRef.current || viewMode;
    pendingTask.imageAttachments = sanitizedImageAttachments;
    const nextConversationTitle = titleFromTaskText(text);
    const currentConversation = findConversationById(workspaceState, deployConvId)
      || (seedDetail ? conversationDetailToWorkspaceConversation(seedDetail) : null);
    const deployTaskState = getRuntime(deployConvId)?.worldTaskState
      || worldTaskStateRef.current
      || createEmptyWorldTaskState();
    const shouldUpdateConversationTitle = Boolean(
      nextConversationTitle
      && currentConversation
      && isDefaultConversationName(currentConversation.name)
      && (currentConversation.tasks || []).length === 0
    );
    setComposerAttachment(null);
    setWorkspaceState((state) => {
      let nextState = state;
      // First message on a just-materialized draft may race the previous
      // setWorkspaceState; seed the conversation row from the create payload.
      if (seedDetail?.conversation_id && !findConversationById(nextState, deployConvId)) {
        nextState = workspaceStateWithConversationDetail(nextState, seedDetail, true);
      }
      const currentTasks = [
        ...deployTaskState.taskOrder
          .map((taskId) => deployTaskState.tasksById[taskId])
          .filter(Boolean),
        pendingTask,
      ];
      return workspaceStateWithTouchedConversation(nextState, deployConvId, {
        tasks: currentTasks,
        agentId: pendingTask.requestedAgentId || undefined,
        // No explicit `expanded`: the touched conversation becomes active and
        // withDefaultExpansion auto-expands the active conversation with tasks.
        name: shouldUpdateConversationTitle ? nextConversationTitle : undefined,
        title: shouldUpdateConversationTitle ? nextConversationTitle : undefined,
      });
    });
    if (shouldUpdateConversationTitle) {
      updateConversationTitle(deployConvId, nextConversationTitle)
        .then((detail) => {
          if (detail) {
            setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail, false));
          }
        })
        .catch((error) => console.warn('conversation title update skipped:', error));
    }
    updateWorldTaskState((state) => ({
      ...state,
      pendingTask,
    }), deployConvId);
    executeQuest(pendingTask, deployConvId).catch((error) => {
      // The failure belongs to the conversation that owns this pendingTask,
      // not whichever conversation is currently shown.
      const deployRuntime = getRuntime(deployConvId);
      if (deployRuntime && deployRuntime.activeRunId !== pendingTask.id) {
        return;
      }
      const deployAborted = deployRuntime ? deployRuntime.abortRequested : abortRef.current;
      if (deployAborted || error?.name === 'AbortError') {
        return;
      }
      console.error(error);
      const errorMessage = String(error?.message || error);
      const ownedTaskId = deployRuntime ? deployRuntime.activeTaskId : activeTaskIdRef.current;
      if (ownedTaskId) {
        chatFinalizedTaskIdsRef.current.add(ownedTaskId);
        updateTaskById(ownedTaskId, (task) => ({
          ...applyTerminalTaskState(task, 'failed', {
            error: errorMessage,
            aborted: false,
          }),
        }), deployConvId);
        updateWorldTaskState((state) => ({ ...state, activeTaskId: null }), deployConvId);
      } else {
        updateWorldTaskState((state) => ({
          ...state,
          pendingTask: state.pendingTask
            ? applyTerminalTaskState(state.pendingTask, 'failed', {
                error: errorMessage,
                aborted: false,
              })
            : null,
        }), deployConvId);
      }
      setRuntimeBusy(false, deployConvId);
      if (ownedTaskId) {
        dropPendingSceneItems(ownedTaskId);
      } else {
        dropPendingSceneItems();
      }
      resetSceneActors();
      if (ownedTaskId) {
        completeTaskAgents(ownedTaskId, 'failed');
      }
      setRuntimeActiveTaskId(null, deployConvId);
      setRuntimeActiveRunId(null, deployConvId);
      setRuntimeFetchController(null, deployConvId);
    });
  }

  function handleDeploy(text, attachment, modelId, reasoningEffort, imageAttachments, agentId, providerRequest) {
    const request = buildDeployRequest(text, attachment, modelId, reasoningEffort, imageAttachments, agentId, providerRequest);
    const activeId = conversationIdRef.current || conversationId;
    // First send on a local draft: create the server conversation, insert the
    // sidebar record, then continue the normal deploy path.
    if (draftConversationRef.current) {
      if (!canStartDeployForConversation(request.targetConversationId)) {
        setQueuedDeploy(request);
        return;
      }
      materializeDraftConversationForSend(request)
        .then((materialized) => {
          const realConversationId = materialized?.id || null;
          if (!realConversationId) return;
          request.targetConversationId = realConversationId;
          if (!canStartDeployForConversation(realConversationId)) {
            setQueuedDeploy(request);
            return;
          }
          startDeploy(request, realConversationId, materialized?.detail || null);
        })
        .catch((error) => {
          console.error('draft conversation create failed', error);
          showToast('error', String(error?.message || error));
        });
      return;
    }
    const deployConvId = activeId;
    if (!canStartDeployForConversation(request.targetConversationId)) {
      setQueuedDeploy(request);
      return;
    }
    startDeploy(request, deployConvId);
  }

  return {
    removeConversationTaskFromWorkspace,
    handleStop,
    buildDeployRequest,
    canStartDeployForConversation,
    startDeploy,
    handleDeploy,
  };
}
