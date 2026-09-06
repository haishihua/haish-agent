import { streamEventUpdate } from '../../chat/model/stream-events.js';

const cache = new WeakMap();
const EMPTY = [];
const isControlEvent = (event) => ['workflow_node_started', 'workflow_node_finished', 'workflow_edge_selected'].includes(event?.type);

export function workflowControlEvents(events) {
  if (!Array.isArray(events)) return EMPTY;
  if (cache.has(events)) return cache.get(events);
  const update = streamEventUpdate(events);
  const previous = update?.previous.deref();
  let controls;
  if (previous && cache.has(previous)
    && (update.prefixLength === previous.length || !isControlEvent(previous.at(-1)))) {
    const added = events.slice(update.prefixLength).filter(isControlEvent);
    const existing = cache.get(previous);
    controls = added.length ? [...existing, ...added] : existing;
  } else {
    controls = events.filter(isControlEvent);
  }
  cache.set(events, controls);
  return controls;
}
