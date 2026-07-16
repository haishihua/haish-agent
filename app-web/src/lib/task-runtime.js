// @haish-esm
import { API_BASE } from '../api/base.js';
import {
  normalizeChatImageRefs,
  mergeChatImageRefs,
  chatImageFallbacksByTaskIdFromMessages,
  generateHexId,
  taskUpdatedTimestamp,
  taskCreatedTimestamp,
  registerTaskSummaryMapper,
} from './workspace-state.js';
import { stripChatImageAugmentation } from './chat-text.js';
import { PROVIDER_ACTOR_MAP, WORLD_ROLE_TO_ACTOR, WORLD_KIND_MAP } from './world-runtime.js';
import {
  resolveProviderMeta,
  normalizeWorldEvents,
  worldEventToRuntimeLog,
  getLoopIndexFromWorldEvents,
  getActiveRoleFromWorldEvents,
  executorActorForToolGroup,
  sceneKeyForWorldEvent,
  getWorldEventTag,
  summarizeText,
  defaultQuestDescription,
  WORLD_SCENE_EVENT_TYPES,
  WORLD_EVENT_ROUTE_MAP,
  PROVIDER_SCENE_EVENT_TYPES,
} from './world-events.js';
import { STATIONS } from '../World.jsx';

export function createEmptyWorldTaskState() {
  return {
    activeTaskId: null,
    pendingTask: null,
    taskOrder: [],
    tasksById: {},
  };
}

export function normalizeTaskStatus(status) {
  if (status === 'aborted') return 'cancelled';
  if (status === 'completed') return 'done';
  return status || 'queued';
}

export function isTerminalTaskStatus(status) {
  const normalized = normalizeTaskStatus(status);
  return normalized === 'done' || normalized === 'failed' || normalized === 'cancelled';
}

/**
 * Events that actually become agent-visible chat content (trace / answer / tools).
 *
 * Lifecycle receipts and markers that never render in the chat bubble must NOT
 * count — e.g. user_message_received, agent_gateway_received, provider_selected,
 * llm_thinking_started/completed. Otherwise Stop-before-visualization keeps an
 * empty You/Assistant shell instead of rolling the turn back.
 *
 * Keep this aligned with buildChatTimeline's rendered event kinds.
 */
const ASSISTANT_VISIBLE_STREAM_EVENT_TYPES = new Set([
  'llm_thinking_delta',
  'llm_answer_delta',
  'llm_final_answer',
  'llm_tool_call_requested',
  'agent_progress_delta',
  'context_compaction_started',
  'context_compaction_completed',
  'tool_manager_received',
  'tool_dispatched',
  'tool_executor_started',
  'tool_executor_completed',
  'tool_result_returned',
  'sub_agent_started',
  'sub_agent_finished',
  'sub_agent_progress_delta',
  'sub_agent_answer_delta',
  'sub_agent_tool_call_requested',
  'sub_agent_tool_executor_completed',
]);

function eventLogEntryType(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(entry.type || entry.event_type || entry.eventType || '').trim();
}

function eventLogEntryText(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(
    entry.delta
    || entry.text
    || entry.content
    || entry.message
    || entry.contentDelta
    || entry.outputSummary
    || entry.output_summary
    || ''
  ).trim();
}

function eventLogEntryHasVisiblePayload(entry) {
  const type = eventLogEntryType(entry);
  if (!ASSISTANT_VISIBLE_STREAM_EVENT_TYPES.has(type)) return false;
  // Text-bearing stream events only count once they carry real text.
  // Empty lifecycle-style progress must not keep cancelled You/Assistant shells.
  if (
    type === 'llm_thinking_delta'
    || type === 'llm_answer_delta'
    || type === 'agent_progress_delta'
    || type === 'sub_agent_progress_delta'
    || type === 'sub_agent_answer_delta'
  ) {
    return Boolean(eventLogEntryText(entry));
  }
  return true;
}

/** True when the assistant has already produced user-visible chat content. */
export function taskHasAssistantStreamContent(task) {
  if (!task) return false;
  if (String(task.answerText || '').trim()) return true;
  if (Array.isArray(task.toolCalls) && task.toolCalls.length > 0) return true;
  if (Array.isArray(task.eventLog) && task.eventLog.some(eventLogEntryHasVisiblePayload)) {
    return true;
  }
  // chatStreamText alone is not enough: early receipts write "Task received."
  // before any agent-visible bubble content exists.
  return false;
}

export function applyTerminalTaskState(task, status, options = {}) {
  if (!task) return task;
  const normalized = normalizeTaskStatus(status);
  const now = Date.now();
  return {
    ...task,
    status: normalized,
    stage: 'done',
    updatedAt: now,
    completedAt: task.completedAt || now,
    error: options.error ?? task.error ?? null,
    aborted: options.aborted ?? task.aborted ?? normalized === 'cancelled',
    presentationPending: false,
    sceneCatchup: false,
    serverFinished: true,
  };
}

export function sortTaskIdsForRestore(tasks) {
  return tasks
    .map((task, index) => ({
      taskId: task.task_id,
      createdAt: taskCreatedTimestamp(task),
      index,
    }))
    .filter((item) => item.taskId)
    .sort((a, b) => {
      if (a.createdAt && b.createdAt && a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      return a.index - b.index;
    })
    .map((item) => item.taskId);
}

export function createPendingTaskDraft(text, attachment, imageAttachments) {
  const now = Date.now();
  const displayText = stripChatImageAugmentation(text).text || String(text || '').trim();
  return {
    id: generateHexId(),
    title: displayText,
    description: defaultQuestDescription(displayText),
    createdAt: now,
    updatedAt: now,
    stage: 'assigned',
    status: 'queued',
    assignedTo: 'guts',
    assignedToLabel: 'Assistant',
    requestedProvider: '',
    attachment: attachment ? { ...attachment } : null,
    imageAttachments: Array.isArray(imageAttachments)
      ? imageAttachments.map((ref) => ({ ...ref }))
      : [],
    originViewMode: 'world',
  };
}

export function buildWorldTaskRecord(event, pendingTask) {
  const pendingImages = Array.isArray(pendingTask?.imageAttachments)
    ? pendingTask.imageAttachments.map((ref) => ({ ...ref }))
    : [];
  const fallbackTitle = stripChatImageAugmentation(pendingTask?.title || event.message || '').text || 'Task';
  return {
    taskId: event.task_id,
    conversationId: event.conversation_id || null,
    title: fallbackTitle,
    description: pendingTask?.description || defaultQuestDescription(fallbackTitle),
    status: 'queued',
    stage: 'assigned',
    createdAt: pendingTask?.createdAt || Date.now(),
    updatedAt: pendingTask?.updatedAt || pendingTask?.createdAt || Date.now(),
    imageAttachments: pendingImages,
    completedAt: null,
    assignedTo: 'guts',
    assignedToLabel: 'Assistant',
    attachment: pendingTask?.attachment || null,
    attachments: pendingTask?.attachment ? [{ ...pendingTask.attachment }] : [],
    loopIndex: Math.max(0, event.loop_index || 0),
    activeRole: event.actor || null,
    provider: null,
    providerKey: pendingTask?.requestedProvider || '',
    requestedProvider: pendingTask?.requestedProvider || '',
    requestedAgentId: pendingTask?.requestedAgentId || '',
    requestedWorkflowId: pendingTask?.requestedWorkflowId || '',
    executionMode: pendingTask?.executionMode === 'bot' ? 'bot' : 'chat',
    originViewMode: pendingTask?.originViewMode || 'world',
    workflowSnapshot: pendingTask?.workflowSnapshot || null,
    workflowRun: pendingTask?.workflowRun || null,
    providerState: pendingTask?.requestedProvider ? {
      provider: pendingTask.requestedProvider,
      state: 'selected',
      selected: true,
      reason: 'Selected from the page.',
      model: null,
    } : null,
    answerText: '',
    chatStreamText: '',
    toolCalls: [],
    eventLog: [],
    sources: [],
    memory: [],
    error: null,
    presentationPending: false,
    serverFinished: false,
    sceneCatchup: false,
  };
}

export function taskSummaryToRuntimeTask(task, fallbackImageAttachments = [], ownerId = '') {
  const taskAttachments = Array.isArray(task.attachments)
    ? task.attachments.map((attachment) => ({ ...attachment, uploaded: true }))
    : [];
  const titleParts = stripChatImageAugmentation(task.title);
  const descriptionParts = stripChatImageAugmentation(task.description);
  const imageAttachments = normalizeChatImageRefs(
    mergeChatImageRefs(task.image_attachments || task.imageAttachments || [], fallbackImageAttachments, titleParts.imageRefs, descriptionParts.imageRefs),
    task.conversation_id,
    ownerId,
  );
  const title = titleParts.text || String(task.title || '').trim() || 'Task';
  return {
    taskId: task.task_id,
    conversationId: task.conversation_id,
    title,
    description: descriptionParts.text || defaultQuestDescription(title),
    status: task.status,
    stage: task.stage,
    createdAt: task.created_at ? Date.parse(task.created_at) || Date.now() : Date.now(),
    updatedAt: task.updated_at
      ? Date.parse(task.updated_at) || null
      : (task.completed_at ? Date.parse(task.completed_at) || null : null),
    completedAt: task.completed_at ? Date.parse(task.completed_at) || null : null,
    assignedTo: 'guts',
    assignedToLabel: 'Assistant',
    attachment: taskAttachments[0] || null,
    attachments: taskAttachments,
    imageAttachments,
    loopIndex: 0,
    activeRole: null,
    provider: task.provider,
    providerKey: task.provider_key || 'auto',
    requestedProvider: task.provider_key || 'auto',
    requestedAgentId: task.agent_id || task.profile_id || '',
    requestedWorkflowId: task.workflow_id || '',
    executionMode: task.execution_mode === 'bot' ? 'bot' : 'chat',
    originViewMode: task.execution_mode === 'bot' ? 'world' : 'chat',
    workflowSnapshot: task.workflow_snapshot || null,
    workflowRun: task.workflow_run || null,
    requestedModelId: task.model || '',
    profileId: task.profile_id || task.agent_id || '',
    profileDisplayName: task.profile_display_name || '',
    providerState: task.provider || task.provider_key ? {
      provider: task.provider || task.provider_key,
      state: 'selected',
      selected: true,
      reason: 'Restored from conversation history.',
      model: task.model || null,
    } : null,
    answerText: task.answer_text || '',
    chatStreamText: '',
    toolCalls: [],
    eventLog: [],
    sources: Array.isArray(task.sources) ? task.sources : [],
    memory: Array.isArray(task.memory) ? task.memory : [],
    error: task.error || null,
    presentationPending: false,
    serverFinished: task.status === 'done' || task.status === 'failed' || task.status === 'cancelled',
    sceneCatchup: false,
  };
}

export function taskDetailToRuntimeTask(task, previousTask = null, ownerId = '') {
  const events = normalizeWorldEvents(task.events);
  const summaryTask = taskSummaryToRuntimeTask(task, previousTask?.imageAttachments || [], ownerId);
  const nextTask = {
    ...(previousTask || summaryTask),
    ...summaryTask,
    loopIndex: getLoopIndexFromWorldEvents(events),
    activeRole: getActiveRoleFromWorldEvents(events),
    eventLog: events.map(worldEventToRuntimeLog),
  };
  return nextTask;
}

export function buildAgentLiveSnapshot(task, events) {
  const next = {};
  const providerMeta = resolveProviderMeta(task);
  for (const event of events) {
    if (!WORLD_SCENE_EVENT_TYPES.has(event.type)) continue;
    const actorId = event.actor_id || WORLD_ROLE_TO_ACTOR[event.actor];
    const executorActorId = event.executor_actor_id || executorActorForToolGroup(event.tool_group);
    const sceneKey = sceneKeyForWorldEvent(event, executorActorId);
    const routeConfig = WORLD_EVENT_ROUTE_MAP[sceneKey] || WORLD_EVENT_ROUTE_MAP[event.type];
    const actor = PROVIDER_SCENE_EVENT_TYPES.has(event.type)
      ? providerMeta.actor
      : event.tool_group === 'skill'
        ? providerMeta.actor
      : routeConfig?.actor || actorId;
    if (!actor || !STATIONS[actor]) continue;
    const bubble = event.type === 'provider_selected'
      ? providerMeta.label
      : event.message || event.delta || routeConfig?.bubble || '';
    const kind = event.kind || routeConfig?.kind || WORLD_KIND_MAP[actor] || 'deliver';
    next[actor] = mergeAgentLiveEntry(next[actor], {
      taskId: task.task_id || task.taskId,
      description: summarizeText(bubble || event.content || event.tool_name || event.type),
      stepCurrent: Math.max(1, event.loop_index || 1),
      stepTotal: Math.max(1, event.loop_index || 1),
      tag: getWorldEventTag(event.type, kind),
      kind,
      ts: Date.parse(event.timestamp) || Date.now(),
      status: getLiveEventStatus(event.type),
    });
  }
  if (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') {
    const outcome = normalizeTaskStatus(task.status);
    for (const actor of Object.keys(next)) {
      next[actor] = completeAgentLiveEntries(next[actor], task.task_id || task.taskId, outcome);
    }
  }
  return next;
}

export function getLiveEventStatus(eventType) {
  if (eventType === 'agent_gateway_received'
    || eventType === 'context_compaction_started'
    || eventType === 'llm_thinking_started'
    || eventType === 'llm_tool_call_requested'
    || eventType === 'tool_manager_received'
    || eventType === 'tool_dispatched'
    || eventType === 'tool_executor_started') {
    return 'pending';
  }
  return 'done';
}

export function normalizeLiveEntryStatus(status, outcome, completed) {
  const normalizedOutcome = normalizeTaskStatus(outcome);
  if (normalizedOutcome === 'failed') return 'failed';
  if (normalizedOutcome === 'cancelled') return 'cancelled';
  if (normalizedOutcome === 'done') return 'done';
  if (status === 'failed' || status === 'cancelled' || status === 'done' || status === 'pending') return status;
  return completed ? 'done' : 'pending';
}

export function legacyLiveEntries(agentState) {
  if (!agentState) return [];
  if (Array.isArray(agentState.entries)) return agentState.entries;
  if (!agentState.description && !agentState.tag) return [];
  return [{
    id: agentState.id || `${agentState.taskId || 'task'}:${agentState.ts || Date.now()}:legacy`,
    taskId: agentState.taskId,
    description: agentState.description || '',
    stepCurrent: agentState.stepCurrent || 1,
    stepTotal: agentState.stepTotal || 1,
    tag: agentState.tag || 'WORKING',
    kind: agentState.kind || 'info',
    ts: agentState.ts || Date.now(),
    status: normalizeLiveEntryStatus(agentState.status, agentState.outcome, agentState.completed),
    outcome: agentState.outcome,
  }];
}

export function mergeAgentLiveEntry(agentState, payload) {
  const ts = payload.ts || Date.now();
  const entries = legacyLiveEntries(agentState);
  const id = payload.entryKey || `${payload.taskId || 'task'}:${ts}:${entries.length}`;
  const status = normalizeLiveEntryStatus(payload.status, payload.outcome, payload.completed);
  const entry = {
    id,
    taskId: payload.taskId,
    description: payload.description || '',
    stepCurrent: payload.stepCurrent || 1,
    stepTotal: payload.stepTotal || 1,
    tag: payload.tag || 'WORKING',
    kind: payload.kind || 'info',
    ts,
    status,
    outcome: payload.outcome,
  };
  const settledEntries = entries.map((item) => (
    item.taskId === entry.taskId && item.id !== id && item.status === 'pending'
      ? { ...item, status: 'done', outcome: item.outcome || 'done' }
      : item
  ));
  const existingIndex = settledEntries.findIndex((item) => item.id === id);
  const nextEntries = existingIndex >= 0
    ? settledEntries.map((item, index) => (index === existingIndex ? { ...item, ...entry } : item))
    : [...settledEntries, entry];
  const trimmedEntries = nextEntries
    .sort((a, b) => a.ts - b.ts)
    .slice(-80);
  return {
    ...(agentState || {}),
    ...payload,
    ts,
    completed: entry.status !== 'pending',
    outcome: payload.outcome,
    status: entry.status,
    entries: trimmedEntries,
  };
}

export function completeAgentLiveEntries(agentState, taskId, outcome = 'done') {
  const normalizedOutcome = normalizeTaskStatus(outcome);
  const status = normalizedOutcome === 'failed'
    ? 'failed'
    : normalizedOutcome === 'cancelled'
      ? 'cancelled'
      : normalizedOutcome === 'done'
        ? 'done'
        : 'pending';
  const entries = legacyLiveEntries(agentState).map((entry) => (
    entry.taskId === taskId
      ? { ...entry, status, outcome: normalizedOutcome }
      : entry
  ));
  return {
    ...(agentState || {}),
    completed: status !== 'pending',
    outcome: normalizedOutcome,
    status,
    ts: Date.now(),
    entries,
  };
}

export function completeLatestAgentLiveEntry(agentState, taskId, outcome = 'done') {
  const entries = legacyLiveEntries(agentState);
  const index = entries
    .map((entry, entryIndex) => ({ entry, entryIndex }))
    .filter(({ entry }) => entry.taskId === taskId && entry.status === 'pending')
    .sort((a, b) => (b.entry.ts || 0) - (a.entry.ts || 0))[0]?.entryIndex;
  if (index == null) return agentState;
  const normalizedOutcome = normalizeTaskStatus(outcome);
  const status = normalizedOutcome === 'failed'
    ? 'failed'
    : normalizedOutcome === 'cancelled'
      ? 'cancelled'
      : 'done';
  return {
    ...(agentState || {}),
    completed: true,
    outcome: normalizedOutcome,
    status,
    ts: Date.now(),
    entries: entries.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, status, outcome: normalizedOutcome } : entry
    )),
  };
}

export function upsertToolCall(toolCalls, callId, patch) {
  if (!callId) return toolCalls;
  const index = toolCalls.findIndex((item) => item.callId === callId);
  if (index < 0) {
    return [...toolCalls, { callId, ...patch }];
  }
  const next = toolCalls.slice();
  next[index] = { ...next[index], ...patch };
  return next;
}

export function runtimeTaskToQuest(task) {
  return {
    id: task.taskId,
    title: task.title,
    description: task.description,
    status: task.status,
    stepIdx: task.loopIndex || 0,
    totalSteps: task.loopIndex || 0,
    createdAt: task.createdAt,
    updatedAt: taskUpdatedTimestamp(task) || task.createdAt,
    completedAt: task.completedAt,
    stage: task.stage,
    assignedTo: task.assignedTo,
    assignedToLabel: task.assignedToLabel,
    taskId: task.taskId,
    provider: task.provider,
    requestedProvider: task.requestedProvider,
    executionMode: task.executionMode,
    workflowRun: task.workflowRun || null,
    answerText: task.answerText || '',
    chatStreamText: task.chatStreamText || '',
    error: task.error || null,
  };
}



// Break circular init: workspace-state maps tasks via registered mapper.
registerTaskSummaryMapper(taskSummaryToRuntimeTask);
