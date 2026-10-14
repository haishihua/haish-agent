// Detail hydration and task selection must preserve the same locally owned turn.
export function conversationRuntimeHasLiveTurn(runtime) {
  return Boolean(runtime && (
    // busy is also projected from REST summaries. Only local control/stream
    // ownership may block hydration (including Stop and startup settlement).
    runtime.stopPromise || runtime.activeRunId || runtime.fetchController || runtime.pendingRun
  ));
}

export function createTaskRuntimeRestoreGuard(getRuntime, conversationId) {
  const expectedRuntime = getRuntime?.(conversationId) || null;
  const generation = expectedRuntime?.runGeneration || 0;
  const structureRevision = expectedRuntime?.taskStructureRevision || 0;
  return (taskId) => {
    const runtime = getRuntime?.(conversationId) || null;
    // A newer run may have both started and finished while REST was in flight.
    if (runtime !== expectedRuntime || (runtime?.runGeneration || 0) !== generation
      || (runtime?.taskStructureRevision || 0) !== structureRevision) return false;
    if (!conversationRuntimeHasLiveTurn(runtime)) return true;
    return taskId !== runtime.activeTaskId
      && taskId !== runtime.taskRuntimeState?.activeTaskId;
  };
}
