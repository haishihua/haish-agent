import { eventDeltaText, stripInjectedSkillInstruction } from './message-text.js';
import { cachedStreamEventBase, recordStreamEventUpdate, streamEventUpdate } from './stream-events.js';
import {
  normalizeToolName,
  TOOL_SHELL_NAMES,
  TOOL_TERMINAL_INPUT_NAMES,
  TOOL_TIMELINE_HIDDEN_NAMES,
} from './tool-names.js';
import { getToolResponseTraceStatus, getToolTraceStatus } from './tool-trace-status.js';
import { createTerminalTimeline } from './terminal-timeline.js';
import { isLiveTaskStatus, isTerminalTaskStatus, normalizeTaskStatus } from './run-status.js';
import { isToolInFlight } from './tool-status.js';
import { skillTrigger } from './tool-presentation.js';
import { mergeChatImageRefs, normalizeChatImageRefs } from './task-record.js';
import { llmRetrySummary } from './progress-text.js';
import {
  atPath,
  categorizeToolCall,
  groupConsecutiveTools,
  progressEventFor,
  replaceAtPath,
  SUB_AGENT_PROGRESS_TYPES,
  subAgentProgressState,
  toolPathsIn,
  timelineToolLabel,
} from './tool-grouping.js';

function incrementalSubAgentTimeline(task, status) {
  const events = task?.eventLog;
  const base = cachedStreamEventBase(events, EVENT_TIMELINE_CACHE);
  if (!base) return null;
  const { cached, prefixLength, events: previous } = base;
  if (cached.status !== status || !isLiveTaskStatus(status)
    || cached.toolCalls !== task.toolCalls || cached.conversationId !== (task.conversationId || task.conversation_id || '')
    || prefixLength < previous.length - 1) return null;
  const state = cached.subAgentState;
  if (!state) return null;
  const changes = new Map();
  const editProgress = (parentCallId) => {
    if (changes.has(parentCallId)) return changes.get(parentCallId);
    const path = state.paths.get(parentCallId);
    if (!path) return null;
    const item = atPath(cached.timeline.items, path);
    const change = { item, path, events: item.progressEvents.slice(), prefixLength: item.progressEvents.length };
    changes.set(parentCallId, change);
    return change;
  };
  if (prefixLength < previous.length) {
    if (!SUB_AGENT_PROGRESS_TYPES.has(previous.at(-1)?.type)) return null;
    if (state.lastProgress) {
      const change = editProgress(state.lastProgress.parentCallId);
      if (!change) return null;
      change.events.length = state.lastProgress.index;
      change.prefixLength = change.events.length;
    }
  }
  let lastProgress = null;
  for (let index = prefixLength; index < events.length; index += 1) {
    const event = events[index];
    if (!SUB_AGENT_PROGRESS_TYPES.has(event.type)) return null;
    const parentCallId = event.parentCallId || event.parent_call_id || '';
    // Unknown/backfilled parents may have different event-admission semantics.
    const change = editProgress(parentCallId);
    if (!change) return null;
    const progress = progressEventFor(change.item, event, change.events.length, subAgentProgressState(event.type));
    if (!progress) continue;
    const last = change.events.at(-1);
    if (event.type !== 'sub_agent_answer_delta' && last?.type === event.type && last.summary === progress.summary) continue;
    change.events.push(progress);
    if (index === events.length - 1) lastProgress = { parentCallId, index: change.events.length - 1 };
  }
  let items = cached.timeline.items;
  for (const change of changes.values()) {
    if (change.prefixLength === change.item.progressEvents.length && change.events.length === change.prefixLength) continue;
    const progressEvents = recordStreamEventUpdate(change.events, change.item.progressEvents, change.prefixLength);
    items = replaceAtPath(items, change.path, { ...change.item, progressEvents });
  }
  return { timeline: { ...cached.timeline, items }, subAgentState: { paths: state.paths, lastProgress } };
}

const CHAT_TIMELINE_CACHE = new WeakMap();
const EVENT_TIMELINE_CACHE = new WeakMap();

function incrementalTextTimeline(task, status) {
  const events = task?.eventLog;
  const update = streamEventUpdate(events);
  const previousEvents = update?.previous.deref();
  const cached = previousEvents && EVENT_TIMELINE_CACHE.get(previousEvents);
  if (!cached || cached.status !== status || !isLiveTaskStatus(status)
    || cached.toolCalls !== task.toolCalls || cached.conversationId !== (task.conversationId || task.conversation_id || '')
    || events.length !== previousEvents.length || update.prefixLength !== events.length - 1) return null;
  const event = events.at(-1);
  const oldEvent = previousEvents.at(-1);
  if (!['llm_answer_delta', 'llm_thinking_delta'].includes(event?.type) || oldEvent.type !== event.type) return null;
  const tail = cached.timeline.items.at(-1);
  const kind = event.type === 'llm_answer_delta' ? 'text' : 'thinking';
  if (tail?.kind !== kind || !tail.streaming) return null;
  const oldText = eventDeltaText(oldEvent);
  const nextText = eventDeltaText(event);
  let text;
  if (kind === 'thinking') {
    if (!oldText || !tail.text.endsWith(oldText)) return null;
    text = tail.text.slice(0, -oldText.length) + nextText;
  } else if (tail.text === oldText.trim()) {
    text = nextText.trim();
  } else {
    const suffix = oldText.trimEnd();
    if (!suffix || !tail.text.endsWith(suffix)) return null;
    text = (tail.text.slice(0, -suffix.length) + nextText).trim();
  }
  return {
    timeline: { ...cached.timeline, items: [...cached.timeline.items.slice(0, -1), { ...tail, text }] },
    subAgentState: cached.subAgentState,
  };
}

function cacheTimeline(task, status, timeline, subAgentState) {
  if (task && typeof task === 'object') {
    CHAT_TIMELINE_CACHE.set(task, { status, timeline });
    if (Array.isArray(task.eventLog)) EVENT_TIMELINE_CACHE.set(task.eventLog, {
      status, timeline, subAgentState, toolCalls: task.toolCalls,
      conversationId: task.conversationId || task.conversation_id || '',
    });
  }
  return timeline;
}

// 工具卡片的形状只在这里定义：事件流那条路和 toolCalls 兜底那条路都走它。
// 以前两处各写一份，加一个字段总要记得改两遍。
function buildToolItem(call, finalStatus, id) {
  const category = categorizeToolCall(call);
  const skill = skillTrigger(call);
  return {
    kind: 'tool',
    id,
    callId: call.callId || '',
    category,
    label: timelineToolLabel(call, category),
    toolName: call.toolName || '',
    skillName: skill?.name || '',
    skillPath: skill?.path || '',
    inputSummary: call.inputSummary || '',
    outputSummary: call.outputSummary || '',
    toolInput: call.toolInput || null,
    toolResponse: call.toolResponse || null,
    toolOutput: call.toolOutput || '',
    message: call.message || '',
    executor: call.toolGroup || '',
    status: getToolTraceStatus(call.state, finalStatus),
    children: [],
    progressEvents: [],
  };
}

export function buildChatTimeline(task, taskStatus) {
  const conversationId = task?.conversationId || task?.conversation_id || '';
  const finalStatus = normalizeTaskStatus(taskStatus || task?.status);
  const cached = task && typeof task === 'object' ? CHAT_TIMELINE_CACHE.get(task) : null;
  if (cached?.status === finalStatus) return cached.timeline;
  const incremental = incrementalTextTimeline(task, finalStatus) || incrementalSubAgentTimeline(task, finalStatus);
  if (incremental) return cacheTimeline(task, finalStatus, incremental.timeline, incremental.subAgentState);

  const events = Array.isArray(task?.eventLog) ? task.eventLog : [];
  const toolCalls = Array.isArray(task?.toolCalls) ? task.toolCalls : [];
  const toolByCallId = new Map();
  for (const call of toolCalls) {
    if (call?.callId) toolByCallId.set(call.callId, call);
  }
  const isRunning = isLiveTaskStatus(finalStatus);

  const items = [];
  let textBuf = '';
  let textSegmentIndex = 0;
  let textBufBlockId = '';
  let thinkingBuf = '';
  let thinkingSegmentIndex = 0;
  let currentSkillItem = null;
  let currentCompactionItem = null;
  let latestTodos = null;
  const retryItemsByOperationId = new Map();
  const seenToolIds = new Set();
  // Track per-callId tool item so completion / failure events can update the
  // existing entry in place. Without this the entry is created at
  // tool_call_started time with status="running" and is NEVER updated,
  // which is what caused the "all tool calls yellow" regression after a
  // tab-switch round-trip rebuilds the timeline from the event log alone.
  const toolItemsByCallId = new Map();
  const { findTerminalForInput, mergeTerminalResult, updateTerminalOutput } = createTerminalTimeline({
    events: events.filter((event) => !String(event.type).startsWith('sub_agent_')),
    finalStatus,
  });
  const runtimeInputItemsById = new Map();
  const canNestToolChildren = (toolItem) => {
    if (!toolItem) return false;
    const status = String(toolItem.status || '').toLowerCase();
    return isToolInFlight(status);
  };
  let lastProgress = null;
  const appendToolProgress = (toolItem, event, state = '') => {
    if (!toolItem || !event) return;
    const progressEvents = toolItem.progressEvents || [];
    const progress = progressEventFor(toolItem, event, progressEvents.length, state);
    if (!progress) return;
    const last = progressEvents.at(-1);
    if (event.type !== 'sub_agent_answer_delta' && last?.type === event.type && last.summary === progress.summary) return;
    if (event === events.at(-1)) lastProgress = { parentCallId: toolItem.callId, index: progressEvents.length };
    progressEvents.push(progress);
    toolItem.progressEvents = progressEvents;
  };
  const appendSubAgentProgressByEvent = (event, state = '') => {
    const parentCallId = event?.parentCallId || event?.parent_call_id || '';
    if (!parentCallId) return;
    const toolItem = toolItemsByCallId.get(parentCallId);
    if (!toolItem) return;
    appendToolProgress(toolItem, event, state);
  };
  const finalizeToolItem = (callId, terminalState, event = null) => {
    if (!callId) return;
    const toolItem = toolItemsByCallId.get(callId);
    if (!toolItem) return;
    if (event && TOOL_SHELL_NAMES.has(normalizeToolName(toolItem.toolName))) {
      mergeTerminalResult(toolItem, event, terminalState);
    } else {
      const responseState = getToolResponseTraceStatus(event?.toolResponse, terminalState);
      toolItem.status = getToolTraceStatus(responseState || terminalState, finalStatus);
    }
    if (toolItem === currentSkillItem && !canNestToolChildren(toolItem)) {
      currentSkillItem = null;
    }
    if (!event) return;
    toolItem.outputSummary = event.outputSummary || toolItem.outputSummary || '';
    toolItem.toolResponse = event.toolResponse || toolItem.toolResponse || null;
    if (!TOOL_SHELL_NAMES.has(normalizeToolName(toolItem.toolName))) {
      toolItem.toolOutput = event.toolOutput || toolItem.toolOutput || '';
    }
    appendToolProgress(toolItem, event, terminalState);
  };

  const flushThinking = (streaming = false) => {
    const value = thinkingBuf;
    thinkingBuf = '';
    if (!value.trim()) return;
    items.push({
      kind: 'thinking',
      id: `thinking-${thinkingSegmentIndex}`,
      text: value,
      status: streaming ? 'running' : 'done',
      streaming,
    });
    thinkingSegmentIndex += 1;
    currentSkillItem = null;
  };

  let textBufSource = 'progress';
  const flushText = () => {
    const value = textBuf.trim();
    const source = textBufSource;
    const blockId = textBufBlockId;
    textBuf = '';
    textBufBlockId = '';
    textBufSource = 'progress';
    if (!value.trim()) return;
    items.push({
      kind: 'text',
      id: blockId || `text-${textSegmentIndex}`,
      text: value,
      source,
      streaming: false,
    });
    textSegmentIndex += 1;
    currentSkillItem = null;
  };

  for (const event of events) {
    const type = event.type;
    if (type === 'task_input_queued') {
      flushThinking(false);
      if (textBuf.trim()) flushText();
      const inputId = event.inputId || event.input_id || event.id || `task-input-${items.length}`;
      const item = {
        kind: 'user_input',
        id: inputId,
        text: stripInjectedSkillInstruction(event.message),
        images: normalizeChatImageRefs(event.imageAttachments || event.image_attachments, conversationId),
        status: 'pending',
        timestamp: event.timestamp || null,
      };
      runtimeInputItemsById.set(inputId, item);
      items.push(item);
      currentSkillItem = null;
      continue;
    }
    if (type === 'task_input_applied') {
      flushThinking(false);
      if (textBuf.trim()) flushText();
      const inputs = Array.isArray(event.inputs) ? event.inputs : [];
      for (const input of inputs) {
        const inputId = input?.input_id || input?.inputId || `task-input-${items.length}`;
        const existing = runtimeInputItemsById.get(inputId);
        if (existing) {
          existing.status = 'applied';
          existing.text = existing.text || stripInjectedSkillInstruction(input?.message);
          existing.images = normalizeChatImageRefs(
            mergeChatImageRefs(existing.images, input?.image_attachments || input?.imageAttachments),
            conversationId,
          );
          continue;
        }
        const item = {
          kind: 'user_input',
          id: inputId,
          text: stripInjectedSkillInstruction(input?.message),
          images: normalizeChatImageRefs(input?.image_attachments || input?.imageAttachments, conversationId),
          status: 'applied',
          timestamp: event.timestamp || null,
        };
        runtimeInputItemsById.set(inputId, item);
        items.push(item);
      }
      currentSkillItem = null;
      continue;
    }
    if (type === 'llm_thinking_delta') {
      thinkingBuf += eventDeltaText(event);
      continue;
    }
    if (type === 'context_compaction_started' || type === 'context_compaction_completed' || type === 'context_compaction_failed') {
      flushThinking(false);
      if (textBuf.trim()) flushText();
      if (type !== 'context_compaction_started') {
        const finishedItem = {
          summaryText: String(event.compactionSummary || event.summary_text || '').trim(),
          details: [
            (event.compactedMessageCount ?? event.message_count) != null
              ? `${Number(event.compactedMessageCount ?? event.message_count).toLocaleString()} messages`
              : '',
            (event.promptTokensBeforeCompaction ?? event.prompt_tokens_before_compaction) != null
              ? `${Number(event.promptTokensBeforeCompaction ?? event.prompt_tokens_before_compaction).toLocaleString()} → ${Number(event.promptTokensAfterCompaction ?? event.prompt_tokens_after_compaction ?? 0).toLocaleString()} tokens`
              : '',
            (event.summaryTokens ?? event.summary_tokens) != null
              ? `${Number(event.summaryTokens ?? event.summary_tokens).toLocaleString()} summary tokens`
              : '',
          ].filter(Boolean),
          status: type === 'context_compaction_failed' ? 'failed' : 'done',
        };
        if (currentCompactionItem) {
          Object.assign(currentCompactionItem, finishedItem);
        } else {
          items.push({
            kind: 'meta',
            id: event.event_id || `meta-${items.length}`,
            summary: 'Auto-Compacting context',
            ...finishedItem,
          });
        }
        currentCompactionItem = null;
      } else {
        currentCompactionItem = {
          kind: 'meta',
          id: event.event_id || `meta-${items.length}`,
          summary: 'Auto-Compacting context',
          details: [],
          status: 'running',
        };
        items.push(currentCompactionItem);
      }
      currentSkillItem = null;
      continue;
    }
    if (type === 'llm_answer_delta') {
      flushThinking(false);
      const blockId = event.textBlockId || event.text_block_id || '';
      if (textBuf.trim() && blockId && textBufBlockId && blockId !== textBufBlockId) {
        flushText();
      }
      textBufBlockId = blockId || textBufBlockId;
      textBuf += eventDeltaText(event);
      textBufSource = event.messagePhase || event.message_phase || 'answer';
      continue;
    }
    if (type === 'llm_retry') {
      flushThinking(false);
      if (textBuf.trim()) flushText();
      const operationId = String(event.operationId || '');
      if (!operationId) continue;
      const retryState = String(event.retryState || 'retrying');
      const next = {
        summary: llmRetrySummary(event),
        status: retryState === 'recovered' ? 'done' : retryState === 'exhausted' ? 'failed' : 'running',
        retryState,
        reason: event.reason,
        attempt: event.attempt,
        maxAttempts: event.maxAttempts,
      };
      const existing = retryItemsByOperationId.get(operationId);
      if (existing) {
        Object.assign(existing, next);
      } else {
        const item = {
          kind: 'meta',
          metaType: 'llm_retry',
          id: `llm-retry-${operationId}`,
          operationId,
          details: [],
          ...next,
        };
        retryItemsByOperationId.set(operationId, item);
        items.push(item);
      }
      currentSkillItem = null;
      continue;
    }
    if (type === 'llm_text_phase_resolved') {
      const blockId = event.textBlockId || event.text_block_id || '';
      const messagePhase = event.messagePhase || event.message_phase || 'unknown';
      if (blockId && blockId === textBufBlockId) {
        textBufSource = messagePhase;
      } else if (blockId) {
        const item = items.find((candidate) => candidate.kind === 'text' && candidate.id === blockId);
        if (item) item.source = messagePhase;
      }
      continue;
    }
    if (type === 'agent_progress_delta') {
      flushThinking(false);
      if (textBuf.trim()) flushText();
      textBuf += event.message || '';
      textBufBlockId = event.textBlockId || event.text_block_id || '';
      textBufSource = 'progress';
      flushText();
      continue;
    }
    if (
      type === 'sub_agent_progress_delta'
      || type === 'sub_agent_answer_delta'
      || type === 'sub_agent_tool_call_started'
      || type === 'sub_agent_tool_call_completed'
      || type === 'sub_agent_started'
      || type === 'sub_agent_finished'
    ) {
      appendSubAgentProgressByEvent(
        event,
        subAgentProgressState(type),
      );
      continue;
    }
    if (type === 'todo_updated') {
      latestTodos = sanitizeTodoItems(event.todoItems);
      continue;
    }
    if (type === 'tool_call_started') {
      flushThinking(false);
      if (textBufSource === 'unknown' || textBufSource === 'answer') textBufSource = 'commentary';
      if (textBuf.trim()) flushText();
      const callId = event.callId || '';
      const eventToolName = normalizeToolName(event.toolName);
      if (TOOL_TIMELINE_HIDDEN_NAMES.has(eventToolName)) continue;
      if (TOOL_TERMINAL_INPUT_NAMES.has(eventToolName)) {
        const parent = findTerminalForInput(event.toolInput || event.tool_input);
        if (parent) {
          parent.status = getToolTraceStatus('running', finalStatus);
          if (callId) {
            seenToolIds.add(callId);
            toolItemsByCallId.set(callId, parent);
          }
        }
        continue;
      }
      if (callId && seenToolIds.has(callId)) {
        const existing = toolItemsByCallId.get(callId);
        if (existing) {
          existing.inputSummary = event.inputSummary || existing.inputSummary || '';
          existing.outputSummary = event.outputSummary || existing.outputSummary || '';
          existing.toolInput = event.toolInput || existing.toolInput || null;
          existing.toolResponse = event.toolResponse || existing.toolResponse || null;
          existing.toolOutput = event.toolOutput || existing.toolOutput || '';
          existing.message = event.message || existing.message || '';
          appendToolProgress(existing, event, 'requested');
        }
        continue;
      }
      const call = (callId && toolByCallId.get(callId)) || {
        callId,
        toolName: event.toolName,
        toolGroup: event.toolGroup,
        kind: event.kind,
        skillName: event.skillName,
        skillPath: event.skillPath,
        inputSummary: event.inputSummary,
        outputSummary: '',
        toolInput: event.toolInput || null,
        toolResponse: event.toolResponse || null,
        toolOutput: event.toolOutput || '',
        message: event.message || '',
        state: 'requested',
      };
      const toolItem = buildToolItem(call, finalStatus, callId || `tool-${seenToolIds.size}`);
      if (TOOL_SHELL_NAMES.has(eventToolName)) {
        mergeTerminalResult(toolItem, call, call.state || 'requested', true);
      }
      appendToolProgress(toolItem, event, 'requested');
      if (callId) {
        seenToolIds.add(callId);
        toolItemsByCallId.set(callId, toolItem);
      }
      if (toolItem.category === 'skill') {
        items.push(toolItem);
        currentSkillItem = canNestToolChildren(toolItem) ? toolItem : null;
      } else if (canNestToolChildren(currentSkillItem)) {
        currentSkillItem.children.push(toolItem);
      } else {
        items.push(toolItem);
      }
      continue;
    }
    if (type === 'tool_output_delta') {
      // 实时命令输出：把 exec_command 的输出增量追加到对应工具卡片，
      // 让 shell 卡片像终端一样边执行边滚动，而不是等命令跑完才一次性显示。
      const callId = event.callId || event.toolCallId || event.tool_call_id || '';
      if (callId) {
        const toolItem = toolItemsByCallId.get(callId);
        if (toolItem) {
          const delta = String(event.delta || event.text || event.contentDelta || event.content || '');
          if (delta) {
            if (TOOL_SHELL_NAMES.has(normalizeToolName(toolItem.toolName))) {
              updateTerminalOutput(toolItem, callId, delta, true);
            } else {
              toolItem.toolOutput = `${toolItem.toolOutput || ''}${delta}`;
            }
            toolItem.status = getToolTraceStatus('running', finalStatus);
          }
        }
      }
      continue;
    }
    if (type === 'tool_call_completed') {
      // Tool finished cleanly: flip the existing tool item to done. We do not
      // touch text / thinking buffers because these completion events
      // intentionally come after the tool's matching request event.
      finalizeToolItem(event.callId || '', 'completed', event);
      continue;
    }
    if (type === 'tool_executor_failed' || type === 'tool_executor_error') {
      finalizeToolItem(event.callId || '', 'failed');
      continue;
    }
    // 元事件（run_started / provider_selected /
    // context_usage_updated / tool_budget_applied / llm_thinking_started/completed）
    // 不在聊天时间线里渲染——只保留 LLM 文本、reasoning 流和工具调用。
  }

  // Cancellation or stream termination may omit the matching retry/compaction
  // finish event. Settle only unfinished rows; keep recorded outcomes intact.
  if (isTerminalTaskStatus(finalStatus)) {
    for (const item of items) {
      if (item.kind === 'meta' && item.status === 'running') item.status = finalStatus;
    }
  }

  if (thinkingBuf.trim()) {
    flushThinking(isRunning);
  }
  if (textBuf.trim()) {
    items.push({
      kind: 'text',
      id: textBufBlockId || `text-${textSegmentIndex}`,
      text: textBuf.trim(),
      source: textBufSource,
      streaming: isRunning,
    });
    textSegmentIndex += 1;
  }

  const eventToolCallIds = new Set(toolItemsByCallId.keys());
  // Missing start events must not turn early calls into the newest rows.
  // Use the next event-backed call in toolCalls order as an insertion anchor,
  // preserving event-ordered text and existing skill nesting around that anchor.
  const insertBeforeCall = (rows, callId, item) => {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (row.callId === callId) {
        rows.splice(index, 0, item);
        return true;
      }
      if (row.children?.length && insertBeforeCall(row.children, callId, item)) return true;
    }
    return false;
  };
  const nextEventCallIds = new Map();
  let nextEventCallId = '';
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const call = toolCalls[index];
    if (!call?.callId) continue;
    nextEventCallIds.set(call.callId, nextEventCallId);
    if (eventToolCallIds.has(call.callId)
      && !TOOL_TERMINAL_INPUT_NAMES.has(normalizeToolName(call.toolName))) {
      nextEventCallId = call.callId;
    }
  }
  for (const call of toolCalls) {
    if (!call?.callId || seenToolIds.has(call.callId)) continue;
    const callToolName = normalizeToolName(call.toolName);
    if (TOOL_TIMELINE_HIDDEN_NAMES.has(callToolName)) continue;
    if (TOOL_TERMINAL_INPUT_NAMES.has(callToolName)) {
      const parent = findTerminalForInput(call.toolInput);
      if (parent) {
        toolItemsByCallId.set(call.callId, parent);
        mergeTerminalResult(parent, call, call.state || 'completed');
      }
      seenToolIds.add(call.callId);
      continue;
    }
    const toolItem = buildToolItem(call, finalStatus, call.callId);
    if (TOOL_SHELL_NAMES.has(callToolName)) {
      mergeTerminalResult(toolItem, call, call.state || 'requested');
    }
    seenToolIds.add(call.callId);
    const anchorCallId = nextEventCallIds.get(call.callId);
    if (anchorCallId && insertBeforeCall(items, anchorCallId, toolItem)) continue;
    if (toolItem.category === 'skill') {
      items.push(toolItem);
      currentSkillItem = canNestToolChildren(toolItem) ? toolItem : null;
    } else if (canNestToolChildren(currentSkillItem)) {
      currentSkillItem.children.push(toolItem);
    } else {
      items.push(toolItem);
    }
  }

  // When the task is done, the final answer is rendered separately as markdown
  // below the (collapsed) timeline. If the last streamed text segment is the same
  // text (which happens when the LLM produced the answer without a tool call, so
  // TextDelta and FinalAnswer carry identical content), drop it from the timeline
  // to avoid showing the answer twice when the user expands the trace.
  if (!isRunning) {
    const finalAnswer = String(task?.answerText || '').trim();
    if (finalAnswer) {
      while (items.length) {
        const last = items[items.length - 1];
        if (last.kind !== 'text') break;
        const lastText = String(last.text || '').trim();
        if (!lastText) {
          items.pop();
          continue;
        }
        if (
          lastText === finalAnswer
          || finalAnswer.startsWith(lastText)
          || lastText.startsWith(finalAnswer)
        ) {
          items.pop();
          continue;
        }
        break;
      }
    }
  }

  // No "Preparing…" / "Queued…" placeholder——空时间线就让外面的 streaming 活动指示器
  // 单独承担"任务进行中"的视觉反馈，避免连续显示两条无内容信息。

  // 折叠"两段文本之间"的连续工具调用为单行聚合 chip。聊天阅读时关心解决思路
  // (text + thinking)，不关心 read_file / chrome_devtools_* 反复的细节；想看
  // 单条工具调用时点开 chip 还能看到原来的 ChatTimelineToolNode 列表。
  const timeline = { items: groupConsecutiveTools(items), latestTodos };
  return cacheTimeline(task, finalStatus, timeline, {
    paths: toolPathsIn(timeline.items, eventToolCallIds), lastProgress,
  });
}

function sanitizeTodoItems(items) {
  if (!Array.isArray(items)) return null;
  const sanitized = items
    .map((entry) => {
      const obj = entry && typeof entry === 'object' ? entry : {};
      const content = String(obj.content || '').trim();
      if (!content) return null;
      const statusRaw = String(obj.status || 'pending');
      const status = ['pending', 'in_progress', 'completed'].includes(statusRaw)
        ? statusRaw
        : 'pending';
      const activeForm = obj.activeForm ? String(obj.activeForm) : '';
      return { content, status, activeForm };
    })
    .filter(Boolean);
  return sanitized.length > 0 ? sanitized : null;
}
