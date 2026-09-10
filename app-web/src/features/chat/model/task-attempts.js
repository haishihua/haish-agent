// Full retries replace their source turn; workflow node runs remain independent.
export function collapseFullTaskAttempts(tasks) {
  const replaced = new Set(tasks.filter((task) => !task.rerunFromNodeId).map((task) => task.sourceTaskId).filter(Boolean));
  return tasks.filter((task) => !replaced.has(task.taskId || task.id));
}
