// 本地待确认任务投影成可渲染的 quest 卡片。

export function pendingTaskToQuest(pendingTask) {
  const taskId = pendingTask.taskId || pendingTask.id;
  return {
    ...pendingTask,
    // Keep the local identity until the server confirms it. A display-only
    // "pending" id breaks sidebar deduplication and gets queried as a real task.
    id: taskId,
    taskId,
    title: pendingTask.title,
    description: pendingTask.description,
    status: pendingTask.status,
    stepIdx: 0,
    totalSteps: 0,
    createdAt: pendingTask.createdAt,
    updatedAt: pendingTask.updatedAt || pendingTask.createdAt,
    completedAt: pendingTask.completedAt || null,
    stage: pendingTask.stage,
    requestedProvider: pendingTask.requestedProvider,
    answerText: pendingTask.answerText || '',
    chatStreamText: pendingTask.chatStreamText || '',
    error: pendingTask.error || null,
    serverFinished: !!pendingTask.serverFinished,
  };
}
