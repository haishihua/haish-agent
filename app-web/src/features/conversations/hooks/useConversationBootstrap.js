import React from 'react';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch, DEFAULT_SESSION_NAME } from '../../../shared/api/client.js';
import { createConversationWithRetry } from '../api/conversations.js';
import { readLastLocation, resolveStoredWorkflowTask } from '../model/last-location.js';
import {
  createEmptyWorkspaceState,
  getStoredConversationId,
  getWorkspaceConversationIds,
  loadStoredWorkspaceState,
  saveWorkspaceState,
} from '../model/workspace-state.js';

export function useConversationBootstrap({
  activationApiRef,
  buildWorkspaceStateFromProjects,
  ownerIdRef,
  setConversationError,
  setConversationReady,
  setOwnerId,
  setWorkspaceLoading,
  setWorkspaceState,
  setViewedWorkflowTask,
}) {
  React.useEffect(() => {
    let cancelled = false;
    const activationApi = activationApiRef.current;
    const activationSeq = activationApi.currentActivationSeq?.();
    const isCurrent = () => (
      !cancelled && activationApi.isConversationActivationCurrent?.(activationSeq)
    );
    (async () => {
      try {
        const responses = await Promise.all(['chat', 'bot'].map((executionMode) => (
          apiFetch(`${API_BASE}/api/projects?execution_mode=${executionMode}`, {
            method: 'GET',
          }, { json: false })
        )));
        const failedResponse = responses.find((response) => !response.ok);
        if (failedResponse) throw new Error(`project list failed: ${failedResponse.status}`);
        const payloads = await Promise.all(responses.map((response) => response.json()));
        const ownerIds = new Set(payloads.map((payload) => String(payload?.owner_id || '').trim()));
        if (ownerIds.size !== 1 || ownerIds.has('')) {
          throw new Error('project list responses have inconsistent owner_id');
        }
        const ownerId = [...ownerIds][0];
        ownerIdRef.current = ownerId;
        setOwnerId(ownerId);
        let projects = payloads.flatMap((payload) => (
          Array.isArray(payload?.projects) ? payload.projects : []
        ));
        let chatConversations = projects
          .filter((project) => project.execution_mode === 'chat')
          .flatMap((project) => project.conversations || []);
        if (chatConversations.length === 0) {
          if (!isCurrent()) return;
          const created = await createConversationWithRetry(
            { title: DEFAULT_SESSION_NAME, execution_mode: 'chat' },
            isCurrent,
          );
          if (!created) return;
          chatConversations = [created];
          projects = projects.map((project) => (
            project.project_id === created.project_id
              ? { ...project, conversations: [created, ...(project.conversations || [])] }
              : project
          ));
        }
        if (!isCurrent()) return;
        const storedWorkspaceState = loadStoredWorkspaceState(ownerId);
        const previousState = getWorkspaceConversationIds(storedWorkspaceState).length > 0
          ? {
              ...storedWorkspaceState,
              activeConversationId: getStoredConversationId(ownerId) || storedWorkspaceState.activeConversationId,
            }
          : createEmptyWorkspaceState();
        let nextState = buildWorkspaceStateFromProjects(projects, previousState);
        const location = readLastLocation(window.localStorage, ownerId);
        const rememberedTask = resolveStoredWorkflowTask(nextState, location);
        if (rememberedTask) {
          setViewedWorkflowTask({ projectId: rememberedTask.projectId, taskId: rememberedTask.taskId });
          if (location.mode === 'workflow') {
            nextState = {
              ...nextState,
              activeProjectId: rememberedTask.projectId,
              activeConversationId: rememberedTask.conversationId,
              projects: nextState.projects.map((project) => project.id === rememberedTask.projectId
                ? { ...project, userExpanded: true, expanded: true, workflowTasksExpanded: false }
                : project),
            };
          }
        }
        saveWorkspaceState(ownerId, nextState);
        setWorkspaceState(nextState);
        const conversations = projects.flatMap((project) => project.conversations || []);
        const activeSummary = conversations.find(
          (item) => item.conversation_id === nextState.activeConversationId,
        ) || chatConversations[0] || conversations[0];
        // 记住的那个会话在服务端已经没了（例如上次留下的空草稿被清掉）：抹掉它、
        // 换一个还能用的，别把 404 变成启动错误页。
        const fallbackDetailAfterMissing = async (missingConversationId) => {
          // nextState 就是刚拼好的工作区快照：dropMissingConversation 手里的 ctx 快照
          // 还停在挂载前，用它挑不出能接手的会话（只会白白新建一个空白对话）。
          const recovery = activationApi.dropMissingConversation?.(missingConversationId, {
            snapshot: nextState,
          }) || {};
          if (recovery.fallbackConversationId) {
            return activationApi.fetchConversationDetail(recovery.fallbackConversationId);
          }
          // 一个能用的会话都没有：开一个空白对话，和首次启动的兜底一致。
          return isCurrent()
            ? createConversationWithRetry(
                { title: DEFAULT_SESSION_NAME, execution_mode: 'chat' },
                isCurrent,
              )
            : null;
        };
        if (activeSummary) {
          try {
            const detail = Array.isArray(activeSummary.messages)
              ? activeSummary
              : await activationApi.fetchConversationDetail(activeSummary.conversation_id);
            await activationApi.activateConversationDetail(detail);
          } catch (activationError) {
            if (activationError?.status !== 404) throw activationError;
            const fallbackDetail = await fallbackDetailAfterMissing(activeSummary.conversation_id);
            if (!fallbackDetail?.conversation_id) throw activationError;
            await activationApi.activateConversationDetail(fallbackDetail);
          }
        }
        setConversationReady(true);
      } catch (error) {
        if (!cancelled) setConversationError(String(error?.message || error));
      } finally {
        if (!cancelled) setWorkspaceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      activationApi.abortPendingRequests?.();
    };
  // Bootstrap runs once; activationApi is the controller captured for this mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
