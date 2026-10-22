// 恢复与会话切换：选中/切换会话、项目展开、模式切换时的会话接管，以及
// “会话没了”之后的静默兜底。所有状态仍然来自 ctx 工厂闭包（这里不存任何状态）。
//
// 与 crud 的往返：handleSelectProject 在目标项目没有会话时要新建一个，而新建动作
// 属于 crud，所以由主文件注入 addConversation（延迟绑定，调用时主文件已经装配完）。
import { beginConversationLoadPerf, conversationLoadPerf } from '../../../../shared/lib/conversation-load-perf.js';

export function createConversationRestoreHandlers(deps) {
  const {
    activateConversationDetail,
    activateConversationShell,
    clearDraftConversationState,
    conversationDetailAbortRef,
    conversationError = '',
    conversationId,
    conversationIdRef,
    draftConversationRef,
    dropMissingConversation,
    fetchConversationDetail,
    findConversationById,
    findProjectByConversationId,
    getRuntime,
    invalidateConversationActivation,
    isConversationActivationCurrent,
    modeLocationRef,
    normalizeWorkspaceOrdering,
    openDraftConversation,
    setActiveTab,
    setConversationError = () => {},
    setSettingsMode,
    setViewMode,
    setWorkspaceState,
    settingsMode,
    showToast,
    taskUpdatedTimestamp,
    viewModeRef,
    workspaceState,
    // 由主文件注入：WeakMap 是工厂闭包里的请求登记表；addConversation 属于 crud，
    // 这里只负责在“项目里没有会话”的时候叫它一次。
    addConversation,
    conversationLoadRequests,
  } = deps;

  function conversationRuntimeIsCurrent(targetConversationId) {
    const conversation = findConversationById(workspaceState, targetConversationId);
    const runtime = getRuntime(targetConversationId);
    if (!conversation || !runtime || runtime.shellSeeded) return false;
    if (runtime.busy || runtime.activeRunId || runtime.fetchController) return true;
    const summaries = Array.isArray(conversation.tasks) ? conversation.tasks : [];
    const state = runtime.taskRuntimeState;
    if (!state || summaries.length !== state.taskOrder.length) return false;
    return summaries.every((summary) => {
      const taskId = summary.taskId || summary.id || summary.task_id;
      const task = state.tasksById[taskId];
      // Deferred execution logs do not make an otherwise current summary stale.
      return Boolean(
        task
        && taskUpdatedTimestamp(task) === taskUpdatedTimestamp(summary)
      );
    });
  }

  async function loadAndActivateConversation({
    projectId,
    conversationId: targetConversationId,
    activationSeq = invalidateConversationActivation(),
    switchShell = true,
    restoreLatest = true,
  }) {
    if (!targetConversationId) throw new Error('conversation activation requires a conversation id');
    setConversationError('');
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
    conversationLoadRequests.set(controller, { conversationId: targetConversationId, activationSeq });
    conversationDetailAbortRef.current = controller;
    const reportInterruptedLoad = () => {
      if (isConversationActivationCurrent(activationSeq)
        && conversationIdRef.current === targetConversationId
        && conversationDetailAbortRef.current === controller
        && getRuntime(targetConversationId)?.shellSeeded) {
        // Keep the shell unhydrated, but never leave a loader without a request.
        // Navigation cancellation is stale and remains silent.
        setConversationError('Conversation loading was interrupted. Select this conversation to retry.');
      }
    };
    try {
      const detail = await fetchConversationDetail(targetConversationId, { signal: controller.signal });
      if (!isConversationActivationCurrent(activationSeq) || controller.signal.aborted) {
        conversationLoadPerf('detail_discarded', targetConversationId, { aborted: controller.signal.aborted });
        if (controller.signal.aborted) reportInterruptedLoad();
        return null;
      }
      await activateConversationDetail(detail, {
        activationSeq,
        restoreLatest,
        signal: controller.signal,
      });
      return detail;
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        reportInterruptedLoad();
        return null;
      }
      if (!isConversationActivationCurrent(activationSeq)) return null;
      // 404 = 这条记录已经不存在了，是数据不是故障：抹掉它并静默换一个能用的会话，
      // 不要把「会话已删除」当成错误提示弹给用户。
      if (error?.status === 404) {
        await recoverMissingConversation(projectId, targetConversationId);
        return null;
      }
      // Keep the shell unhydrated for retries, but stop its loading placeholder.
      setConversationError(String(error?.message || error));
      throw error;
    } finally {
      if (conversationDetailAbortRef.current === controller) {
        conversationDetailAbortRef.current = null;
      }
    }
  }

  // 会话没了（列表轮询发现当前会话消失，或恢复时拿到 404）：换一个能接手的，没有就
  // 开一个空白对话。「点了一行已删会话」和「正在看的会话被删掉」走的是同一条路。
  async function handleConversationRemoved({ projectId = null, conversationId: fallbackConversationId = null } = {}) {
    if (fallbackConversationId) {
      await handleSelectConversation(projectId, fallbackConversationId);
      return;
    }
    if (projectId) openDraftConversation(projectId);
  }

  // 会话在服务端已经没了：本地抹掉它；如果它正是当前选中的会话，就静默换一个能用的
  // （同项目优先，没有别的会话就开一个空白对话）。全程不弹错误提示。
  async function recoverMissingConversation(projectId, missingConversationId) {
    const recovery = dropMissingConversation(missingConversationId, { projectId });
    if (!recovery?.wasSelected || !recovery.projectId) return null;
    try {
      await handleConversationRemoved({
        projectId: recovery.projectId,
        conversationId: recovery.fallbackConversationId,
      });
    } catch (error) {
      console.warn('conversation fallback after a missing conversation failed', error);
    }
    return recovery;
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
    beginConversationLoadPerf(nextConversationId, 'selection');
    const currentConversationId = conversationIdRef.current || conversationId;
    const controller = conversationDetailAbortRef?.current;
    const pendingRequest = controller && conversationLoadRequests.get(controller);
    const loadingThisConversation = Boolean(
      pendingRequest && pendingRequest.conversationId === nextConversationId
      && !controller.signal.aborted
      && isConversationActivationCurrent(pendingRequest.activationSeq)
    );
    const sameConversationReady = nextConversationId === currentConversationId && !conversationError
      && (loadingThisConversation
        || draftConversationRef.current?.id === nextConversationId
        || conversationRuntimeIsCurrent(nextConversationId));
    if (!nextConversationId || sameConversationReady) {
      conversationLoadPerf('selection_no_request', nextConversationId, {
        shell_seeded: Boolean(getRuntime?.(nextConversationId)?.shellSeeded),
        pending_request: loadingThisConversation,
      });
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
    await addConversation(projectId);
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

  return {
    conversationRuntimeIsCurrent,
    loadAndActivateConversation,
    handleConversationRemoved,
    recoverMissingConversation,
    handleSelectConversation,
    handleSelectProject,
    handleToggleProject,
    handleToggleConversationTasks,
    handleToggleProjectConversations,
    handleToggleViewMode,
  };
}
