// @haish-esm
// Extracted from AppShell.jsx (Phase C). Behavior-preserving factory.
export function createConversationHandlers(ctx) {
  const {
    API_BASE,
    DEFAULT_PROJECT_ID,
    DEFAULT_SESSION_NAME,
    activateConversationDetail,
    activateConversationShell,
    applyConversationSnapshot,
    authFetch,
    buildApiHeaders,
    buildDeployRequest,
    calibrationMode,
    canStartDeployForConversation,
    clearAllPoseDebug,
    clearDraftConversationState,
    conversationDetailAbortRef,
    conversationId,
    conversationIdRef,
    createDefaultProject,
    draftConversationRef,
    dragStateRef,
    fetchConversationDetail,
    findConversationById,
    findProjectByConversationId,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    materializeDraftConversationForSend,
    normalizeWorkspaceOrdering,
    now,
    openDraftConversation,
    projectIdForWorkspacePath,
    setActiveTab,
    setCalibrationMode,
    setCopiedCoords,
    setHollow,
    setViewMode,
    setWorkspaceState,
    showToast,
    startDeploy,
    stopConversationRuntimeBeforeDelete,
    viewModeRef,
    withDefaultExpansion,
    workspaceState,
    workspaceStateWithConversationDetail,
  } = ctx;

  async function handleSelectConversation(projectId, nextConversationId) {
    // Leaving an unsent draft discards it without creating a list entry.
    if (
      draftConversationRef.current
      && nextConversationId
      && draftConversationRef.current.id !== nextConversationId
    ) {
      clearDraftConversationState({ clearComposer: true });
    }
    // Activation expands the project only. Conversation task lists are now
    // user-driven via the conversation icon, so selecting a conversation no
    // longer opens its tasks by default.
    const stampActivation = (state) => ({
      ...state,
      activeProjectId: projectId,
      activeConversationId: nextConversationId,
      projects: state.projects.map((project) => {
        if (project.id !== projectId) return project;
        const projectWithExpanded = { ...project, userExpanded: true };
        if (!nextConversationId) return projectWithExpanded;
        return {
          ...projectWithExpanded,
          conversations: project.conversations.map((conversation) => (
            conversation.id === nextConversationId
              ? { ...conversation, userExpanded: false }
              : conversation
          )),
        };
      }),
    });
    const currentConversationId = conversationIdRef.current || conversationId;
    if (!nextConversationId || nextConversationId === currentConversationId) {
      setWorkspaceState((state) => normalizeWorkspaceOrdering(stampActivation(state)));
      return;
    }
    const requestSeq = invalidateConversationActivation();
    setWorkspaceState((state) => normalizeWorkspaceOrdering(stampActivation(state)));
    activateConversationShell(projectId, nextConversationId);
    conversationDetailAbortRef.current?.abort?.();
    const detailController = new AbortController();
    conversationDetailAbortRef.current = detailController;
    try {
      const detail = await fetchConversationDetail(nextConversationId, { signal: detailController.signal });
      if (!isConversationActivationCurrent(requestSeq) || detailController.signal.aborted) return;
      await activateConversationDetail(detail, { activationSeq: requestSeq });
    } catch (error) {
      if (detailController.signal.aborted || error?.name === 'AbortError') return;
      if (isConversationActivationCurrent(requestSeq)) throw error;
    } finally {
      if (conversationDetailAbortRef.current === detailController) {
        conversationDetailAbortRef.current = null;
      }
    }
  }

  async function handleSelectProject(projectId) {
    const project = workspaceState.projects.find((item) => item.id === projectId);
    const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
    const firstConversation = project?.conversations.find((item) => item.executionMode === executionMode);
    if (firstConversation) {
      await handleSelectConversation(projectId, firstConversation.id);
      return;
    }
    await handleAddConversation(projectId);
  }

  function handleToggleProject(projectId) {
    // Persist the user's explicit intent via `userExpanded`. The displayed
    // `expanded` is recomputed by withDefaultExpansion; we flip relative to
    // the currently displayed value so the click does what the user sees.
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => (
        project.id === projectId ? { ...project, userExpanded: !project.expanded } : project
      )),
    }));
  }

  function handleToggleConversation(projectId, nextConversationId) {
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => project.id === projectId ? {
        ...project,
        conversations: project.conversations.map((conversation) => (
          conversation.id === nextConversationId
            ? { ...conversation, userExpanded: !conversation.expanded }
            : conversation
        )),
      } : project),
    }));
  }

  function handleToggleConversationTasks(projectId, nextConversationId) {
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => project.id === projectId ? {
        ...project,
        conversations: project.conversations.map((conversation) => (
          conversation.id === nextConversationId ? { ...conversation, tasksExpanded: !conversation.tasksExpanded } : conversation
        )),
      } : project),
    }));
  }

  function handleToggleProjectConversations(projectId) {
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => project.id === projectId ? {
        ...project,
        conversationsExpanded: !project.conversationsExpanded,
      } : project),
    }));
  }

  function handlePinConversation(projectId, conversationId) {
    // Compute new pin state from current workspace so we can sync to backend
    const currentConversation = findConversationById(workspaceState, conversationId);
    const newPinned = !(currentConversation?.pinned ?? false);

    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => project.id === projectId ? {
        ...project,
        conversations: project.conversations.map((conversation) => (
          conversation.id === conversationId
            ? { ...conversation, pinned: newPinned }
            : conversation
        )),
      } : project),
    }));

    // Fire-and-forget sync to backend so pin survives server restart
    authFetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: buildApiHeaders(),
      body: JSON.stringify({ pinned: newPinned }),
    }).catch(() => {});
  }

  function handleReorderConversations(projectId, sourceId, targetId, position) {
    setWorkspaceState((state) => {
      const nextState = normalizeWorkspaceOrdering({
        ...state,
        projects: state.projects.map((project) => {
          if (project.id !== projectId) return project;
          const conversations = [...project.conversations];
          const sourceIdx = conversations.findIndex((c) => c.id === sourceId);
          if (sourceIdx === -1) return project;
          const [moved] = conversations.splice(sourceIdx, 1);
          let insertIdx;
          if (targetId === null) {
            insertIdx = conversations.length;
          } else {
            const adjustedTargetIdx = conversations.findIndex((c) => c.id === targetId);
            if (adjustedTargetIdx === -1) { conversations.splice(sourceIdx, 0, moved); return project; }
            insertIdx = position === 'after' ? adjustedTargetIdx + 1 : adjustedTargetIdx;
          }
          conversations.splice(insertIdx, 0, moved);
          return { ...project, conversations };
        }),
      });

      // Fire-and-forget sync to backend so manual order survives server restart
      const project = nextState.projects.find((p) => p.id === projectId);
      if (project) {
        const conversationIds = project.conversations.map((c) => c.id);
        authFetch(`${API_BASE}/api/conversations/reorder`, {
          method: 'PATCH',
          headers: buildApiHeaders(),
          body: JSON.stringify({ conversation_ids: conversationIds }),
        }).catch(() => {});
      }

      return nextState;
    });
  }

  function handlePinProject(projectId) {
    // Compute new pin state from current workspace so we can sync to backend
    const currentProject = workspaceState.projects.find((p) => p.id === projectId);
    const newPinned = !(currentProject?.pinned ?? false);

    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => (
        project.id === projectId
          ? { ...project, pinned: newPinned }
          : project
      )),
    }));

    // Sync all conversations in this project to backend as well
    if (currentProject) {
      for (const conversation of (currentProject.conversations || [])) {
        authFetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversation.id)}`, {
          method: 'PATCH',
          headers: buildApiHeaders(),
          body: JSON.stringify({ pinned: newPinned }),
        }).catch(() => {});
      }
    }
  }

  function handleReorderProjects(sourceId, targetId, position) {
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: (() => {
        const projects = [...state.projects];
        const sourceIdx = projects.findIndex((p) => p.id === sourceId);
        if (sourceIdx === -1) return state.projects;
        const [moved] = projects.splice(sourceIdx, 1);
        let insertIdx;
        if (targetId === null) {
          insertIdx = projects.length;
        } else {
          const adjustedTargetIdx = projects.findIndex((p) => p.id === targetId);
          if (adjustedTargetIdx === -1) { projects.splice(sourceIdx, 0, moved); return state.projects; }
          insertIdx = position === 'after' ? adjustedTargetIdx + 1 : adjustedTargetIdx;
        }
        projects.splice(insertIdx, 0, moved);
        return projects;
      })(),
    }));
  }

  async function createConversationInProject(project, title, executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot') {
    const createResponse = await authFetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({ title, execution_mode: executionMode }),
    });
    if (!createResponse.ok) {
      throw new Error(`conversation create failed: ${createResponse.status}`);
    }
    let detail = await createResponse.json();
    if (project?.workspacePath) {
      const updateResponse = await authFetch(`${API_BASE}/api/conversations/${detail.conversation_id}`, {
        method: 'PATCH',
        headers: buildApiHeaders(),
        body: JSON.stringify({ workspace_path: project.workspacePath }),
      });
      if (!updateResponse.ok) {
        throw new Error(`conversation workspace assignment failed: ${updateResponse.status}`);
      }
      detail = await updateResponse.json();
    }
    return detail;
  }

  async function handleAddConversation(projectId) {
    // Open a local blank chat only. The sidebar entry appears when the user
    // actually sends the first message (see materializeDraftConversationForSend).
    openDraftConversation(projectId);
  }

  async function handleAddProject() {
    const requestSeq = invalidateConversationActivation();
    if (window.haish?.pickProjectDirectory) {
      const pickResult = await window.haish.pickProjectDirectory();
      if (pickResult?.canceled || !pickResult?.project) {
        showToast('info', 'workspace selection cancelled');
        return;
      }
      const detail = await createConversationInProject({
        id: projectIdForWorkspacePath(pickResult.project.rootPath),
        type: 'custom',
        name: pickResult.project.name,
        workspacePath: pickResult.project.rootPath,
        workspaceLabel: pickResult.project.name,
      }, DEFAULT_SESSION_NAME);
      if (!isConversationActivationCurrent(requestSeq)) return;
      await activateConversationDetail(detail, { restoreLatest: false });
      showToast('success', `local workspace set: ${pickResult.project.name}`);
      return;
    }
    const createResponse = await authFetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({
        title: DEFAULT_SESSION_NAME,
        execution_mode: viewModeRef.current === 'chat' ? 'chat' : 'bot',
      }),
    });
    if (!createResponse.ok) {
      throw new Error(`project conversation create failed: ${createResponse.status}`);
    }
    const created = await createResponse.json();
    const pickResponse = await authFetch(`${API_BASE}/api/conversations/${created.conversation_id}/workspace/pick`, {
      method: 'POST',
    });
    if (pickResponse.status === 409) {
      await authFetch(`${API_BASE}/api/conversations/${created.conversation_id}`, {
        method: 'DELETE',
      });
      showToast('info', 'workspace selection cancelled');
      return;
    }
    if (!pickResponse.ok) {
      throw new Error(`workspace pick failed: ${pickResponse.status}`);
    }
    const detail = await pickResponse.json();
    if (!detail.workspace_path) {
      await authFetch(`${API_BASE}/api/conversations/${created.conversation_id}`, {
        method: 'DELETE',
      });
      showToast('info', 'workspace selection cancelled');
      return;
    }
    if (!isConversationActivationCurrent(requestSeq)) return;
    await activateConversationDetail(detail, { restoreLatest: false });
  }

  async function handleDeleteConversation(projectId, nextConversationId) {
    const project = workspaceState.projects.find((item) => item.id === projectId);
    if (!project) return;
    const conversationToDelete = project.conversations.find((conversation) => conversation.id === nextConversationId) || null;
    await stopConversationRuntimeBeforeDelete(nextConversationId, conversationToDelete);
    const response = await authFetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
      method: 'DELETE',
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`conversation delete failed: ${response.status}`);
    }
    const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
    let fallbackConversation = project.conversations.find((conversation) => (
      conversation.id !== nextConversationId && conversation.executionMode === executionMode
    ));
    if (!fallbackConversation) {
      const detail = await createConversationInProject(project, project.id === DEFAULT_PROJECT_ID ? DEFAULT_SESSION_NAME : 'New Conversation');
      setWorkspaceState((state) => normalizeWorkspaceOrdering({
        ...state,
        projects: state.projects.map((item) => item.id === projectId ? {
          ...item,
          conversations: item.conversations.filter((conversation) => conversation.id !== nextConversationId),
        } : item),
      }));
      await activateConversationDetail(detail, { restoreLatest: false });
      return;
    }
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((item) => item.id === projectId ? {
        ...item,
        conversations: item.conversations.filter((conversation) => conversation.id !== nextConversationId),
      } : item),
    }));
    if (nextConversationId === conversationId) {
      await handleSelectConversation(projectId, fallbackConversation.id);
    }
  }

  async function handleRenameConversation(projectId, nextConversationId, title) {
    const trimmed = String(title || '').trim();
    if (!trimmed) return;
    const response = await authFetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
      method: 'PATCH',
      headers: buildApiHeaders(),
      body: JSON.stringify({ title: trimmed }),
    });
    if (!response.ok) {
      throw new Error(`conversation rename failed: ${response.status}`);
    }
    const detail = await response.json();
    setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail, false));
    if (nextConversationId === conversationId) {
      applyConversationSnapshot(detail);
    }
  }

  async function handleRemoveProject(projectId) {
    const project = workspaceState.projects.find((item) => item.id === projectId);
    if (!project?.removable) return;
    await Promise.all(project.conversations.map((item) => stopConversationRuntimeBeforeDelete(item.id, item)));
    await Promise.all(project.conversations.map(async (item) => {
      const response = await authFetch(`${API_BASE}/api/conversations/${item.id}`, {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`conversation delete failed: ${response.status}`);
      }
    }));
    const nextState = normalizeWorkspaceOrdering({
      ...workspaceState,
      projects: workspaceState.projects.filter((item) => item.id !== projectId),
      activeProjectId: DEFAULT_PROJECT_ID,
      activeConversationId: null,
    });
    setWorkspaceState(nextState);
    const defaultProject = nextState.projects.find((item) => item.id === DEFAULT_PROJECT_ID) || createDefaultProject();
    const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
    const fallbackConversation = defaultProject.conversations.find((item) => item.executionMode === executionMode);
    if (fallbackConversation) {
      const detail = await fetchConversationDetail(fallbackConversation.id);
      await activateConversationDetail(detail);
    } else {
      const detail = await createConversationInProject(defaultProject, DEFAULT_SESSION_NAME);
      await activateConversationDetail(detail, { restoreLatest: false });
    }
  }

  async function handleToggleViewMode() {
    const nextViewMode = viewModeRef.current === 'chat' ? 'world' : 'chat';
    const nextExecutionMode = nextViewMode === 'chat' ? 'chat' : 'bot';
    viewModeRef.current = nextViewMode;
    setViewMode(nextViewMode);
    setActiveTab('dashboard');
    // Settings overlays the main workspace; leaving via bot/chat must exit it
    // so the corresponding chat/world page is shown instead of staying under settings.
    if (calibrationMode) {
      dragStateRef.current = null;
      clearAllPoseDebug();
      setCalibrationMode(false);
      setCopiedCoords(false);
    }

    const currentConversation = findConversationById(workspaceState, conversationIdRef.current);
    if (currentConversation?.executionMode === nextExecutionMode) return;
    const currentProject = findProjectByConversationId(workspaceState, conversationIdRef.current)
      || workspaceState.projects.find((project) => project.id === workspaceState.activeProjectId)
      || workspaceState.projects[0];
    const matchingConversation = currentProject?.conversations.find(
      (conversation) => conversation.executionMode === nextExecutionMode,
    );
    const detail = matchingConversation
      ? await fetchConversationDetail(matchingConversation.id)
      : await createConversationInProject(
          currentProject,
          currentProject?.id === DEFAULT_PROJECT_ID ? DEFAULT_SESSION_NAME : 'New Conversation',
          nextExecutionMode,
        );
    // The mode toggle is an explicit user choice. Do not let the selected
    // conversation's latest task override it while its detail is restored.
    await activateConversationDetail(detail, { restoreLatest: false });
  }

  function handleOpenTaskReport(task) {
    const restoredMode = task?.executionMode === 'bot' ? 'world' : 'chat';
    viewModeRef.current = restoredMode;
    setViewMode(restoredMode);
    const workflowNodes = Object.entries(task?.workflowRun?.nodes || {}).map(([nodeId, node]) => (
      `${node?.success === false ? '✕' : '✓'} ${nodeId}: ${node?.summary || node?.error || node?.status || ''}`
    ));
    const result = String(task?.answerText || workflowNodes.join('\n') || task?.error || '').trim();
    if (!result) return;
    setHollow({
      title: task?.title || 'Final Report',
      result,
      taskId: task?.taskId || task?.id || null,
    });
  }

  async function handleRetryTask(task) {
    const targetConversationId = task?.conversationId || task?.conversation_id;
    if (!targetConversationId) return;
    if (targetConversationId !== conversationIdRef.current) {
      const detail = await fetchConversationDetail(targetConversationId);
      await activateConversationDetail(detail, { restoreLatest: false });
    }
    const restoredMode = task?.executionMode === 'bot' ? 'world' : 'chat';
    viewModeRef.current = restoredMode;
    setViewMode(restoredMode);
    const selectionId = task?.executionMode === 'bot'
      ? task?.requestedWorkflowId
      : task?.requestedAgentId;
    const request = buildDeployRequest(
      task?.title || '',
      task?.attachment || null,
      task?.requestedModelId || '',
      task?.requestedReasoningEffort || 'high',
      task?.imageAttachments || [],
      selectionId,
      task?.requestedProvider || '',
    );
    request.targetConversationId = targetConversationId;
    if (canStartDeployForConversation(targetConversationId)) startDeploy(request, targetConversationId);
  }


  return {
    handleSelectConversation,
    handleSelectProject,
    handleToggleProject,
    handleToggleConversation,
    handleToggleConversationTasks,
    handleToggleProjectConversations,
    handlePinConversation,
    handleReorderConversations,
    handlePinProject,
    handleReorderProjects,
    createConversationInProject,
    handleAddConversation,
    handleAddProject,
    handleDeleteConversation,
    handleRenameConversation,
    handleRemoveProject,
    handleToggleViewMode,
    handleOpenTaskReport,
    handleRetryTask,
  };
}
