// Offline transport around the real attempt and runtime-projection handlers.
import { createTaskStreamHandlers } from '../../src/features/tasks/hooks/createTaskStreamHandlers.js';
import { createConversationActivationHandlers } from '../../src/features/conversations/hooks/createConversationActivationHandlers.js';
import { buildTaskRuntimeRecord } from '../../src/features/tasks/model/task-runtime.js';

export function createAttemptHarness(source, { reject = false } = {}) {
  const runtime = {
    busy: false, activeRunId: null, activeTaskId: null, fetchController: null,
    cancelledRunIds: new Set(),
    taskRuntimeState: { tasksById: { [source.taskId]: source }, taskOrder: [source.taskId], pendingTask: null, activeTaskId: null },
  };
  const requests = [];
  const snapshots = [];
  const context = {
    API_BASE: '',
    getRuntime: () => runtime,
    mutateRuntime: (_id, update) => update(runtime),
    activeRuntimeTargetConvId: () => source.conversationId,
    updateTaskRuntimeState: (update) => { runtime.taskRuntimeState = update(runtime.taskRuntimeState); },
    setRuntimeActiveTaskId: (id) => { runtime.activeTaskId = id; },
    setRuntimeBusy: (busy) => { runtime.busy = busy; },
    setRuntimeFetchController: (controller) => { runtime.fetchController = controller; },
    chatFinalizedTaskIdsRef: { current: new Set() },
    userCancelledTaskIdsRef: { current: new Set() },
    streamTargetConvIdRef: { current: null },
    buildTaskRuntimeRecord,
    timestampValue: (value) => Date.parse(value) || 0,
    isTerminalTaskStatus: (status) => ['done', 'failed', 'cancelled'].includes(status),
    generateHexId: () => 'pending-attempt',
    buildApiHeaders: () => ({}),
    normalizeRuntimeEvent: (event) => event,
    normalizeTaskStatus: (status) => status,
    normalizeChatImageRefs: (images) => images,
    stripChatImageAugmentation: (text) => ({ text: text || '' }),
    toDisplayText: (value) => String(value || ''),
    getChatProgressLine: () => '',
    removeConversationTaskFromWorkspace: () => {},
    batchRuntimeMutations: (_id, update) => update(),
    CHAT_FINAL_FOLLOWUP_EVENT_TYPES: new Set(['run_finished']),
    STREAM_IMMEDIATE_EVENT_TYPES: new Set(['run_started', 'run_finished']),
    apiFetch: async (url, options) => {
      const request = JSON.parse(options.body);
      requests.push({ url, body: request });
      snapshots.push({ ...runtime.taskRuntimeState.pendingTask });
      if (reject) return Response.json({ detail: 'Conversation already has an active task.' }, { status: 409 });
      const text = request.message ?? source.requestText ?? source.title;
      const event = { task_id: 'confirmed-attempt', conversation_id: source.conversationId,
        source_task_id: source.taskId, user_message_id: 'edited-user', annotations: source.annotations || [], display_text: null };
      return new Response([
        { ...event, type: 'run_started', message: text },
        { ...event, type: 'run_finished', status: 'done', task: { ...event, title: text, status: 'done', answer_text: 'Updated reply' } },
      ].map((item) => JSON.stringify(item)).join('\n'));
    },
  };
  const activation = createConversationActivationHandlers(context);
  const handlers = createTaskStreamHandlers({ ...context, ...activation });
  return { ...handlers, runtime, requests, snapshots };
}
