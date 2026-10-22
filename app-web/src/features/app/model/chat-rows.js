import { collapseFullTaskAttempts } from '../../chat/model/task-attempts.js';
import { assistantNameForTask } from '../../chat/model/assistant-name.js';
import { stripInjectedSkillInstruction } from '../../chat/model/chat-text.js';
import { buildChatTimeline } from '../../chat/model/chat-timeline.js';
import { isTaskLive } from '../../conversations/model/conversation-status.js';
import {
  normalizeTaskStatus,
  taskHasAssistantStreamContent,
  taskFirstStreamTimestamp,
} from '../../tasks/model/task-runtime.js';

/**
 * 聊天时间线的行投影：把一轮轮任务投影成 user / agent 两种消息行。
 * 纯函数（不碰 React）：缓存由调用方以 WeakMap 传入——键是任务对象本身，值里带着
 * 决定这条投影是否还成立的那几个输入（live / agent 名字 / conversationId）。
 */
export function buildChatRows({
  agentOptions,
  chatMessageRowsCache,
  conversationId,
  currentConversation,
  settledRuntimeTaskIds,
  taskRuntimeState,
}) {
  const rows = [];
  // 助手气泡上的名字跟着会话选定的 agent 走（见 chat/model/assistant-name.js）。
  const agentNameFor = (task) => assistantNameForTask(task, currentConversation, agentOptions);
  // 本地还没被服务端接下的那一轮（pending，见 conversations/model/agent-binding.js）
  // 在时间线上照旧渲染；被它顶掉的那一轮必须在同一刻让位。编辑 / 重发刚被接下时旧行
  // 还留在上面（编辑框正悬在那一行上），新的运行态却在下面另起一轮——看起来就是输入框
  // 错位。空壳（本地取消、服务端一个字都没收到）不渲染，也不顶掉任何一轮。
  const pendingTurn = taskRuntimeState.pendingTask;
  const pendingStatus = pendingTurn ? normalizeTaskStatus(pendingTurn.status) : '';
  const pendingError = String(pendingTurn?.error || '').trim();
  const pendingTurnVisible = Boolean(pendingTurn
    && (!pendingTurn.awaitingRetryConfirmation || pendingTurn.stopPending)
    && !taskRuntimeState.activeTaskId
    && !(pendingStatus === 'cancelled' && !pendingTurn.stopPending && !pendingError && !taskHasAssistantStreamContent(pendingTurn)));
  const orderedTasks = collapseFullTaskAttempts(
    taskRuntimeState.taskOrder.map((taskId) => taskRuntimeState.tasksById[taskId]).filter(Boolean),
    pendingTurnVisible ? pendingTurn : null,
  );
  const settled = settledRuntimeTaskIds;
  const rowCache = chatMessageRowsCache;
  for (const task of orderedTasks) {
    const taskId = task.taskId || task.id || task.title;
    const live = isTaskLive(task) && !settled.has(String(task.taskId || task.id || ''));
    const agentName = agentNameFor(task);
    const cachedRows = rowCache.get(task);
    // catalog 是异步到的：名字也会变，所以名字一起比，不能只比 live。conversationId 同理：
    // 它决定最终回答里的图片能不能拼出预览地址，缓存的行带着空 id 就永远不出图。
    if (cachedRows && cachedRows.live === live && cachedRows.agentName === agentName && cachedRows.conversationId === conversationId) {
      rows.push(...cachedRows.rows);
      continue;
    }
    const taskRows = [];
    const status = normalizeTaskStatus(task.status);
    const answer = String(task.answerText || '').trim();
    const progress = String(task.chatStreamText || '').trim();
    const error = String(task.error || '').trim();
    // Keep cancelled turns, including those stopped before the first token,
    // so the original user message remains available for edit-and-resend.
    if (task.title || task.annotations?.length) {
      taskRows.push({
        id: `${taskId}-user`,
        taskId,
        conversationId,
        messageId: task.userMessageId,
        role: 'user',
        text: stripInjectedSkillInstruction(task.displayText ?? task.title),
        annotations: task.annotations || [],
        status,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        images: Array.isArray(task.imageAttachments) ? task.imageAttachments : [],
      });
    }
    if (!(task.inherited && status === 'cancelled') && (answer || progress || error || status === 'running' || status === 'queued' || status === 'failed' || status === 'cancelled')) {
      const progressLines = progress
        ? progress.split('\n').map((line) => line.trim()).filter(Boolean)
        : [];
      const hasTraceSource = status === 'running'
        || status === 'queued'
        || progressLines.length > 0
        || (Array.isArray(task.eventLog) && task.eventLog.length > 0)
        || (Array.isArray(task.toolCalls) && task.toolCalls.length > 0);
      const timeline = hasTraceSource ? buildChatTimeline(task, status) : null;
      const streaming = live;
      const timelineItems = Array.isArray(timeline?.items) ? timeline.items : [];
      // Older turns keep only their summary until the user scrolls up to them.
      // Such a turn has no trace to read its content from, so a cancelled run
      // falls back to the persisted answer instead of rendering blank.
      const traceHydrated = task.runtimeHydrated !== false;
      // Keep streamed answer segments in the trace so text and tool calls
      // stay in their original chronological order. The final answer moves
      // into the Markdown bubble only after the run completes.
      // Cancelled runs should not render a separate final-answer body or a
      // synthetic "Task was cancelled." message. Keep the chronological trace
      // intact, though: it is the running process (LLM stream + tool calls)
      // the user saw before pressing Stop.
      const bubbleText = streaming
        ? ''
        : (status === 'cancelled' && traceHydrated ? '' : (error || answer));
      // Mid-run steering inputs ("user_input" timeline items) stay inside the
      // assistant trace — they do NOT become standalone user bubbles. The
      // correction embeds inline in the interrupted assistant box and the
      // assistant's follow-up reply to it continues below, so the whole
      // exchange reads as one continuous dialogue bubble instead of three
      // blocks. All items keep their original chronological order.
      taskRows.push({
        id: `${taskId}-agent`,
        messageId: task.assistantMessageId,
        taskId,
        conversationId,
        role: 'agent',
        agentName,
        text: bubbleText,
        answerImages: Array.isArray(task.answerImages) ? task.answerImages : [],
        progressLines,
        traceTimeline: timelineItems,
        traceHydrated,
        traceLatestTodos: timeline?.latestTodos || null,
        status,
        streaming,
        createdAt: task.createdAt,
        completedAt: task.completedAt,
        firstTokenAt: taskFirstStreamTimestamp(task),
      });
    }
    rowCache.set(task, { rows: taskRows, live, agentName, conversationId });
    rows.push(...taskRows);
  }
  if (pendingTurnVisible) {
    // 服务端还没接下这一笔（见 conversations/model/agent-binding.js）：标记出来，
    // agent 锁不把它当「发过消息」。它照旧留在时间线上等重发。
    rows.push({
      id: `${pendingTurn.id || 'pending'}-user`,
      role: 'user',
      unaccepted: true,
      text: stripInjectedSkillInstruction(pendingTurn.displayText ?? pendingTurn.title),
      annotations: pendingTurn.annotations || [],
      status: pendingStatus,
      createdAt: pendingTurn.createdAt,
      completedAt: pendingTurn.completedAt,
      images: Array.isArray(pendingTurn.imageAttachments) ? pendingTurn.imageAttachments : [],
    });
    if (pendingError || pendingStatus === 'failed' || pendingStatus === 'cancelled' || pendingStatus === 'running' || pendingStatus === 'queued') {
      const pendingStreaming = isTaskLive(pendingTurn)
        && !settled.has(String(pendingTurn.taskId || pendingTurn.id || ''));
      rows.push({
        id: `${pendingTurn.id || 'pending'}-agent`,
        taskId: pendingTurn.id || '',
        conversationId,
        role: 'agent',
        agentName: agentNameFor(pendingTurn),
        text: pendingStreaming ? '' : (pendingStatus === 'cancelled' ? '' : pendingError),
        progressLines: [],
        traceTimeline: [],
        status: pendingStatus,
        streaming: pendingStreaming,
        createdAt: pendingTurn.createdAt,
        completedAt: pendingTurn.completedAt,
        firstTokenAt: taskFirstStreamTimestamp(pendingTurn),
      });
    }
  }
  return rows;
}
