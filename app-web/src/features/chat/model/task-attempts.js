// Full retries replace their source turn; workflow node runs remain independent.
//
// `pendingTurn` carries the same lineage before the server's task id lands: an edit /
// rerun that has just been accepted is already on screen as the running turn, so the
// turn it replaces must yield at that same moment. Otherwise the old turn (its
// cancelled rows and the open editor) keeps rendering above while the new running
// turn is appended below — the edit box left floating in the wrong place.
//
// Only pass a pending turn that is actually rendering (AppShell decides that).
export function collapseFullTaskAttempts(tasks, pendingTurn = null) {
  const attempts = pendingTurn && !pendingTurn.rerunFromNodeId ? [pendingTurn, ...tasks] : tasks;
  const replaced = new Set(attempts
    .filter((task) => !task.rerunFromNodeId)
    .map((task) => task.sourceTaskId)
    .filter(Boolean));
  return tasks.filter((task) => !replaced.has(task.taskId || task.id));
}
