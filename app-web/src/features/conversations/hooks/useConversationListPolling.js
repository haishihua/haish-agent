import React from 'react';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch } from '../../../shared/api/client.js';

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
  React.useEffect(() => {
    if (!enabled) return undefined;

    let stopped = false;
    let inFlight = false;
    let controller = null;

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
        setWorkspaceState((state) => replaceWorkspaceModeFromProjects(
          executionMode,
          projects,
          state,
          draftConversationRef.current,
        ));
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
        }
      } finally {
        inFlight = false;
        controller = null;
      }
    };

    refresh();
    const timer = window.setInterval(refresh, CONVERSATION_LIST_POLL_INTERVAL_MS);
    window.addEventListener('focus', refresh);
    return () => {
      stopped = true;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
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
