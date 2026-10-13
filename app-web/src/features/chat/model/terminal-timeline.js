import { getToolResponseTraceStatus, getToolTraceStatus } from './tool-trace-status.js';

function plainObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function callIdOf(source) {
  return source?.callId || source?.call_id || source?.toolCallId || source?.tool_call_id || '';
}

function terminalSessionId(value) {
  const response = plainObject(value);
  const data = plainObject(response.data);
  return String(data.session_id || data.sessionId || '').trim();
}

function terminalOutputChunk(source) {
  const response = plainObject(source?.toolResponse || source?.tool_response);
  const artifacts = plainObject(response.artifacts);
  const data = plainObject(response.data);
  const output = artifacts.output
    ?? artifacts.content
    ?? artifacts.text
    ?? artifacts.stdout
    ?? data.output
    ?? data.stdout;
  if (output !== undefined && output !== null) return String(output);
  const rawText = String(source?.toolOutput || source?.tool_output || '');
  if (!rawText || rawText.trimStart().startsWith('TOOL_RESPONSE')) return null;
  const rawPayload = plainObject(rawText);
  if (rawPayload.tool_name || rawPayload.toolName) return null;
  return rawText;
}

// One instance per timeline owner: never share session/call maps across agents.
// exec_command owns the card; write_stdin only updates that process's card.
export function createTerminalTimeline({ events = [], finalStatus = 'running' } = {}) {
  const terminalItemsBySessionId = new Map();
  const terminalOutputByItem = new WeakMap();
  const terminalCallsWithOutputEvents = new Set(events
    .filter((event) => ['tool_output_delta', 'tool_call_completed', 'sub_agent_tool_call_completed'].includes(event.type))
    .map(callIdOf));

  function updateTerminalOutput(toolItem, callId, text, append = false) {
    let outputs = terminalOutputByItem.get(toolItem);
    if (!outputs) {
      outputs = new Map();
      terminalOutputByItem.set(toolItem, outputs);
    }
    // Deltas are literal bytes. Final output replaces only this invocation's
    // segment; repeated lines in different polls remain distinct output.
    outputs.set(callId, append ? (outputs.get(callId) || '') + text : text);
    toolItem.terminalOutput = [...outputs.values()].join('');
  }

  function findTerminalForInput(value) {
    const input = plainObject(value);
    return terminalItemsBySessionId.get(String(input.session_id || input.sessionId || '').trim()) || null;
  }

  function mergeTerminalResult(toolItem, source, terminalState = '', seed = false) {
    if (!toolItem || !source) return;
    const response = source.toolResponse || source.tool_response || null;
    const chunk = terminalOutputChunk(source);
    const callId = callIdOf(source) || toolItem.callId;
    if (chunk !== null && !(seed && terminalCallsWithOutputEvents.has(callId))) {
      updateTerminalOutput(toolItem, callId, chunk);
    }
    if (response) toolItem.toolResponse = response;
    toolItem.outputSummary = source.outputSummary || source.output_summary || toolItem.outputSummary || '';

    const nextSessionId = terminalSessionId(response);
    if (nextSessionId) {
      toolItem.terminalSessionId = nextSessionId;
      terminalItemsBySessionId.set(nextSessionId, toolItem);
      toolItem.status = getToolTraceStatus('running', finalStatus);
      return;
    }

    if (toolItem.terminalSessionId && terminalState !== 'requested') {
      terminalItemsBySessionId.delete(toolItem.terminalSessionId);
      toolItem.terminalSessionId = '';
    }
    const responseState = getToolResponseTraceStatus(plainObject(response), terminalState);
    toolItem.status = getToolTraceStatus(responseState || terminalState, finalStatus);
  }

  return { findTerminalForInput, mergeTerminalResult, updateTerminalOutput };
}
