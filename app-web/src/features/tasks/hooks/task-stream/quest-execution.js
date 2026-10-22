// 一轮 quest 的完整生命周期：预检（Stop 栅栏、重复 retry 守卫、运行配置归一化）、
// 本地运行态装配、附件上传、请求体构造、事件批次队列与背压补齐、失败回滚。
// 全部依赖（含 ctx 本身）由 createTaskStreamHandlers 显式传入；这里不持有任何
// 模块级可变状态，只在调用时建一次闭包。
import { executionConfigError } from '../../../workflow/model/execution-config.js';
import { normalizeReasoningEffort } from '../../../chat/model/run-catalog.js';
import { nodeRuntimeConfigsForWorkflow, nodeRuntimeConfigRequest } from '../../../workflow/model/node-runtime-config.js';
import { waitForAttemptConfigOperation } from '../../../conversations/model/attempt-run-config.js';
import { RESYNC_REQUIRED_TYPE } from './recovery.js';

const realtimeRequestId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function createQuestExecutor({
  ctx,
  getRuntime,
  mutateRuntime,
  updateTaskById,
  updateTaskRuntimeState,
  generateHexId,
  chatFinalizedTaskIdsRef,
  userCancelledTaskIdsRef,
  setRuntimeActiveTaskId,
  setRuntimeBusy,
  setRuntimeFetchController,
  setUploadState,
  setComposerAttachment,
  removeConversationTaskFromWorkspace,
  uploadAttachment,
  applyConversationSnapshot,
  showToast,
  buildTaskRuntimeRecord,
  applyTerminalTaskState,
  isTerminalTaskStatus,
  runTaskStream,
  activeTaskConflictDetail,
  activeTaskConflictMaxWaits,
  activeTaskConflictWaitMs,
  streamEventBatchMs,
  streamImmediateEventTypes,
  coalesceStreamEvent,
  batchRuntimeMutations,
  streamTargetConvIdRef,
  applyRuntimeEvent,
  acceptRuntimeEvent,
  normalizeRuntimeEvent,
  recoverConversationTasks,
  resyncTaskRuntimeAfterBackpressure,
}) {
  async function executeQuest(pendingTask, targetConversationId, streamRequest = null) {
    const runConversationId = targetConversationId;
    if (!runConversationId) {
      throw new Error('conversation is not ready');
    }
    // A Stop owns this conversation until cancellation and server recovery settle.
    // Re-read the same task after that barrier; never silently retarget a stale Retry.
    let stoppingRuntime = getRuntime(runConversationId);
    while (stoppingRuntime?.stopPromise) {
      await stoppingRuntime.stopPromise;
      stoppingRuntime = getRuntime(runConversationId);
    }
    if (streamRequest?.preflightSignal?.aborted) throw new Error('Retry was stopped. Your changes have not been sent.');
    if (stoppingRuntime?.stopError) throw new Error(stoppingRuntime.stopError);
    if (streamRequest?.attempt) {
      const state = stoppingRuntime?.taskRuntimeState;
      const sourceId = pendingTask.taskId || pendingTask.id;
      const replaced = Object.values(state?.tasksById || {}).some((task) =>
        task.sourceTaskId === sourceId && !task.rerunFromNodeId);
      if (replaced || (state?.latestTaskId && state.latestTaskId !== sourceId)) {
        throw new Error('This turn has been replaced or is no longer the latest turn. Retry the current turn instead.');
      }
      pendingTask = state?.tasksById?.[sourceId] || pendingTask;
    }
    const providers = ctx.providerOptions || [];
    const defaultEffort = (provider) => providers.find((item) => item.id === provider)?.defaultReasoningEffort;
    if (streamRequest?.runConfig) {
      const config = streamRequest.runConfig;
      streamRequest = { ...streamRequest, runConfig: {
        ...config,
        ...(config.nodeRuntimeConfig ? nodeRuntimeConfigRequest(config.nodeRuntimeConfig, providers) : {}),
        ...(config.provider ? { reasoningEffort: normalizeReasoningEffort(config.reasoningEffort, defaultEffort(config.provider)) } : {}),
      } };
    }
    pendingTask = { ...pendingTask,
      ...(pendingTask.executionMode === 'bot'
        ? { nodeRuntimeConfigs: nodeRuntimeConfigsForWorkflow(pendingTask.workflowSnapshot, pendingTask.nodeRuntimeConfigs, providers) }
        : { requestedReasoningEffort: normalizeReasoningEffort(pendingTask.requestedReasoningEffort, defaultEffort(pendingTask.requestedProvider)) }),
    };
    const rerunningNode = Boolean(streamRequest?.rerunNodeId);
    const fullAttempt = Boolean(streamRequest?.attempt);
    const previousRuntime = getRuntime(runConversationId);
    if (fullAttempt && (previousRuntime?.busy || previousRuntime?.fetchController || previousRuntime?.activeRunId)) {
      throw new Error('Wait for the current task to finish or stop before resending. Your changes have not been sent.');
    }
    const candidate = fullAttempt && streamRequest.runConfig ? {
      ...pendingTask, requestedProvider: streamRequest.runConfig.provider, requestedModelId: streamRequest.runConfig.modelId,
    } : pendingTask;
    const configs = rerunningNode && streamRequest.runConfig?.nodeRuntimeConfig
      ? { ...candidate.nodeRuntimeConfigs, [streamRequest.rerunNodeId]: streamRequest.runConfig.nodeRuntimeConfig } : candidate.nodeRuntimeConfigs;
    const configError = executionConfigError({ executionMode: candidate.executionMode, provider: candidate.requestedProvider,
      modelId: candidate.requestedModelId, workflow: candidate.workflowSnapshot, nodeRuntimeConfigs: configs, providerOptions: ctx.providerOptions || [] });
    if (configError) throw new Error(`${configError} Your changes have not been sent.`);
    const editedText = streamRequest?.attempt === 'edit' ? streamRequest.message : null;
    const sourceTaskId = pendingTask.taskId || pendingTask.id || null;
    const runId = (rerunningNode || fullAttempt) ? generateHexId() : (sourceTaskId || generateHexId());
    if (rerunningNode || fullAttempt) {
      const startedAt = Date.now();
      pendingTask = {
        ...pendingTask,
        ...(fullAttempt && streamRequest.runConfig ? {
          requestedProvider: streamRequest.runConfig.provider,
          requestedModelId: streamRequest.runConfig.modelId,
          requestedReasoningEffort: streamRequest.runConfig.reasoningEffort,
          ...(pendingTask.executionMode !== 'bot' ? { requestedAgentId: streamRequest.runConfig.agentId } : {}),
        } : {}),
        ...(rerunningNode && streamRequest.runConfig?.nodeRuntimeConfig ? {
          nodeRuntimeConfigs: { ...(pendingTask.nodeRuntimeConfigs || {}), [streamRequest.rerunNodeId]: streamRequest.runConfig.nodeRuntimeConfig },
        } : {}),
        id: runId,
        taskId: runId,
        sourceTaskId,
        awaitingRetryConfirmation: streamRequest?.attempt === 'rerun',
        sourceRunId: pendingTask.workflowRun?.run_id || null,
        rerunFromNodeId: streamRequest.rerunNodeId || null,
        title: fullAttempt && streamRequest.message != null ? streamRequest.message : pendingTask.title,
        displayText: editedText ?? pendingTask.displayText,
        requestText: editedText ?? pendingTask.requestText,
        status: 'running',
        stage: 'assigned',
        createdAt: startedAt,
        updatedAt: startedAt,
        completedAt: null,
        serverFinished: false,
        error: null,
        answerText: '',
        chatStreamText: '',
        eventLog: [],
        toolCalls: [],
        assistantMessageId: null,
      };
    }
    pendingTask.id = runId;
    if (rerunningNode || fullAttempt) {
      chatFinalizedTaskIdsRef.current.delete(runId);
      userCancelledTaskIdsRef.current.delete(runId);
    }
    // Ensure the runtime exists and prime its run-local state.
    mutateRuntime(runConversationId, (rt) => {
      rt.runGeneration = (rt.runGeneration || 0) + 1;
      rt.activeRunId = runId;
      rt.cancelledRunIds.delete(runId);
      rt.answerBuffer = '';
      rt.busy = true;
      rt.abortRequested = false;
      rt.shellSeeded = false;
    });
    updateTaskRuntimeState((state) => ({
      ...state,
      pendingTask: {
        ...pendingTask,
        status: 'running',
        stage: 'assigned',
      },
    }), runConversationId);
    if (rerunningNode || fullAttempt) {
      setRuntimeActiveTaskId(runId, runConversationId);
      setRuntimeBusy(true, runConversationId);
    }

    let rolledBack = false;
    const rollbackUnconfirmedRerun = () => {
      if (rolledBack || (!rerunningNode && !fullAttempt)) return;
      rolledBack = true;
      updateTaskRuntimeState((state) => {
        const tasksById = { ...(state.tasksById || {}) };
        delete tasksById[runId];
        return {
          ...state,
          tasksById,
          taskOrder: (state.taskOrder || []).filter((taskId) => taskId !== runId),
          activeTaskId: state.activeTaskId === runId ? null : state.activeTaskId,
          pendingTask: (state.pendingTask?.taskId || state.pendingTask?.id) === runId
            ? null
            : state.pendingTask,
        };
      }, runConversationId);
      const runtime = getRuntime(runConversationId);
      if (!runtime?.activeRunId || runtime.activeRunId === runId) {
        mutateRuntime(runConversationId, (rt) => { rt.activeRunId = null; });
        setRuntimeActiveTaskId(null, runConversationId);
        setRuntimeFetchController(null, runConversationId);
        setRuntimeBusy(false, runConversationId);
      }
      removeConversationTaskFromWorkspace(runConversationId, runId);
      chatFinalizedTaskIdsRef.current.delete(runId);
      userCancelledTaskIdsRef.current.delete(runId);
    };

    if (!rerunningNode && !fullAttempt && pendingTask.attachment?.file && !pendingTask.attachment?.uploaded) {
      const uploadController = new AbortController();
      const uploadName = pendingTask.attachment.name || pendingTask.attachment.file.name || 'document';
      setRuntimeFetchController(uploadController, runConversationId);
      setUploadState({ active: true, fileName: uploadName });
      try {
        const payload = await uploadAttachment(
          pendingTask.attachment.file,
          uploadController.signal,
          runConversationId,
          pendingTask.executionMode === 'bot'
            ? { workflowId: pendingTask.requestedWorkflowId }
            : { agentId: pendingTask.requestedAgentId },
        );
        const runRuntimeForGuard = getRuntime(runConversationId);
        if (!runRuntimeForGuard || runRuntimeForGuard.activeRunId !== runId) {
          return;
        }
        const nextAttachment = {
          name: payload?.attachment?.file_name || uploadName,
          size: payload?.attachment?.size_bytes ?? pendingTask.attachment.size,
          type: payload?.attachment?.content_type || pendingTask.attachment.type,
          uploaded: true,
          documentId: payload?.attachment?.document_id || payload?.document?.id || null,
          attachmentId: payload?.attachment?.attachment_id || null,
          title: payload?.attachment?.title || pendingTask.attachment.name || uploadName,
          conversationId: payload?.attachment?.conversation_id || runConversationId,
        };
        pendingTask.attachment = { ...pendingTask.attachment, ...nextAttachment };
        applyConversationSnapshot(payload?.conversation || null);
        setComposerAttachment(nextAttachment);
        showToast('success', `document uploaded: ${String(uploadName || '').toLowerCase()}`);
      } catch (error) {
        const runRuntimeForError = getRuntime(runConversationId);
        if (!((runRuntimeForError?.abortRequested) || error?.name === 'AbortError')) {
          showToast('error', `upload failed: ${String(uploadName || '').toLowerCase()}`);
        }
        throw error;
      } finally {
        const guardRt = getRuntime(runConversationId);
        if (guardRt && guardRt.fetchController === uploadController) {
          setRuntimeFetchController(null, runConversationId);
        }
        setUploadState({ active: false, fileName: '' });
      }
    }

    const controller = new AbortController();
    setRuntimeFetchController(controller, runConversationId);
    const waitForActiveTaskRelease = () => new Promise((resolve, reject) => {
      if (controller.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const timer = setTimeout(() => {
        controller.signal.removeEventListener('abort', onAbort);
        resolve();
      }, activeTaskConflictWaitMs);
      controller.signal.addEventListener('abort', onAbort, { once: true });
    });
    const requestBody = fullAttempt ? {
      request_id: streamRequest.requestId,
      ...(streamRequest.attempt === 'edit' ? { message: streamRequest.message } : {}),
      ...(streamRequest.runConfig ? {
        llm_config_id: streamRequest.runConfig.provider,
        model_id: streamRequest.runConfig.modelId,
        reasoning_effort: streamRequest.runConfig.reasoningEffort,
      } : {}),
    } : rerunningNode ? {
      ...(streamRequest.runConfig?.nodeRuntimeConfig ? { runtime_config: streamRequest.runConfig.nodeRuntimeConfig } : {}),
      llm_config_id: streamRequest.runConfig?.provider,
      model_id: streamRequest.runConfig?.modelId,
      reasoning_effort: streamRequest.runConfig?.reasoningEffort,
    } : {
      message: pendingTask.requestText ?? pendingTask.title,
      annotations: pendingTask.annotations || [],
      // 「以任务产出为上下文」：只传任务引用，报告正文由服务端在起跑时取
      // （没挂上下文就是空数组）。
      context_tasks: (Array.isArray(pendingTask.contextTasks) ? pendingTask.contextTasks : [])
        .map((item) => ({ task_id: item.taskId || item.task_id || '' }))
        .filter((item) => item.task_id),
      attachments: pendingTask.attachment ? [{
        name: pendingTask.attachment.name,
        size: pendingTask.attachment.size,
        type: pendingTask.attachment.type,
        title: pendingTask.attachment.title || pendingTask.attachment.name,
        file_name: pendingTask.attachment.name,
        attachment_id: pendingTask.attachment.attachmentId || null,
        document_id: pendingTask.attachment.documentId || null,
      }] : [],
      image_attachments: Array.isArray(pendingTask.imageAttachments) ? pendingTask.imageAttachments : [],
      options: {
        ...(pendingTask.executionMode === 'bot' ? { node_runtime_configs: pendingTask.nodeRuntimeConfigs || {} } : {}),
        llm_config_id: pendingTask.requestedProvider || null,
        model_id: pendingTask.requestedModelId || null,
        agent_id: pendingTask.requestedAgentId || null,
        workflow_id: pendingTask.requestedWorkflowId || null,
        execution_mode: pendingTask.executionMode === 'bot' ? 'bot' : 'chat',
        reasoning_effort: pendingTask.requestedReasoningEffort ?? null,
        use_history: true,
      },
    };

    let confirmedTaskId = null;
    const queuedEvents = [];
    let flushTimer = null;
    const runRuntime = getRuntime(runConversationId, { create: true });
    let settleIdentity;
    let settleStream;
    const pendingRun = {
      runId, pendingTask, taskId: null,
      streamSettled: new Promise((resolve) => { settleStream = resolve; }),
      identitySettled: new Promise((resolve) => { settleIdentity = resolve; }),
      confirmStoppedTask(event) {
        const taskId = event.task_id;
        if (!taskId || (event.conversation_id && event.conversation_id !== runConversationId)
          || getRuntime(runConversationId) !== runRuntime) return;
        confirmedTaskId = taskId;
        pendingRun.taskId = taskId;
        userCancelledTaskIdsRef.current.add(taskId);
        chatFinalizedTaskIdsRef.current.add(taskId);
        settleIdentity(taskId);
        // A background schedule may start while an older Stop is failing.
        // Track/cancel this request's identity without replacing the newer run.
        if (runRuntime.activeRunId && runRuntime.activeRunId !== runId) return;
        updateTaskRuntimeState((state) => {
          const previous = state.tasksById[taskId];
          const task = previous || buildTaskRuntimeRecord({ ...event, conversation_id: runConversationId }, pendingTask);
          const tasksById = { ...state.tasksById, [taskId]: isTerminalTaskStatus(task.status)
            ? task : applyTerminalTaskState(task, 'cancelled', { aborted: true }) };
          if (runId !== taskId) delete tasksById[runId];
          return { ...state, tasksById, latestTaskId: taskId,
            pendingTask: (state.pendingTask?.taskId || state.pendingTask?.id) === runId ? null : state.pendingTask,
            activeTaskId: state.activeTaskId === runId || state.activeTaskId === taskId ? null : state.activeTaskId,
            taskOrder: [...new Set([...state.taskOrder.filter((id) => id !== runId), taskId])],
          };
        }, runConversationId);
      },
    };
    mutateRuntime(runConversationId, (rt) => { rt.pendingRun = pendingRun; });
    const flushQueuedEvents = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      const batch = queuedEvents.splice(0);
      if (!batch.length) return;
      const previousTarget = streamTargetConvIdRef.current;
      streamTargetConvIdRef.current = runConversationId;
      try {
        batchRuntimeMutations(runConversationId, () => {
          for (const event of batch) {
            if (
              getRuntime(runConversationId) !== runRuntime
              || controller.signal.aborted
              || runRuntime.abortRequested
              || runRuntime.activeRunId !== runId
              || runRuntime.cancelledRunIds.has(runId)
              || (event.conversation_id && event.conversation_id !== runConversationId)
            ) {
              continue;
            }
            if (event.type === 'run_started' && event.task_id) {
              confirmedTaskId = event.task_id;
              pendingRun.taskId = event.task_id;
            }
            if (
              event.task_id
              && runRuntime.activeTaskId !== event.task_id
              && !chatFinalizedTaskIdsRef.current.has(event.task_id)
            ) {
              setRuntimeActiveTaskId(event.task_id, runConversationId);
            }
            applyRuntimeEvent(event, runConversationId);
            if (event.type === 'run_started' && event.task_id) {
              settleIdentity(event.task_id);
              streamRequest?.onAccepted?.();
            }
          }
        });
      } finally {
        streamTargetConvIdRef.current = previousTarget;
      }
    };
    const queueRuntimeEvent = (event) => {
      if (streamImmediateEventTypes.has(event.type)) {
        flushQueuedEvents();
        queuedEvents.push(event);
        flushQueuedEvents();
        return;
      }
      const lastIndex = queuedEvents.length - 1;
      const mergedEvent = coalesceStreamEvent(queuedEvents[lastIndex], event);
      if (mergedEvent) queuedEvents[lastIndex] = mergedEvent;
      else queuedEvents.push(event);
      if (!flushTimer) {
        flushTimer = setTimeout(flushQueuedEvents, streamEventBatchMs);
      }
    };
    try {
      for (let attempt = 0; ; attempt += 1) {
        const command = {
          request_id: `${realtimeRequestId()}-${attempt}`,
          operation: fullAttempt
            ? (streamRequest.attempt === 'edit' ? 'edit' : 'rerun')
            : (rerunningNode ? 'rerun_node' : 'start'),
          conversation_id: runConversationId,
          ...(fullAttempt || rerunningNode ? { task_id: sourceTaskId } : {}),
          ...(rerunningNode ? { node_id: streamRequest.rerunNodeId } : {}),
          payload: requestBody,
        };
        try {
          if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          await runTaskStream(command, (event) => {
            // 背压丢事件：控制面提示，不是任务事件（更不是失败）。按游标补一次，
            // 下面的归一化/应用管线不认识它。
            if (event?.type === RESYNC_REQUIRED_TYPE) {
              void resyncTaskRuntimeAfterBackpressure(event, runConversationId, { flushPending: flushQueuedEvents });
              return;
            }
            const normalized = normalizeRuntimeEvent(event);
            if (!normalized || (normalized.conversation_id && normalized.conversation_id !== runConversationId)
              || getRuntime(runConversationId) !== runRuntime) return;
            // Identity confirmation is control-plane data, not generated content.
            // Keep it even when Stop has already aborted the local projection.
            if (normalized.type === 'run_started' && normalized.task_id && !confirmedTaskId
              && (controller.signal.aborted || runRuntime.cancelledRunIds.has(runId))) {
              pendingRun.confirmStoppedTask(normalized);
              return;
            }
            if (controller.signal.aborted || runRuntime.abortRequested
              || runRuntime.activeRunId !== runId || runRuntime.cancelledRunIds.has(runId)) return;
            // Never combine an already-seen fragment with a fresh one: once
            // text is merged, the identities alone cannot split partial replay.
            if (!acceptRuntimeEvent(normalized, runConversationId)) return;
            queueRuntimeEvent(normalized);
          });
          break;
        } catch (error) {
          const detail = String(error?.message || error || '');
          const waitable = fullAttempt
            && (error?.status == null || Number(error.status) === 409)
            && detail === activeTaskConflictDetail;
          if (!waitable || attempt >= activeTaskConflictMaxWaits) {
            if (detail === activeTaskConflictDetail) {
              throw new Error('The previous task is still running or stopping. Your changes have not been sent. Wait for it to stop, then try again.');
            }
            throw error;
          }
          if (attempt === 0) showToast?.('info', 'The previous task is still stopping — sending automatically once it is done…');
          await waitForActiveTaskRelease();
        }
      }
    } catch (error) {
      // Drain first: run_started may have promoted the local placeholder to a
      // server task. Rolling back first clears its pointer and strands that task
      // in running state, permanently blocking the next Retry.
      flushQueuedEvents();
      if (!confirmedTaskId) {
        rollbackUnconfirmedRerun();
      } else if (fullAttempt || rerunningNode) {
        updateTaskById(confirmedTaskId, (task) => isTerminalTaskStatus(task.status)
          ? task
          : applyTerminalTaskState(task, 'failed', { error: String(error?.message || error) }), runConversationId);
        chatFinalizedTaskIdsRef.current.add(confirmedTaskId);
        updateTaskRuntimeState((state) => ({ ...state,
          activeTaskId: state.activeTaskId === confirmedTaskId ? null : state.activeTaskId,
        }), runConversationId);
        const runtime = getRuntime(runConversationId);
        if (runtime?.activeRunId === runId) {
          mutateRuntime(runConversationId, (rt) => { rt.activeRunId = null; });
          setRuntimeBusy(false, runConversationId);
          setRuntimeActiveTaskId(null, runConversationId);
        }
      }
      if (fullAttempt && Number(error?.status) === 409
        && ['Only the latest turn can be retried or edited.', 'Task is not eligible for this operation.']
          .includes(String(error?.message))) {
        const recoveryController = new AbortController();
        const signal = streamRequest?.preflightSignal;
        const abortRecovery = () => recoveryController.abort();
        signal?.addEventListener('abort', abortRecovery, { once: true });
        if (signal?.aborted) abortRecovery();
        try {
          await waitForAttemptConfigOperation(
            recoverConversationTasks(runConversationId, { expectedRuntime: runRuntime, signal: recoveryController.signal }),
            { signal: recoveryController.signal, timeoutMs: ctx.attemptConfigTimeoutMs ?? 30_000,
              timeoutMessage: 'Timed out refreshing task status. Nothing was retried. Please try again.' },
          );
        } finally {
          recoveryController.abort();
          signal?.removeEventListener('abort', abortRecovery);
        }
      }
      throw error;
    } finally {
      flushQueuedEvents();
      if (!confirmedTaskId) rollbackUnconfirmedRerun();
      settleIdentity(confirmedTaskId);
      settleStream();
      if (getRuntime(runConversationId)?.pendingRun === pendingRun) {
        mutateRuntime(runConversationId, (rt) => { rt.pendingRun = null; });
      }
      const guardRt = getRuntime(runConversationId);
      if (guardRt && guardRt.fetchController === controller) {
        setRuntimeFetchController(null, runConversationId);
      }
    }
  }

  return executeQuest;
}
