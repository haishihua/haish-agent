import { deduplicateRuntimeEvents, runtimeEventIds } from './event-identity.js';

const MERGEABLE_STREAM_EVENT_TYPES = new Set([
  'llm_answer_delta',
  'llm_thinking_delta',
  'tool_output_delta',
  'sub_agent_answer_delta',
]);

const STREAM_UPDATES = new WeakMap();
export function streamEventUpdate(events) {
  return STREAM_UPDATES.get(events);
}

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

// Literal merging only: raw identities must be accepted before batching.
function mergeAdjacentStreamText(previous, event, getText) {
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

export function mergeAdjacentStreamEvent(previous, event, getText = defaultDeltaText) {
  const merged = mergeAdjacentStreamText(previous, event, getText);
  if (merged) {
    merged.deltaEventIds = [...runtimeEventIds(previous), ...runtimeEventIds(event)];
  }
  return merged;
}

export function appendStreamEvent(events, event, getText = defaultDeltaText) {
  const list = Array.isArray(events) ? events : [];
  const lastIndex = list.length - 1;
  const merged = mergeAdjacentStreamEvent(list[lastIndex], event, getText);
  const next = merged ? [...list.slice(0, lastIndex), merged] : [...list, event];
  // Weak references avoid retaining every previous streaming array.
  STREAM_UPDATES.set(next, { previous: new WeakRef(list), prefixLength: merged ? lastIndex : list.length });
  return next;
}

export function compactStreamEvents(events, getText = defaultDeltaText) {
  if (!Array.isArray(events) || events.length < 2) return Array.isArray(events) ? events : [];
  const compacted = [];
  // History/cache ingestion sees raw events before their text is compacted.
  // Reject replay in one Set pass, not a scan of the accumulated event log.
  for (const event of deduplicateRuntimeEvents(events)) {
    const lastIndex = compacted.length - 1;
    const previous = compacted[lastIndex];
    const merged = mergeAdjacentStreamText(previous, event, getText);
    if (merged) {
      // This array is owned by this compaction, never the input. Append ids
      // in place rather than copying the growing prefix on every delta.
      merged.deltaEventIds = previous.deltaEventIds;
      for (const id of runtimeEventIds(event)) merged.deltaEventIds.push(id);
      compacted[lastIndex] = merged;
    } else {
      compacted.push(MERGEABLE_STREAM_EVENT_TYPES.has(event.type)
        ? { ...event, deltaEventIds: [...runtimeEventIds(event)] }
        : event);
    }
  }
  return compacted;
}
