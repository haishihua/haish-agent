// @haish-esm
const MERGEABLE_STREAM_EVENT_TYPES = new Set([
  'llm_answer_delta',
  'llm_thinking_delta',
  'tool_output_delta',
  'sub_agent_answer_delta',
]);

function nestedData(event) {
  return event?.data && typeof event.data === 'object' ? event.data : {};
}

function eventValue(event, snakeKey, camelKey = snakeKey) {
  const data = nestedData(event);
  return event?.[snakeKey]
    ?? event?.[camelKey]
    ?? data?.[snakeKey]
    ?? data?.[camelKey]
    ?? null;
}

function defaultDeltaText(event) {
  return String(
    event?.delta
    ?? event?.message
    ?? event?.text
    ?? nestedData(event).delta
    ?? nestedData(event).text
    ?? '',
  );
}

export function mergeAdjacentStreamEvent(previous, event, getText = defaultDeltaText) {
  if (!previous || !event || previous.type !== event.type) return null;
  if (!MERGEABLE_STREAM_EVENT_TYPES.has(event.type)) return null;

  const previousCallId = eventValue(previous, 'call_id', 'callId')
    || eventValue(previous, 'tool_call_id', 'toolCallId');
  const eventCallId = eventValue(event, 'call_id', 'callId')
    || eventValue(event, 'tool_call_id', 'toolCallId');
  if (event.type === 'tool_output_delta' && (!previousCallId || !eventCallId)) return null;

  const previousParentCallId = eventValue(previous, 'parent_call_id', 'parentCallId');
  const eventParentCallId = eventValue(event, 'parent_call_id', 'parentCallId');
  if (event.type === 'sub_agent_answer_delta'
    && !(previousCallId || previousParentCallId)
    && !(eventCallId || eventParentCallId)) return null;

  const sameStream = (
    eventValue(previous, 'task_id', 'taskId') === eventValue(event, 'task_id', 'taskId')
    && eventValue(previous, 'conversation_id', 'conversationId')
      === eventValue(event, 'conversation_id', 'conversationId')
    && eventValue(previous, 'loop_index', 'loopIndex') === eventValue(event, 'loop_index', 'loopIndex')
    && previousCallId === eventCallId
    && previousParentCallId === eventParentCallId
    && eventValue(previous, 'text_block_id', 'textBlockId')
      === eventValue(event, 'text_block_id', 'textBlockId')
    && eventValue(previous, 'message_phase', 'messagePhase')
      === eventValue(event, 'message_phase', 'messagePhase')
  );
  if (!sameStream) return null;

  const mergedText = `${getText(previous)}${getText(event)}`;
  if (!mergedText) return null;
  return {
    ...previous,
    ...event,
    event_id: previous.event_id || event.event_id,
    eventId: previous.eventId || event.eventId,
    created_at: previous.created_at || event.created_at,
    timestamp: previous.timestamp || event.timestamp,
    delta: mergedText,
    message: mergedText,
  };
}

export function appendStreamEvent(events, event, getText = defaultDeltaText) {
  const list = Array.isArray(events) ? events : [];
  const lastIndex = list.length - 1;
  const merged = mergeAdjacentStreamEvent(list[lastIndex], event, getText);
  if (!merged) return [...list, event];
  return [...list.slice(0, lastIndex), merged];
}

export function compactStreamEvents(events, getText = defaultDeltaText) {
  if (!Array.isArray(events) || events.length < 2) return Array.isArray(events) ? events : [];
  const compacted = [];
  for (const event of events) {
    const lastIndex = compacted.length - 1;
    const merged = mergeAdjacentStreamEvent(compacted[lastIndex], event, getText);
    if (merged) compacted[lastIndex] = merged;
    else compacted.push(event);
  }
  return compacted;
}
