import { useEffect } from 'react';

/**
 * 排队中的那一条输入（queuedDeploy）什么时候真正开工：
 * 当前会话空下来、不在上传、也不在设置页时发出去。草稿会话要先落地成服务端会话，
 * 已经落地的会话直接交给 startDeploy。
 */
export function useQueuedDeployFlush({
  queuedDeploy,
  setQueuedDeploy,
  deployApiRef,
  draftApiRef,
  runtimeApiRef,
  draftConversationRef,
  conversationIdRef,
  conversationId,
  conversationReady,
  conversationSelectionPending,
  conversationError,
  currentConversationRunning,
  uploadActive,
  settingsMode,
}) {
  useEffect(() => {
    if (!queuedDeploy) return;
    if (!deployApiRef.current.canStartDeployForConversation?.(queuedDeploy.targetConversationId)) return;
    if (currentConversationRunning || uploadActive || settingsMode) return;
    const request = queuedDeploy;
    // Draft first-send path: materialize server conversation before streaming.
    if (draftConversationRef.current) {
      setQueuedDeploy(null);
      draftApiRef.current.materializeDraftConversationForSend(request)
        .then((materialized) => {
          const realConversationId = materialized?.id || null;
          if (!realConversationId) return;
          request.targetConversationId = realConversationId;
          request.runtimeConversationId = realConversationId;
          // Creation may finish after navigation. The accepted send belongs
          // to its own runtime and must continue without selecting that chat.
          deployApiRef.current.startDeploy?.(request, realConversationId, materialized?.detail || null);
        })
        .catch((error) => {
          console.error('draft conversation create failed', error);
          deployApiRef.current.failPendingDeploy?.(request, error);
          runtimeApiRef.current.showToast?.('error', String(error?.message || error));
        });
      return;
    }
    const deployConvId = request.targetConversationId || conversationIdRef.current || conversationId;
    if (!deployConvId || String(deployConvId).startsWith('draft-')) return;
    setQueuedDeploy(null);
    deployApiRef.current.startDeploy?.(request, deployConvId);
  }, [
    queuedDeploy,
    conversationReady,
    conversationSelectionPending,
    conversationError,
    currentConversationRunning,
    uploadActive,
    settingsMode,
    conversationId,
    setQueuedDeploy,
    deployApiRef,
    draftApiRef,
    runtimeApiRef,
    draftConversationRef,
    conversationIdRef,
  ]);
}
