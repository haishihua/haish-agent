// 发消息的动作域：fork、重试 / 编辑重发（含 preflight 配置等待、Stop 栅栏、
// 失败兜底）。它们只读 ctx 的运行时与配置服务，不在这里缓存任何东西。
import { createQuestAck } from '../../../tasks/model/quest-ack.js';
import { waitForAttemptConfigOperation } from '../../model/attempt-run-config.js';

export function createConversationMessageHandlers(deps) {
  const {
    API_BASE,
    activateConversationDetail,
    apiFetch,
    buildApiHeaders,
    buildDeployRequest,
    canStartDeployForConversation,
    executeQuest,
    getRuntime,
    setWorkspaceState,
    showToast,
    startDeploy,
    workspaceStateWithConversationDetail,
    // configSync / recoverConversationTasks / mutateRuntime / attemptConfigTimeoutMs
    // 在原工厂里一直走 ctx 前缀，保持原样。
    ctx,
  } = deps;

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

  function handleRetryTask(task, editedMessage = null, runConfig = null) {
    const targetConversationId = task?.conversationId || task?.conversation_id;
    if (!targetConversationId) return Promise.reject(new Error('Conversation is unavailable. Your changes have not been sent.'));
    const runtime = getRuntime?.(targetConversationId, { create: true });
    const sourceTaskId = task?.taskId || task?.task_id || task?.id;
    if (runtime?.pendingRetry) {
      const pending = runtime.pendingRetry;
      if (pending.sourceTaskId === sourceTaskId && pending.editedMessage === editedMessage) return pending.promise;
      return Promise.reject(new Error('Another retry or edit is already waiting in this conversation. Your changes have not been sent.'));
    }
    const controller = new AbortController();
    // Claim before awaiting configuration. Returning to this conversation and
    // clicking again joins the same action; navigation never aborts it.
    const pendingRetry = { controller, promise: null, sourceTaskId, editedMessage };
    if (runtime) runtime.pendingRetry = pendingRetry;
    const publish = () => ctx.mutateRuntime?.(targetConversationId, () => {});
    const run = performRetryTask(task, editedMessage, runConfig, pendingRetry, runtime);
    pendingRetry.promise = run.catch((error) => {
      controller.abort();
      showToast?.('error', String(error?.message || error));
      throw error;
    }).finally(() => {
      if (runtime?.pendingRetry === pendingRetry) {
        runtime.pendingRetry = null;
        if (getRuntime(targetConversationId) === runtime) publish();
      }
    });
    publish();
    return pendingRetry.promise;
  }

  async function performRetryTask(task, editedMessage, runConfig, pendingRetry, expectedRuntime) {
    const targetConversationId = task?.conversationId || task?.conversation_id;
    const checkOwner = () => {
      if (pendingRetry.controller.signal.aborted) throw new Error('Retry was stopped. Your changes have not been sent.');
      if (expectedRuntime && getRuntime(targetConversationId) !== expectedRuntime) throw new Error('Conversation is unavailable. Your changes have not been sent.');
    };
    const ownedConfig = Boolean(runConfig?.ensureSaved);
    const timeoutMs = ctx.attemptConfigTimeoutMs ?? 30_000;
    const signal = pendingRetry.controller.signal;
    const configuration = (async () => {
      if (ownedConfig) {
        const saved = await runConfig.ensureSaved({ background: editedMessage === null, signal, timeoutMs });
        return saved && { provider: saved.llm_config_id, modelId: saved.model_id, reasoningEffort: saved.reasoning_effort, agentId: saved.agent_id };
      }
      if (task?.executionMode !== 'bot') {
        await ctx.configSync?.waitForSave(targetConversationId);
        checkOwner();
        if (!runConfig) {
          const saved = await ctx.configSync?.load(targetConversationId);
          return saved && { provider: saved.llm_config_id, modelId: saved.model_id, reasoningEffort: saved.reasoning_effort, agentId: saved.agent_id };
        }
      }
      return runConfig;
    })();
    try {
      runConfig = await waitForAttemptConfigOperation(configuration, { signal, timeoutMs });
    } catch (error) {
      // Stop the action's continuation, not the shared load/save request. A late
      // save must not start another preflight stage after timeout or cancellation.
      pendingRetry.controller.abort();
      throw error;
    }
    checkOwner();
    if (task?.executionMode !== 'bot' && (!runConfig?.provider || !runConfig.modelId || !runConfig.agentId)) {
      throw new Error('Save the current Agent, provider and model selection before retrying.');
    }
    if (editedMessage !== null && !canStartDeployForConversation?.(targetConversationId)) throw new Error('Conversation is still loading. Your changes have not been sent.');
    if ((task?.userMessageId || task?.user_message_id) && executeQuest) {
      // Persisted turns rerun in their own runtime, not necessarily the visible
      // conversation. executeQuest enforces latest-turn, busy and Stop rules.
      const sourceId = task.taskId || task.task_id || task.id;
      // A closed renderer connection is not proof that the server task failed.
      // Reconcile the originating conversation before rerun, without activating
      // it or silently changing the source to a newer turn.
      if (editedMessage === null && expectedRuntime) {
        while (expectedRuntime.stopPromise) {
          await waitForAttemptConfigOperation(expectedRuntime.stopPromise, { signal, timeoutMs,
            timeoutMessage: 'Still waiting for Stop to be verified. Nothing was retried.' });
          checkOwner();
        }
        if (expectedRuntime.stopError) throw new Error(expectedRuntime.stopError);
      }
      if (editedMessage === null && ctx.recoverConversationTasks && expectedRuntime
        && !expectedRuntime.activeRunId && !expectedRuntime.fetchController) {
        const detail = await waitForAttemptConfigOperation(
          ctx.recoverConversationTasks(targetConversationId, { expectedRuntime, signal }),
          { signal, timeoutMs, timeoutMessage: 'Timed out refreshing task status. Nothing was retried. Please try again.' },
        );
        checkOwner();
        if (!detail) throw new Error('Task state changed while refreshing. Nothing was retried. Please try again.');
        const state = expectedRuntime.taskRuntimeState;
        if (state.latestTaskId !== sourceId || !state.tasksById[sourceId]) {
          throw new Error('This turn is no longer the latest turn. The conversation has been refreshed.');
        }
        // The restored answer/running/cancelled state replaces the stale failure
        // card. A successful refresh needs no second error or duplicate run.
        if (state.tasksById[sourceId].status !== 'failed') return true;
      }
      const source = getRuntime(targetConversationId)?.taskRuntimeState?.tasksById?.[sourceId] || task;
      // Both actions settle when accepted, not when the stream finishes. Editing
      // keeps its immediate pending projection; Retry keeps the original error
      // button until the server confirms the replacement attempt.
      const ack = createQuestAck();
      return ack.follow(executeQuest(source, targetConversationId, {
        attempt: editedMessage == null ? 'rerun' : 'edit',
        message: editedMessage,
        runConfig: runConfig || null,
        requestId: crypto.randomUUID(),
        onAccepted: ack.accept,
        preflightSignal: pendingRetry.controller.signal,
      }), (error) => showToast('error', String(error?.message || error)));
    }
    const restoredMode = task?.executionMode === 'bot' ? 'workflow' : 'chat';
    const selectionId = task?.executionMode === 'bot'
      ? task?.requestedWorkflowId
      : runConfig?.agentId;
    const request = buildDeployRequest(
      task?.title || '',
      task?.attachment || null,
      task?.executionMode === 'bot' ? (runConfig?.modelId || task?.requestedModelId || '') : runConfig.modelId,
      task?.executionMode === 'bot' ? (runConfig && Object.hasOwn(runConfig, 'reasoningEffort') ? runConfig.reasoningEffort : task?.requestedReasoningEffort ?? null) : runConfig.reasoningEffort,
      task?.imageAttachments || [],
      selectionId,
      task?.executionMode === 'bot' ? (runConfig?.provider || task?.requestedProvider || '') : runConfig.provider,
      task?.displayText || task?.title || '', task?.annotations || [], task?.nodeRuntimeConfigs || {},
    );
    request.targetConversationId = targetConversationId;
    request.executionMode = restoredMode === 'chat' ? 'chat' : 'bot';
    request.originViewMode = restoredMode;
    request.contextTasks = task?.contextTasks || [];
    request.preflightSignal = pendingRetry.controller.signal;
    request.agentId = restoredMode === 'chat' ? selectionId : null;
    request.workflowId = restoredMode === 'workflow' ? selectionId : null;
    checkOwner();
    return startDeploy(request, targetConversationId);
  }

  return {
    handleForkMessage,
    handleRetryTask,
  };
}
