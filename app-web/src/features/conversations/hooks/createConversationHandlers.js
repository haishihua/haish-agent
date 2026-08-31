import { finalWorkflowResultText } from '../../tasks/model/runtime-events.js';

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
    buildWorkspaceStateFromProjects,
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
    invalidateConversationActivation,
    isConversationActivationCurrent,
    modeLocationRef,
    normalizeWorkspaceOrdering,
    openDraftConversation,
    removeProjectModeFromWorkspace,
    setActiveTab,
    setSettingsMode,
    setHollow,
    setViewMode,
    setWorkspaceState,
    showToast,
    startDeploy,
    stopConversationRuntimeBeforeDelete,
    viewModeRef,
    viewModeTogglePromiseRef,
    workspaceState,
    workspaceStateWithConversationDetail,
  } = ctx;

  async function restoreProjectsFromBackend(error, fallbackState) {
    showToast('error', error?.message || 'project update failed');
    try {
      const response = await authFetch(`${API_BASE}/api/projects`, {
        method: 'GET',
      });
      if (!response.ok) throw new Error(`project reload failed: ${response.status}`);
      const payload = await response.json();
      const projects = Array.isArray(payload?.projects) ? payload.projects : [];
      setWorkspaceState((state) => buildWorkspaceStateFromProjects(projects, state));
    } catch (reloadError) {
      if (fallbackState) setWorkspaceState(fallbackState);
      console.warn('project reload failed:', reloadError);
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

    authFetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}`, {
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
                ? { ...conversation, sortOrder: groupIndex++ }
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
            const response = await authFetch(
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

    authFetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`, {
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
      if (!sourceProject || (targetProject && Boolean(targetProject.pinned) !== sourcePinned)) {
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
          const response = await authFetch(`${API_BASE}/api/projects/reorder`, {
            method: 'PATCH',
            headers: buildApiHeaders(),
            body: JSON.stringify({ project_ids: nextState.projects.map((project) => project.id) }),
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
    const createResponse = await authFetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({ title, execution_mode: executionMode, project_id: project?.id || DEFAULT_PROJECT_ID }),
    });
    if (!createResponse.ok) {
      throw new Error(`conversation create failed: ${createResponse.status}`);
    }
    let detail = await createResponse.json();
    if (project?.workspacePath && !detail.workspace_path) {
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
      const projectResponse = await authFetch(`${API_BASE}/api/projects`, {
        method: 'POST',
        headers: buildApiHeaders(),
        body: JSON.stringify({
          name: pickResult.project.name,
          workspace_path: pickResult.project.rootPath,
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
        name: project.name,
        workspacePath: project.workspace_path,
        workspaceLabel: project.name,
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
    const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
    const conversationsToRemove = project.conversations.filter(
      (item) => item.executionMode === executionMode,
    );
    await Promise.all(conversationsToRemove.map((item) => stopConversationRuntimeBeforeDelete(item.id, item)));
    await Promise.all(conversationsToRemove.map(async (item) => {
      const response = await authFetch(`${API_BASE}/api/conversations/${item.id}`, {
        method: 'DELETE',
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`conversation delete failed: ${response.status}`);
      }
    }));
    let nextState = removeProjectModeFromWorkspace(workspaceState, projectId, executionMode);
    if (!nextState.projects.some((item) => item.id === projectId)) {
      const projectResponse = await authFetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      });
      if (!projectResponse.ok && projectResponse.status !== 404) {
        throw new Error(`project delete failed: ${projectResponse.status}`);
      }
      nextState = {
        ...nextState,
        projects: nextState.projects.filter((item) => item.id !== projectId),
      };
    }
    setWorkspaceState(nextState);
    const defaultProject = nextState.projects.find((item) => item.id === DEFAULT_PROJECT_ID) || createDefaultProject();
    const fallbackConversation = defaultProject.conversations.find((item) => item.executionMode === executionMode);
    if (fallbackConversation) {
      const detail = await fetchConversationDetail(fallbackConversation.id);
      await activateConversationDetail(detail);
    } else {
      const detail = await createConversationInProject(defaultProject, DEFAULT_SESSION_NAME);
      await activateConversationDetail(detail, { restoreLatest: false });
    }
  }

  async function performToggleViewMode() {
    const requestSeq = invalidateConversationActivation();
    conversationDetailAbortRef.current?.abort?.();
    conversationDetailAbortRef.current = null;
    const currentViewMode = viewModeRef.current === 'chat' ? 'chat' : 'workflow';
    const nextViewMode = currentViewMode === 'chat' ? 'workflow' : 'chat';
    const nextExecutionMode = nextViewMode === 'chat' ? 'chat' : 'bot';
    setActiveTab('dashboard');
    // Settings overlays the main workspace; leaving via bot/chat must exit it
    // so the corresponding chat/workflow page is shown instead of staying under settings.
    if (settingsMode) {
      setSettingsMode(false);
    }

    const currentConversation = findConversationById(workspaceState, conversationIdRef.current);
    const outgoingProject = findProjectByConversationId(workspaceState, conversationIdRef.current);
    if (currentConversation && outgoingProject) {
      modeLocationRef.current[currentViewMode] = {
        projectId: outgoingProject.id,
        conversationId: currentConversation.id,
      };
    }
    if (currentConversation?.executionMode === nextExecutionMode) {
      viewModeRef.current = nextViewMode;
      setViewMode(nextViewMode);
      return;
    }
    const rememberedLocation = modeLocationRef.current[nextViewMode];
    const rememberedConversation = rememberedLocation?.conversationId
      ? findConversationById(workspaceState, rememberedLocation.conversationId)
      : null;
    const rememberedProject = rememberedConversation?.executionMode === nextExecutionMode
      ? findProjectByConversationId(workspaceState, rememberedConversation.id)
      : null;
    const currentProject = rememberedProject
      || findProjectByConversationId(workspaceState, conversationIdRef.current)
      || workspaceState.projects.find((project) => project.id === workspaceState.activeProjectId)
      || workspaceState.projects[0];
    const matchingConversation = rememberedProject
      ? rememberedConversation
      : currentProject?.conversations.find(
          (conversation) => conversation.executionMode === nextExecutionMode,
        );
    const createdDetail = matchingConversation
      ? null
      : await createConversationInProject(
          currentProject,
          currentProject?.id === DEFAULT_PROJECT_ID ? DEFAULT_SESSION_NAME : 'New Conversation',
          nextExecutionMode,
        );
    if (!isConversationActivationCurrent(requestSeq)) return;
    const targetConversationId = matchingConversation?.id || createdDetail?.conversation_id;
    modeLocationRef.current[nextViewMode] = {
      projectId: currentProject?.id || null,
      conversationId: targetConversationId || null,
    };
    // Swap the displayed runtime before the page mode. Otherwise the new Agent
    // page briefly renders the still-running Workflow state while detail loads.
    activateConversationShell(currentProject?.id, targetConversationId);
    viewModeRef.current = nextViewMode;
    setViewMode(nextViewMode);
    if (createdDetail) {
      await activateConversationDetail(createdDetail, { activationSeq: requestSeq });
      return;
    }
    const detailController = new AbortController();
    conversationDetailAbortRef.current = detailController;
    try {
      const detail = await fetchConversationDetail(targetConversationId, { signal: detailController.signal });
      if (!isConversationActivationCurrent(requestSeq) || detailController.signal.aborted) return;
      // Restore the selected mode's latest task as well, so switching back to
      // Workflow immediately shows the current run instead of its idle template.
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

  function handleToggleViewMode() {
    if (!viewModeTogglePromiseRef.current) {
      viewModeTogglePromiseRef.current = performToggleViewMode().finally(() => {
        viewModeTogglePromiseRef.current = null;
      });
    }
    return viewModeTogglePromiseRef.current;
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

  async function handleRetryTask(task) {
    const targetConversationId = task?.conversationId || task?.conversation_id;
    if (!targetConversationId) return;
    if (targetConversationId !== conversationIdRef.current) {
      const detail = await fetchConversationDetail(targetConversationId);
      await activateConversationDetail(detail, { restoreLatest: false });
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
