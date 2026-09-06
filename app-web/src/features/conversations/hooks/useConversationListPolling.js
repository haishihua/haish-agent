import React from 'react';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch } from '../../../shared/api/client.js';
import { startPolling } from '../../../shared/lib/polling.js';

const CONVERSATION_LIST_POLL_INTERVAL_MS = 3000;

export function useConversationListPolling({
  activeConversationExecutionMode,
  conversationIdRef,
  directorySelectionApiRef,
  draftConversationRef,
  enabled,
  executionMode,
  replaceWorkspaceModeFromProjects,
  setWorkspaceState,
}) {
  const initialRefreshDoneRef = React.useRef(false);
  React.useEffect(() => {
    if (!enabled) return undefined;

    let stopped = false;
    let inFlight = false;
    let controller = null;
    let previousPayload = '';

    const refresh = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      controller = new AbortController();
      try {
        const response = await apiFetch(
          `${API_BASE}/api/projects?execution_mode=${executionMode}`,
          { method: 'GET', signal: controller.signal },
          { json: false },
        );
        if (!response.ok) throw new Error(`conversation list refresh failed: ${response.status}`);
        const payload = await response.json();
        if (stopped) return;
        const projects = Array.isArray(payload?.projects) ? payload.projects : [];
        const currentConversationId = conversationIdRef.current;
        const currentConversationExists = projects.some((project) => (
          (project.conversations || []).some(
            (conversation) => conversation.conversation_id === currentConversationId,
          )
        ));
        const signature = JSON.stringify(projects);
        if (signature !== previousPayload) setWorkspaceState((state) => replaceWorkspaceModeFromProjects(
          executionMode,
          projects,
          state,
          draftConversationRef.current,
        ));
        previousPayload = signature;
        if (
          currentConversationId
          && activeConversationExecutionMode === executionMode
          && !currentConversationExists
        ) {
          const fallbackProject = projects.find((project) => (project.conversations || []).length > 0)
            || projects[0]
            || null;
          Promise.resolve(directorySelectionApiRef.current.handleActiveConversationRemoved?.({
            projectId: fallbackProject?.project_id || null,
            conversationId: fallbackProject?.conversations?.[0]?.conversation_id || null,
          })).catch((error) => {
            if (!stopped) console.warn('conversation replacement failed', error);
          });
        }
      } catch (error) {
        if (!stopped && error?.name !== 'AbortError') {
          console.warn('conversation list refresh failed', error);
          throw error;
        }
      } finally {
        inFlight = false;
        controller = null;
      }
    };

    const stopPolling = startPolling(refresh, {
      interval: CONVERSATION_LIST_POLL_INTERVAL_MS,
      immediate: !initialRefreshDoneRef.current,
    });
    initialRefreshDoneRef.current = true;
    return () => {
      stopped = true;
      controller?.abort();
      stopPolling();
    };
  }, [
    activeConversationExecutionMode,
    conversationIdRef,
    directorySelectionApiRef,
    draftConversationRef,
    enabled,
    executionMode,
    replaceWorkspaceModeFromProjects,
    setWorkspaceState,
  ]);
}
