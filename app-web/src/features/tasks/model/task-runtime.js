import {
  normalizeChatImageRefs,
  mergeChatImageRefs,
  generateHexId,
  taskUpdatedTimestamp,
  taskCreatedTimestamp,
} from '../../conversations/model/workspace-state.js';
import { stripChatImageAugmentation, stripInjectedSkillInstruction } from '../../chat/model/chat-text.js';
import { compactStreamEvents } from '../../chat/model/stream-events.js';
import { usableWorkflowSnapshot } from '../../workflow/model/workflow-snapshot.js';
import {
  normalizeRuntimeEvents,
  runtimeEventToLog,
  getLoopIndexFromEvents,
  defaultQuestDescription,
} from './runtime-events.js';

export function createEmptyTaskRuntimeState() {
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
 * count — e.g. run_started, provider_selected, llm_thinking_started/completed.
 * Otherwise Stop-before-visualization keeps an
 * empty You/Assistant shell instead of rolling the turn back.
 *
 * Keep this aligned with buildChatTimeline's rendered event kinds.
 */
const ASSISTANT_VISIBLE_STREAM_EVENT_TYPES = new Set([
  'llm_thinking_delta',
  'llm_answer_delta',
  'llm_retry',
  'final_answer',
  'tool_call_started',
  'agent_progress_delta',
  'context_compaction_started',
  'context_compaction_completed',
  'context_compaction_failed',
  'tool_call_completed',
  'todo_updated',
  'sub_agent_started',
  'sub_agent_finished',
  'sub_agent_progress_delta',
  'sub_agent_answer_delta',
  'sub_agent_tool_call_started',
  'sub_agent_tool_call_completed',
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

/** Milliseconds of the first assistant-visible stream event, or null when no
 * model content has arrived yet (queueing / SSE handshake / first-char wait).
 * The elapsed pill only appears once this timestamp exists, and its clock
 * starts from it instead of from the send time. */
export function taskFirstStreamTimestamp(task) {
  if (!task) return null;
  if (Array.isArray(task.eventLog)) {
    for (const entry of task.eventLog) {
      if (!eventLogEntryHasVisiblePayload(entry)) continue;
      const raw = entry.timestamp || entry.created_at || entry.createdAt || '';
      if (!raw) continue;
      const ms = typeof raw === 'number' ? raw : Date.parse(String(raw));
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
  }
  return null;
}

export function applyTerminalTaskState(task, status, options = {}) {
  if (!task) return task;
  const normalized = normalizeTaskStatus(status);
  const now = Date.now();
  let workflowRun = task.workflowRun;
  if (normalized === 'cancelled' && workflowRun) {
    const currentNodeId = String(workflowRun.current_node_id || '');
    const nodes = { ...(workflowRun.nodes || {}) };
    const currentNode = nodes[currentNodeId];
    const currentNodeStatus = normalizeTaskStatus(currentNode?.status || '');
    const currentNodeFinished = Boolean(
      currentNode
      && (
        typeof currentNode.success === 'boolean'
        || currentNode.finished_at
        || currentNode.finishedAt
        || currentNode.decision
        || currentNode.structured?.decision
        || ['done', 'failed', 'cancelled', 'approved', 'rejected'].includes(currentNodeStatus)
      )
    );
    if (currentNodeId && !currentNodeFinished) {
      nodes[currentNodeId] = {
        ...(currentNode || {}),
        status: 'cancelled',
        success: false,
        finished_at: new Date(now).toISOString(),
      };
    }
    workflowRun = {
      ...workflowRun,
      status: 'cancelled',
      current_node_id: null,
      nodes,
    };
  }
  return {
    ...task,
    workflowRun,
    status: normalized,
    stage: 'done',
    updatedAt: now,
    completedAt: task.completedAt || now,
    error: options.error ?? task.error ?? null,
    aborted: options.aborted ?? task.aborted ?? normalized === 'cancelled',
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
    requestedProvider: '',
    attachment: attachment ? { ...attachment } : null,
    imageAttachments: Array.isArray(imageAttachments)
      ? imageAttachments.map((ref) => ({ ...ref }))
      : [],
    originViewMode: 'workflow',
  };
}

export function buildTaskRuntimeRecord(event, pendingTask) {
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
    attachment: pendingTask?.attachment || null,
    attachments: pendingTask?.attachment ? [{ ...pendingTask.attachment }] : [],
    loopIndex: Math.max(0, event.loop_index || 0),
    provider: null,
    providerKey: pendingTask?.requestedProvider || '',
    requestedProvider: pendingTask?.requestedProvider || '',
    requestedAgentId: pendingTask?.requestedAgentId || '',
    requestedWorkflowId: pendingTask?.requestedWorkflowId || '',
    executionMode: pendingTask?.executionMode === 'bot' ? 'bot' : 'chat',
    originViewMode: pendingTask?.originViewMode || 'workflow',
    workflowSnapshot: pendingTask?.workflowSnapshot || null,
    workflowRun: pendingTask?.workflowRun || null,
    sourceTaskId: pendingTask?.sourceTaskId || event.source_task_id || null,
    sourceRunId: pendingTask?.sourceRunId || event.source_run_id || null,
    rerunFromNodeId: pendingTask?.rerunFromNodeId || event.start_node_id || null,
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
    error: null,
    serverFinished: false,
  };
}

export function taskSummaryToRuntimeTask(task, fallbackImageAttachments = []) {
  const taskAttachments = Array.isArray(task.attachments)
    ? task.attachments.map((attachment) => ({ ...attachment, uploaded: true }))
    : [];
  const titleParts = stripChatImageAugmentation(stripInjectedSkillInstruction(task.title));
  const descriptionParts = stripChatImageAugmentation(task.description);
  const imageAttachments = normalizeChatImageRefs(
    mergeChatImageRefs(task.image_attachments || task.imageAttachments || [], fallbackImageAttachments, titleParts.imageRefs, descriptionParts.imageRefs),
    task.conversation_id,
  );
  const title = titleParts.text || 'Task';
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
    attachment: taskAttachments[0] || null,
    attachments: taskAttachments,
    imageAttachments,
    loopIndex: 0,
    provider: task.provider,
    providerKey: task.provider_key || 'auto',
    requestedProvider: task.provider_key || 'auto',
    requestedAgentId: task.agent_id || task.profile_id || '',
    requestedWorkflowId: task.workflow_id || '',
    executionMode: task.execution_mode === 'bot' ? 'bot' : 'chat',
    originViewMode: task.execution_mode === 'bot' ? 'workflow' : 'chat',
    workflowSnapshot: usableWorkflowSnapshot(task.workflow_snapshot),
    workflowRun: task.workflow_run || null,
    sourceTaskId: task.source_task_id || null,
    sourceRunId: task.source_run_id || null,
    rerunFromNodeId: task.rerun_from_node_id || null,
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
    error: task.error || null,
    serverFinished: task.status === 'done' || task.status === 'failed' || task.status === 'cancelled',
  };
}

export function taskDetailToRuntimeTask(task, previousTask = null) {
  const events = normalizeRuntimeEvents(task.events);
  const summaryTask = taskSummaryToRuntimeTask(task, previousTask?.imageAttachments || []);
  const nextTask = {
    ...(previousTask || summaryTask),
    ...summaryTask,
    loopIndex: getLoopIndexFromEvents(events),
    eventLog: compactStreamEvents(events.map(runtimeEventToLog)),
    workflowSnapshot: usableWorkflowSnapshot(task.workflow_snapshot, previousTask?.workflowSnapshot || null),
  };
  return nextTask;
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
