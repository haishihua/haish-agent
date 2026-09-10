import { finalWorkflowResultText } from '../../tasks/model/runtime-events.js';

export function createConversationHandlers(ctx) {
  const {
    API_BASE,
    DEFAULT_SESSION_NAME,
    activateConversationDetail,
    activateConversationShell,
    applyConversationSnapshot,
    apiFetch,
    buildApiHeaders,
    buildDeployRequest,
    conversationReorderChainsRef,
    conversationReorderVersionsRef,
    projectReorderChainRef,
    projectReorderVersionRef,
    settingsMode,
    canStartDeployForConversation,
    clearDraftConversationState,
    conversationDetailAbortRef,
    conversationId,
    conversationIdRef,
    createDefaultProject,
    draftConversationRef,
    fetchConversationDetail,
    findConversationById,
    findProjectByConversationId,
    getRuntime,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    modeLocationRef,
    normalizeWorkspaceOrdering,
    openDraftConversation,
    replaceWorkspaceModeFromProjects,
    setActiveTab,
    setSettingsMode,
    setHollow,
    setViewMode,
    setWorkspaceState,
    showToast,
    startDeploy,
    executeQuest,
    stopConversationRuntimeBeforeDelete,
    taskUpdatedTimestamp,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
  } = ctx;

  function conversationRuntimeIsCurrent(targetConversationId) {
    const conversation = findConversationById(workspaceState, targetConversationId);
    const runtime = getRuntime(targetConversationId);
    if (!conversation || !runtime || runtime.shellSeeded) return false;
    if (runtime.busy || runtime.activeRunId || runtime.fetchController) return true;
    const summaries = Array.isArray(conversation.tasks) ? conversation.tasks : [];
    const state = runtime.taskRuntimeState;
    if (summaries.length !== state.taskOrder.length) return false;
    return summaries.every((summary) => {
      const taskId = summary.taskId || summary.id || summary.task_id;
      const task = state.tasksById[taskId];
      return Boolean(
        task?.runtimeHydrated
        && taskUpdatedTimestamp(task) === taskUpdatedTimestamp(summary)
      );
    });
  }

  async function restoreProjectsFromBackend(error, fallbackState) {
    showToast('error', error?.message || 'project update failed');
    try {
      const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
      const response = await apiFetch(
        `${API_BASE}/api/projects?execution_mode=${executionMode}`,
        { method: 'GET' },
      );
      if (!response.ok) throw new Error(`project reload failed: ${response.status}`);
      const payload = await response.json();
      const projects = Array.isArray(payload?.projects) ? payload.projects : [];
      setWorkspaceState((state) => replaceWorkspaceModeFromProjects(
        executionMode,
        projects,
        state,
      ));
    } catch (reloadError) {
      if (fallbackState) setWorkspaceState(fallbackState);
      console.warn('project reload failed:', reloadError);
    }
  }

  async function loadAndActivateConversation({
    projectId,
    conversationId: targetConversationId,
    activationSeq = invalidateConversationActivation(),
    switchShell = true,
    restoreLatest = true,
  }) {
    if (!targetConversationId) throw new Error('conversation activation requires a conversation id');
    // Cached runtimes skip detail hydration, so selection must move with the shell.
    setWorkspaceState((state) => (
      state.activeProjectId === projectId && state.activeConversationId === targetConversationId
        ? state
        : { ...state, activeProjectId: projectId, activeConversationId: targetConversationId }
    ));
    if (switchShell) activateConversationShell(projectId, targetConversationId);
    if (conversationRuntimeIsCurrent(targetConversationId)) return null;
    conversationDetailAbortRef.current?.abort?.();
    const controller = new AbortController();
    conversationDetailAbortRef.current = controller;
    try {
      const detail = await fetchConversationDetail(targetConversationId, { signal: controller.signal });
      if (!isConversationActivationCurrent(activationSeq) || controller.signal.aborted) return null;
      await activateConversationDetail(detail, {
        activationSeq,
        restoreLatest,
        signal: controller.signal,
      });
      return detail;
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') return null;
      if (isConversationActivationCurrent(activationSeq)) throw error;
      return null;
    } finally {
      if (conversationDetailAbortRef.current === controller) {
        conversationDetailAbortRef.current = null;
      }
    }
  }

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
        const projectWithExpanded = { ...project, userExpanded: true, chatConversationsExpanded: true };
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
    await loadAndActivateConversation({
      projectId,
      conversationId: nextConversationId,
      activationSeq: requestSeq,
    });
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

  function handleToggleProjectConversations(projectId, workflowTaskMode = false) {
    const expandedKey = workflowTaskMode ? 'workflowTasksExpanded' : 'chatConversationsExpanded';
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((project) => project.id === projectId ? {
        ...project,
        [expandedKey]: !project[expandedKey],
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

    apiFetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'PATCH',
      headers: buildApiHeaders(),
      body: JSON.stringify({ pinned: newPinned }),
    }).then((response) => {
      if (!response.ok) throw new Error(`conversation pin failed: ${response.status}`);
    }).catch((error) => {
      setWorkspaceState((state) => normalizeWorkspaceOrdering({
        ...state,
        projects: state.projects.map((project) => project.id === projectId ? {
          ...project,
          conversations: project.conversations.map((conversation) => (
            conversation.id === conversationId
              ? { ...conversation, pinned: !newPinned }
              : conversation
          )),
        } : project),
      }));
      showToast('error', error.message || 'conversation pin failed');
    });
  }

  function handleReorderConversations(projectId, sourceId, targetId, position) {
    const manualOrderAt = Date.now();
    setWorkspaceState((state) => {
      const previousState = state;
      const sourcePinned = Boolean(
        state.projects
          .find((project) => project.id === projectId)
          ?.conversations.find((conversation) => conversation.id === sourceId)?.pinned,
      );
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
            const sameGroupIndexes = conversations.flatMap((conversation, index) => (
              Boolean(conversation.pinned) === sourcePinned ? [index] : []
            ));
            insertIdx = sameGroupIndexes.length
              ? sameGroupIndexes[sameGroupIndexes.length - 1] + 1
              : (sourcePinned ? 0 : conversations.length);
          } else {
            const target = conversations.find((conversation) => conversation.id === targetId);
            if (!target || Boolean(target.pinned) !== sourcePinned) {
              conversations.splice(sourceIdx, 0, moved);
              return project;
            }
            const adjustedTargetIdx = conversations.findIndex((c) => c.id === targetId);
            if (adjustedTargetIdx === -1) { conversations.splice(sourceIdx, 0, moved); return project; }
            insertIdx = position === 'after' ? adjustedTargetIdx + 1 : adjustedTargetIdx;
          }
          conversations.splice(insertIdx, 0, moved);
          let groupIndex = 0;
          return {
            ...project,
            conversations: conversations.map((conversation) => (
              Boolean(conversation.pinned) === sourcePinned
                ? { ...conversation, sortOrder: groupIndex++, manualOrderAt }
                : conversation
            )),
          };
        }),
      });

      // Serialize requests per project so rapid drags reach the backend in user order.
      const project = nextState.projects.find((p) => p.id === projectId);
      if (project) {
        const conversationIds = project.conversations
          .filter((conversation) => Boolean(conversation.pinned) === sourcePinned)
          .map((conversation) => conversation.id);
        const requestVersion = (conversationReorderVersionsRef.current.get(projectId) || 0) + 1;
        conversationReorderVersionsRef.current.set(projectId, requestVersion);
        const previousChain = conversationReorderChainsRef.current.get(projectId) || Promise.resolve();
        const request = previousChain
          .catch(() => undefined)
          .then(async () => {
            const response = await apiFetch(
              `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/conversations/reorder`,
              {
                method: 'PATCH',
                headers: buildApiHeaders(),
                body: JSON.stringify({
                  conversation_ids: conversationIds,
                  pinned: sourcePinned,
                }),
              },
            );
            if (!response.ok) throw new Error(`conversation reorder failed: ${response.status}`);
          });
        conversationReorderChainsRef.current.set(projectId, request);
        request.catch((error) => {
          if (conversationReorderVersionsRef.current.get(projectId) !== requestVersion) return;
          restoreProjectsFromBackend(error, previousState);
        }).finally(() => {
          if (conversationReorderChainsRef.current.get(projectId) === request) {
            conversationReorderChainsRef.current.delete(projectId);
          }
        });
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

    apiFetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      headers: buildApiHeaders(),
      body: JSON.stringify({ pinned: newPinned }),
    }).then((response) => {
      if (!response.ok) throw new Error(`project pin failed: ${response.status}`);
    }).catch((error) => {
      setWorkspaceState((state) => normalizeWorkspaceOrdering({
        ...state,
        projects: state.projects.map((project) => (
          project.id === projectId ? { ...project, pinned: !newPinned } : project
        )),
      }));
      showToast('error', error.message || 'project pin failed');
    });
  }

  function handleReorderProjects(sourceId, targetId, position) {
    setWorkspaceState((state) => {
      const previousState = state;
      const sourceProject = state.projects.find((project) => project.id === sourceId);
      const targetProject = targetId
        ? state.projects.find((project) => project.id === targetId)
        : null;
      const sourcePinned = Boolean(sourceProject?.pinned);
      if (
        !sourceProject
        || (targetProject && targetProject.executionMode !== sourceProject.executionMode)
        || (targetProject && Boolean(targetProject.pinned) !== sourcePinned)
      ) {
        return state;
      }
      const nextState = normalizeWorkspaceOrdering({
        ...state,
        projects: (() => {
          const projects = [...state.projects];
          const sourceIdx = projects.findIndex((p) => p.id === sourceId);
          if (sourceIdx === -1) return state.projects;
          const [moved] = projects.splice(sourceIdx, 1);
          let insertIdx;
          if (targetId === null) {
            const sameGroupIndexes = projects.flatMap((project, index) => (
              Boolean(project.pinned) === sourcePinned ? [index] : []
            ));
            insertIdx = sameGroupIndexes.length
              ? sameGroupIndexes[sameGroupIndexes.length - 1] + 1
              : (sourcePinned ? 0 : projects.length);
          } else {
            const adjustedTargetIdx = projects.findIndex((p) => p.id === targetId);
            if (adjustedTargetIdx === -1) { projects.splice(sourceIdx, 0, moved); return state.projects; }
            insertIdx = position === 'after' ? adjustedTargetIdx + 1 : adjustedTargetIdx;
          }
          projects.splice(insertIdx, 0, moved);
          return projects.map((project, index) => ({
            ...project,
            sortOrder: index,
          }));
        })(),
      });
      const requestVersion = projectReorderVersionRef.current + 1;
      projectReorderVersionRef.current = requestVersion;
      projectReorderChainRef.current = projectReorderChainRef.current
        .catch(() => undefined)
        .then(async () => {
          const response = await apiFetch(`${API_BASE}/api/projects/reorder`, {
            method: 'PATCH',
            headers: buildApiHeaders(),
            body: JSON.stringify({
              execution_mode: sourceProject.executionMode,
              project_ids: nextState.projects
                .filter((project) => project.executionMode === sourceProject.executionMode)
                .map((project) => project.id),
            }),
          });
          if (!response.ok) throw new Error(`project reorder failed: ${response.status}`);
        });
      projectReorderChainRef.current.catch((error) => {
        if (projectReorderVersionRef.current !== requestVersion) return;
        restoreProjectsFromBackend(error, previousState);
      });
      return nextState;
    });
  }

  async function createConversationInProject(project, title, executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot') {
    if (!project?.id || project.executionMode !== executionMode) {
      throw new Error('Conversation execution mode must match project execution mode.');
    }
    const createResponse = await apiFetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({ title, execution_mode: executionMode, project_id: project.id }),
    });
    if (!createResponse.ok) {
      throw new Error(`conversation create failed: ${createResponse.status}`);
    }
    let detail = await createResponse.json();
    if (project?.workspacePath && !detail.workspace_path) {
      const updateResponse = await apiFetch(`${API_BASE}/api/conversations/${detail.conversation_id}`, {
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
      const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
      const projectResponse = await apiFetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: buildApiHeaders(),
        body: JSON.stringify({
          name: pickResult.project.name,
          workspace_path: pickResult.project.rootPath,
          execution_mode: executionMode,
        }),
      });
      if (!projectResponse.ok) {
        throw new Error(`project create failed: ${projectResponse.status}`);
      }
      const project = await projectResponse.json();
      setWorkspaceState((state) => normalizeWorkspaceOrdering({
        ...state,
        projects: state.projects.some((item) => item.id === project.project_id)
          ? state.projects
          : [{
              id: project.project_id,
              type: 'custom',
              executionMode: project.execution_mode,
              name: project.name,
              workspacePath: project.workspace_path,
              workspaceLabel: project.name,
              removable: true,
              createdAt: project.created_at || null,
              updatedAt: project.updated_at || null,
              pinned: Boolean(project.pinned),
              sortOrder: typeof project.sort_order === 'number' ? project.sort_order : 0,
              chatConversationsExpanded: false,
              workflowTasksExpanded: false,
              hiddenModes: [],
              conversations: [],
            },
            ...state.projects.map((item) => ({
              ...item,
              sortOrder: (item.sortOrder ?? 0) + 1,
            }))],
      }));
      const detail = await createConversationInProject({
        id: project.project_id,
        type: 'custom',
        executionMode: project.execution_mode,
        name: project.name,
        workspacePath: project.workspace_path,
        workspaceLabel: project.name,
      }, DEFAULT_SESSION_NAME);
      if (!isConversationActivationCurrent(requestSeq)) return;
      await activateConversationDetail(detail, { restoreLatest: false });
      showToast('success', `local workspace set: ${pickResult.project.name}`);
      return;
    }
    const createResponse = await apiFetch(`${API_BASE}/api/conversations`, {
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
    const pickResponse = await apiFetch(`${API_BASE}/api/conversations/${created.conversation_id}/workspace/pick`, {
      method: 'POST',
    });
    if (pickResponse.status === 409) {
      await apiFetch(`${API_BASE}/api/conversations/${created.conversation_id}`, {
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
      await apiFetch(`${API_BASE}/api/conversations/${created.conversation_id}`, {
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
    const response = await apiFetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
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
      const detail = await createConversationInProject(project, project.type === 'system' ? DEFAULT_SESSION_NAME : 'New Conversation');
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
    const response = await apiFetch(`${API_BASE}/api/conversations/${nextConversationId}`, {
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
    const executionMode = project.executionMode;
    const conversationsToRemove = project.conversations;
    await Promise.all(conversationsToRemove.map((item) => stopConversationRuntimeBeforeDelete(item.id, item)));
    await Promise.all(conversationsToRemove.map(async (item) => {
      const response = await apiFetch(`${API_BASE}/api/conversations/${item.id}`, {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`conversation delete failed: ${response.status}`);
      }
    }));
    const projectResponse = await apiFetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
    if (!projectResponse.ok && projectResponse.status !== 404) {
      throw new Error(`project delete failed: ${projectResponse.status}`);
    }
    const nextState = normalizeWorkspaceOrdering({
      ...workspaceState,
      projects: workspaceState.projects.filter((item) => item.id !== projectId),
      activeProjectId: null,
      activeConversationId: null,
    });
    setWorkspaceState(nextState);
    const defaultProject = nextState.projects.find((item) => (
      item.type === 'system' && item.executionMode === executionMode
    )) || createDefaultProject(executionMode);
    const fallbackConversation = defaultProject.conversations[0];
    if (fallbackConversation) {
      const detail = await fetchConversationDetail(fallbackConversation.id);
      await activateConversationDetail(detail);
    } else {
      const detail = await createConversationInProject(defaultProject, DEFAULT_SESSION_NAME);
      await activateConversationDetail(detail, { restoreLatest: false });
    }
  }

  function handleToggleViewMode() {
    const requestSeq = invalidateConversationActivation();
    conversationDetailAbortRef.current?.abort?.();
    conversationDetailAbortRef.current = null;
    const currentViewMode = viewModeRef.current === 'chat' ? 'chat' : 'workflow';
    const nextViewMode = currentViewMode === 'chat' ? 'workflow' : 'chat';
    const nextExecutionMode = nextViewMode === 'chat' ? 'chat' : 'bot';
    const currentConversation = findConversationById(workspaceState, conversationIdRef.current);
    const outgoingProject = findProjectByConversationId(workspaceState, conversationIdRef.current);
    if (currentConversation && outgoingProject) {
      modeLocationRef.current[currentViewMode] = {
        projectId: outgoingProject.id,
        conversationId: currentConversation.id,
      };
    }

    viewModeRef.current = nextViewMode;
    setViewMode(nextViewMode);
    setActiveTab('dashboard');
    if (settingsMode) setSettingsMode(false);

    const rememberedLocation = modeLocationRef.current[nextViewMode];
    const rememberedConversation = rememberedLocation?.conversationId
      ? findConversationById(workspaceState, rememberedLocation.conversationId)
      : null;
    const rememberedProject = rememberedConversation?.executionMode === nextExecutionMode
      ? findProjectByConversationId(workspaceState, rememberedConversation.id)
      : null;
    const matchingPathProject = workspaceState.projects.find((project) => (
      project.executionMode === nextExecutionMode
      && project.workspacePath === outgoingProject?.workspacePath
    ));
    const currentProject = rememberedProject
      || matchingPathProject
      || workspaceState.projects.find((project) => (
        project.type === 'system' && project.executionMode === nextExecutionMode
      ));
    if (!currentProject) {
      throw new Error(`Missing ${nextExecutionMode} project in workspace state.`);
    }
    const matchingConversation = rememberedProject
      ? rememberedConversation
      : currentProject.conversations.find(
          (conversation) => conversation.executionMode === nextExecutionMode,
        );
    if (!matchingConversation) {
      openDraftConversation(currentProject.id);
      return;
    }

    const targetConversationId = matchingConversation.id;
    modeLocationRef.current[nextViewMode] = {
      projectId: currentProject.id,
      conversationId: targetConversationId,
    };
    activateConversationShell(currentProject.id, targetConversationId);
    const activationPromise = loadAndActivateConversation({
      projectId: currentProject.id,
      conversationId: targetConversationId,
      activationSeq: requestSeq,
      switchShell: false,
    });
    void activationPromise.catch((error) => {
      if (!isConversationActivationCurrent(requestSeq)) return;
      console.error('mode conversation activation failed', error);
      showToast('error', String(error?.message || error));
    });
  }

  function handleOpenTaskReport(task) {
    const restoredMode = task?.executionMode === 'bot' ? 'workflow' : 'chat';
    viewModeRef.current = restoredMode;
    setViewMode(restoredMode);
    const workflowNodes = Object.entries(task?.workflowRun?.nodes || {}).map(([nodeId, node]) => (
      `${node?.success === false ? '✕' : '✓'} ${nodeId}: ${node?.summary || node?.error || node?.status || ''}`
    ));
    const result = finalWorkflowResultText(
      task,
      task?.answerText || workflowNodes.join('\n') || task?.error || '',
    );
    if (!result) return;
    setHollow({
      title: task?.title || 'Final Report',
      result,
      taskId: task?.taskId || task?.id || null,
    });
  }

  async function handleForkMessage(message) {
    const response = await apiFetch(`${API_BASE}/api/conversations/${message.conversationId}/fork`, {
      method: 'POST', headers: buildApiHeaders(),
      body: JSON.stringify({ from_message_id: message.messageId }),
    });
    const detail = await response.json();
    if (!response.ok) throw new Error(detail.detail || 'Cannot fork conversation.');
    setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail, true));
    await activateConversationDetail(detail, { restoreLatest: false });
  }

  async function handleRetryTask(task, editedMessage = null) {
    const targetConversationId = task?.conversationId || task?.conversation_id;
    if (!targetConversationId) throw new Error('Conversation is unavailable. Your changes have not been sent.');
    if ((task?.userMessageId || task?.user_message_id) && executeQuest) {
      if (!canStartDeployForConversation(targetConversationId)) throw new Error('Conversation is still loading. Your changes have not been sent.');
      const source = getRuntime(targetConversationId)?.taskRuntimeState?.tasksById?.[task.taskId || task.task_id || task.id] || task;
      return executeQuest(source, targetConversationId, {
        attempt: editedMessage == null ? 'rerun' : 'edit',
        message: editedMessage,
        requestId: crypto.randomUUID(),
      });
    }
    if (targetConversationId !== conversationIdRef.current) {
      await loadAndActivateConversation({
        projectId: findProjectByConversationId(workspaceState, targetConversationId)?.id,
        conversationId: targetConversationId,
        restoreLatest: false,
      });
    }
    const restoredMode = task?.executionMode === 'bot' ? 'workflow' : 'chat';
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
    handleForkMessage,
  };
}
