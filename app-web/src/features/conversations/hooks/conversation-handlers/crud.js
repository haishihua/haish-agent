// 创建 / 重命名 / 删除 / 排序：会话与项目两层的写操作，以及写失败后的工作区兜底。
// 这里的函数都靠 ctx 里的 workspaceState / setWorkspaceState 完成乐观更新与回滚，
// 模块本身不持有任何状态。
//
// 与 restore 的往返：删会话之后要接管到下一个会话，切换动作属于 restore，
// 由主文件注入 selectConversation（调用时 restore 已经装配好）。

export function createConversationCrudHandlers(deps) {
  const {
    API_BASE,
    activateConversationDetail,
    apiFetch,
    applyConversationSnapshot,
    buildApiHeaders,
    conversationId,
    conversationIdRef,
    conversationReorderChainsRef,
    conversationReorderVersionsRef,
    createDefaultProject,
    fetchConversationDetail,
    findConversationById,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    normalizeWorkspaceOrdering,
    openDraftConversation,
    projectReorderChainRef,
    projectReorderVersionRef,
    replaceWorkspaceModeFromProjects,
    setWorkspaceState,
    showToast,
    stopConversationRuntimeBeforeDelete,
    viewModeRef,
    workspaceState,
    workspaceStateWithConversationDetail,
    // 由主文件注入：删会话之后的接管动作属于 restore。
    selectConversation,
  } = deps;

  async function restoreProjectsFromBackend(error, fallbackState) {
    showToast('error', error?.message || 'project update failed');
    try {
      const executionMode = viewModeRef.current === 'chat' ? 'chat' : 'bot';
      const response = await apiFetch(
        `${API_BASE}/api/projects?execution_mode=${executionMode}&summary_only=true`,
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

  // 项目改名跟会话改名同一条路子：先落服务端，再把落定的名字写回工作区；
  // 失败直接抛给对话框显示，本地名字保持原样（不做乐观改名再回滚）。
  async function handleRenameProject(projectId, name) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    const response = await apiFetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'PATCH',
      headers: buildApiHeaders(),
      body: JSON.stringify({ name: trimmed }),
    });
    if (!response.ok) {
      throw new Error(`project rename failed: ${response.status}`);
    }
    const summary = await response.json();
    const nextName = String(summary?.name || trimmed);
    setWorkspaceState((state) => ({
      ...state,
      projects: state.projects.map((project) => (
        project.id === projectId
          // workspaceLabel 是名字的第一顺位回退（草稿会话、目录标签都用它），跟着一起改，
          // 只有系统项目（Default project）没有目录标签，保持 null。
          ? { ...project, name: nextName, workspaceLabel: project.type === 'system' ? null : nextName }
          : project
      )),
    }));
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
      });
      if (!isConversationActivationCurrent(requestSeq)) return;
      await activateConversationDetail(detail, { restoreLatest: false });
      showToast('success', `local workspace set: ${pickResult.project.name}`);
      return;
    }
    const createResponse = await apiFetch(`${API_BASE}/api/conversations`, {
      method: 'POST',
      headers: buildApiHeaders(),
      body: JSON.stringify({
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
    const executionMode = project.executionMode;
    const fallbackConversation = project.conversations.find((conversation) => (
      conversation.id !== nextConversationId && conversation.executionMode === executionMode
    ));
    if (!fallbackConversation) {
      const detail = await createConversationInProject(project, undefined, executionMode);
      setWorkspaceState((state) => normalizeWorkspaceOrdering({
        ...state,
        projects: state.projects.map((item) => item.id === projectId ? {
          ...item,
          conversations: item.conversations.filter((conversation) => conversation.id !== nextConversationId),
        } : item),
      }));
      // Keep the replacement in its project even if deletion completed in the
      // background. Navigation during DELETE or creation owns the selection.
      setWorkspaceState((state) => workspaceStateWithConversationDetail(state, detail, false));
      if (conversationIdRef.current === nextConversationId) {
        await activateConversationDetail(detail, { restoreLatest: false });
      }
      return;
    }
    setWorkspaceState((state) => normalizeWorkspaceOrdering({
      ...state,
      projects: state.projects.map((item) => item.id === projectId ? {
        ...item,
        conversations: item.conversations.filter((conversation) => conversation.id !== nextConversationId),
      } : item),
    }));
    if (nextConversationId === conversationIdRef.current) {
      await selectConversation(projectId, fallbackConversation.id);
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
      const detail = await createConversationInProject(defaultProject);
      await activateConversationDetail(detail, { restoreLatest: false });
    }
  }

  return {
    handlePinConversation,
    handleReorderConversations,
    handlePinProject,
    handleRenameProject,
    handleReorderProjects,
    createConversationInProject,
    handleAddConversation,
    handleAddProject,
    handleDeleteConversation,
    handleRenameConversation,
    handleRemoveProject,
  };
}
