import React from 'react';
import { API_BASE } from '../../../shared/api/base.js';
import { apiFetch } from '../../../shared/api/client.js';
import { startPolling } from '../../../shared/lib/polling.js';
import { taskSummaryToRuntimeTask } from '../../tasks/model/task-runtime.js';
import { buildWorkspaceStateFromProjects } from '../model/workspace-state.js';

export function useActivityProjects(enabled, ownerId, mode) {
  const [state, setState] = React.useState({ projects: [], loading: false, error: false, ownerId: '', mode: '' });
  React.useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let inFlight = false;
    setState({ projects: [], loading: true, error: false, ownerId, mode });
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await apiFetch(
          `${API_BASE}/api/projects?execution_mode=${mode}&summary_only=true`,
          { method: 'GET', signal: controller.signal }, { json: false },
        );
        if (!response.ok) throw new Error('Activity refresh failed');
        const payload = await response.json();
        // Owner scoping is the only contract worth failing on: activityEntries already
        // filters by execution mode, so a stray project there is simply not listed.
        if (!payload.owner_id || (ownerId && payload.owner_id !== ownerId)) throw new Error('Activity owner mismatch');
        const projects = buildWorkspaceStateFromProjects(
          payload.projects, undefined, taskSummaryToRuntimeTask,
        ).projects;
        if (!controller.signal.aborted) setState({ projects, loading: false, error: false, ownerId, mode });
      } catch (error) {
        if (!controller.signal.aborted) {
          // Keep the last good snapshot on screen, log the real cause, and rethrow so
          // startPolling backs off instead of hammering a failing endpoint.
          console.warn('activity refresh failed', error);
          setState((previous) => ({ ...previous, loading: false, error: true }));
          throw error;
        }
      } finally {
        inFlight = false;
      }
    };
    const stop = startPolling(refresh, { interval: 3000, immediate: true });
    return () => { controller.abort(); stop(); };
  }, [enabled, ownerId, mode]);
  return enabled && state.ownerId === ownerId && state.mode === mode
    ? state : { projects: [], loading: enabled, error: false };
}
