// 工具调用 / 输出 / 结果。toolCalls 数组的 upsert 规则仍由 ctx 的 upsertToolCall
// 负责，这里只决定每次事件要写哪些字段。

export function handleToolCallStarted(scope, event) {
  const { taskId, loopIndex, updateTaskById, upsertToolCall } = scope;
  updateTaskById(taskId, (run) => {
    const waitingForInput = String(event.tool_name || '').toLowerCase() === 'ask_user';
    const nodeId = event.workflow_node_id || run.workflowRun?.current_node_id;
    return {
      ...run,
      stage: 'in_progress',
      loopIndex,
      toolCalls: upsertToolCall(run.toolCalls, event.call_id, {
        callId: event.call_id,
        parentCallId: event.parent_call_id || '',
        loopIndex,
        toolGroup: event.tool_group || 'external',
        kind: event.kind || 'tool',
        toolName: event.tool_name || 'unknown',
        skillName: event.skill_name || '',
        skillPath: event.skill_path || '',
        state: 'requested',
        inputSummary: event.input_summary || '',
        toolInput: event.tool_input || null,
        toolResponse: event.tool_response || null,
        toolOutput: event.tool_output || '',
        message: event.message || '',
      }),
      workflowRun: waitingForInput ? {
        ...(run.workflowRun || {}),
        status: 'waiting_input',
        current_node_id: nodeId || null,
        nodes: nodeId ? {
          ...(run.workflowRun?.nodes || {}),
          [nodeId]: {
            ...(run.workflowRun?.nodes?.[nodeId] || {}),
            status: 'waiting_input',
          },
        } : (run.workflowRun?.nodes || {}),
      } : run.workflowRun,
    };
  });
}

export function handleToolCallCompleted(scope, event) {
  const { taskId, loopIndex, updateTaskById, upsertToolCall, getToolResponseTraceStatus } = scope;
  updateTaskById(taskId, (run) => {
    const existingToolCall = Array.isArray(run.toolCalls)
      ? run.toolCalls.find((item) => item.callId === event.call_id)
      : null;
    let nextState = 'completed';
    const responseState = getToolResponseTraceStatus(event.tool_response, '');
    if (responseState === 'failed') {
      nextState = 'failed';
    } else if (responseState === 'done') {
      nextState = 'completed';
    }
    const askUserResolved = String(existingToolCall?.toolName || event.tool_name || '').toLowerCase() === 'ask_user'
      && event.type === 'tool_call_completed';
    const nodeId = event.workflow_node_id || run.workflowRun?.current_node_id;
    return {
      ...run,
      stage: 'in_progress',
      loopIndex,
      toolCalls: upsertToolCall(run.toolCalls, event.call_id, {
        callId: event.call_id,
        parentCallId: event.parent_call_id || existingToolCall?.parentCallId || '',
        loopIndex,
        toolGroup: event.tool_group || 'external',
        kind: event.kind || existingToolCall?.kind || 'tool',
        toolName: event.tool_name || 'unknown',
        skillName: event.skill_name || existingToolCall?.skillName || '',
        skillPath: event.skill_path || existingToolCall?.skillPath || '',
        state: nextState,
        inputSummary: event.input_summary || existingToolCall?.inputSummary || '',
        outputSummary: event.output_summary || existingToolCall?.outputSummary || '',
        toolInput: event.tool_input || existingToolCall?.toolInput || null,
        toolResponse: event.tool_response || existingToolCall?.toolResponse || null,
        toolOutput: event.tool_output || existingToolCall?.toolOutput || '',
        message: event.message || existingToolCall?.message || '',
      }),
      workflowRun: askUserResolved ? {
        ...(run.workflowRun || {}),
        status: 'running',
        nodes: nodeId ? {
          ...(run.workflowRun?.nodes || {}),
          [nodeId]: {
            ...(run.workflowRun?.nodes?.[nodeId] || {}),
            status: 'running',
          },
        } : (run.workflowRun?.nodes || {}),
      } : run.workflowRun,
    };
  });
}

export function handleToolOutputDelta(scope, event) {
  const { taskId, loopIndex, updateTaskById, upsertToolCall } = scope;
  updateTaskById(taskId, (run) => {
    const deltaData = event.data && typeof event.data === 'object' ? event.data : {};
    const callId = event.call_id || deltaData.call_id || deltaData.tool_call_id || null;
    if (!callId || !Array.isArray(run.toolCalls)) return run;
    const existingToolCall = run.toolCalls.find((item) => item.callId === callId);
    if (!existingToolCall) return run;
    const delta = String(event.delta || deltaData.delta || '');
    if (!delta) return run;
    return {
      ...run,
      stage: 'in_progress',
      loopIndex,
      toolCalls: upsertToolCall(run.toolCalls, callId, {
        // 实时追加命令输出，卡片在 running 状态直接展示，像终端一样滚动。
        toolOutput: `${existingToolCall.toolOutput || ''}${delta}`,
      }),
    };
  });
}
