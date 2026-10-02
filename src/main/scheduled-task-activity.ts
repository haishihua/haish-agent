// Track executions, not schedule definitions or renderer ownership.
export function createScheduledTaskActivity() {
  const active = new Set<string>();
  let pendingChanges: Map<string, boolean> | null = null;
  const update = (id: string, running: boolean) => {
    if (running) active.add(id);
    else active.delete(id);
    pendingChanges?.set(id, running);
  };
  return {
    get size() { return active.size; },
    handle(message: Record<string, unknown>) {
      const event = message.event as Record<string, unknown> | undefined;
      if (message.schedule_id && typeof message.run_id === 'string' && message.run_id) {
        if (message.type === 'task.end' || message.type === 'task.error') update(message.run_id, false);
        else if (message.type === 'task.event') update(message.run_id, event?.type !== 'run_finished');
      } else if (message.type === 'schedule.event' && event?.action === 'run_updated') {
        const run = event.run as Record<string, unknown> | undefined;
        if (typeof run?.id === 'string' && run.id && typeof run.status === 'string') {
          update(run.id, run.status === 'running');
        }
      }
    },
    beginSnapshot() {
      const changes = new Map<string, boolean>();
      pendingChanges = changes;
      return {
        apply(runIds: unknown) {
          if (!Array.isArray(runIds) || runIds.some((id) => typeof id !== 'string' || !id)) {
            throw new Error('Runtime returned an invalid schedule activity snapshot.');
          }
          if (pendingChanges !== changes) return;
          active.clear();
          for (const id of runIds) active.add(id);
          for (const [id, running] of changes) {
            if (running) active.add(id);
            else active.delete(id);
          }
          pendingChanges = null;
        },
        cancel() { if (pendingChanges === changes) pendingChanges = null; },
      };
    },
    clear() { active.clear(); pendingChanges = null; },
  };
}
