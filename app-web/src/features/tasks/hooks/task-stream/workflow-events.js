// 工作流事件域：workflow_* 与 provider_selected。
// 节点快照的三个状态构造函数仍由主文件的导出维护（它们是对外契约），
// 这里通过 scope 拿到，不重复实现。

export function handleWorkflowStarted(scope, event) {
  const { taskId, updateTaskById } = scope;
  updateTaskById(taskId, (run) => ({
    ...run,
    workflowRun: {
      workflow_id: event.workflow_id || run.requestedWorkflowId,
      run_id: event.workflow_run_id || '',
      status: 'running',
      current_node_id: null,
      nodes: {},
      input: event.input ?? null,
    },
  }));
}

export function handleWorkflowResumed(scope, event) {
  const { taskId, updateTaskById } = scope;
  updateTaskById(taskId, (run) => {
    const nodes = { ...(run.workflowRun?.nodes || {}) };
    for (const nodeId of event.invalidated_node_ids || []) delete nodes[nodeId];
    return {
      ...run,
      workflowRun: {
        ...(run.workflowRun || {}),
        workflow_id: event.workflow_id || run.requestedWorkflowId,
        run_id: event.workflow_run_id || run.workflowRun?.run_id || '',
        status: 'running',
        current_node_id: event.start_node_id || event.workflow_node_id || null,
        nodes,
      },
    };
  });
}

export function handleWorkflowNodeStarted(scope, event) {
  const { taskId, updateTaskById, workflowNodeStartedState } = scope;
  updateTaskById(taskId, (run) => ({
    ...run,
    workflowRun: {
      ...(run.workflowRun || {}),
      status: 'running',
      current_node_id: event.workflow_node_id,
      nodes: {
        ...(run.workflowRun?.nodes || {}),
        // A node snapshot represents one attempt. Never carry terminal
        // fields such as decision/error/summary into the next attempt.
        [event.workflow_node_id]: workflowNodeStartedState(event),
      },
    },
  }));
}

export function handleWorkflowNodeConfigured(scope, event) {
  const { taskId, updateTaskById, workflowNodeConfiguredState } = scope;
  updateTaskById(taskId, (run) => ({
    ...run,
    workflowRun: {
      ...(run.workflowRun || {}),
      nodes: {
        ...(run.workflowRun?.nodes || {}),
        [event.workflow_node_id]: workflowNodeConfiguredState(event, run.workflowRun?.nodes?.[event.workflow_node_id]),
      },
    },
  }));
}

export function handleWorkflowRunWaiting(scope, event) {
  const { taskId, updateTaskById } = scope;
  updateTaskById(taskId, (run) => {
    const nodeId = event.workflow_node_id || event.node_id || run.workflowRun?.current_node_id;
    const waitStatus = event.status === 'waiting_approval' ? 'approval' : 'waiting_input';
    return {
      ...run,
      workflowRun: {
        ...(run.workflowRun || {}),
        status: event.status || 'waiting_input',
        current_node_id: nodeId || null,
        nodes: nodeId ? {
          ...(run.workflowRun?.nodes || {}),
          [nodeId]: {
            ...(run.workflowRun?.nodes?.[nodeId] || {}),
            status: waitStatus,
          },
        } : (run.workflowRun?.nodes || {}),
      },
    };
  });
}

export function handleWorkflowRunResumed(scope, _event) {
  const { taskId, updateTaskById } = scope;
  updateTaskById(taskId, (run) => {
    const nodeId = run.workflowRun?.current_node_id;
    return {
      ...run,
      workflowRun: {
        ...(run.workflowRun || {}),
        status: 'running',
        nodes: nodeId ? {
          ...(run.workflowRun?.nodes || {}),
          [nodeId]: {
            ...(run.workflowRun?.nodes?.[nodeId] || {}),
            status: 'running',
          },
        } : (run.workflowRun?.nodes || {}),
      },
    };
  });
}

export function handleWorkflowNodeFinished(scope, event) {
  const { taskId, updateTaskById, workflowNodeFinishedState, toDisplayText } = scope;
  updateTaskById(taskId, (run) => {
    const nodeId = event.workflow_node_id;
    if (!nodeId) return run;
    const completed = workflowNodeFinishedState(
      event,
      run.workflowRun?.nodes?.[nodeId],
      run.workflowRun?.node_attempts?.[nodeId],
      toDisplayText,
    );
    return {
      ...run,
      workflowRun: {
        ...(run.workflowRun || {}),
        current_node_id: nodeId,
        nodes: {
          ...(run.workflowRun?.nodes || {}),
          [nodeId]: completed.node,
        },
        node_attempts: {
          ...(run.workflowRun?.node_attempts || {}),
          [nodeId]: completed.attempts,
        },
      },
    };
  });
}

export function handleWorkflowFinished(scope, event) {
  const { taskId, updateTaskById } = scope;
  updateTaskById(taskId, (run) => ({
    ...run,
    workflowRun: {
      ...(run.workflowRun || {}),
      status: event.type === 'workflow_failed' ? 'failed' : 'done',
      current_node_id: null,
    },
  }));
}

export function handleProviderSelected(scope, event) {
  const { taskId, updateTaskById, getTaskById, resolveProviderMeta } = scope;
  const providerMeta = resolveProviderMeta(event, getTaskById(taskId));
  updateTaskById(taskId, (run) => ({
    ...run,
    ...(event.node_runtime_configs ? { nodeRuntimeConfigs: event.node_runtime_configs } : {}),
    provider: providerMeta.label,
    providerKey: providerMeta.key,
    requestedProvider: providerMeta.key,
    providerState: {
      provider: providerMeta.label,
      state: 'selected',
      selected: true,
      reason: event.reason || '',
      model: event.model || null,
    },
  }));
}
