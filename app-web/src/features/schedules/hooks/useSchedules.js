import React from 'react';
import { schedulesApi } from '../api/schedules.js';
import { applyScheduleEvent } from '../model/schedule.js';

export const SchedulesContext = React.createContext(null);
export const useSchedules = () => React.useContext(SchedulesContext);

const subscribeSchedules = (callback) => window.haish.onScheduleEvent(callback);

export function useSchedulesState({ api = schedulesApi, onRuntimeEvent, onRecover, subscribe = subscribeSchedules }) {
  const [items, setItems] = React.useState([]);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [dialog, setDialog] = React.useState(null);
  const callbacks = React.useRef({ onRuntimeEvent, onRecover });
  callbacks.current = { onRuntimeEvent, onRecover };
  const itemsRef = React.useRef([]);
  React.useEffect(() => {
    let alive = true;
    let revision = 0;
    let requestNumber = 0;
    const recover = (job) => callbacks.current.onRecover?.(job);
    async function refresh() {
      const number = ++requestNumber;
      const before = revision;
      try {
        const snapshot = await api.list();
        if (!alive || number !== requestNumber) return;
        if (revision !== before) { refresh(); return; }
        itemsRef.current = snapshot;
        setItems(snapshot);
        setError('');
        setLoading(false);
        await Promise.all(snapshot.filter((job) => job.last_run?.task_id).map(recover));
      } catch (failure) {
        if (alive) { setError(String(failure.message || failure)); setLoading(false); }
      }
    }
    const stop = subscribe((message) => {
      if (!alive) return;
      revision += 1;
      if (message.type === 'schedule.resync') { refresh(); return; }
      if (message.type === 'schedule.event') {
        itemsRef.current = applyScheduleEvent(itemsRef.current, message);
        setItems(itemsRef.current);
        // Run metadata may precede the task stream; recover only its terminal receipt.
        const run = message.event.run;
        if (run?.task_id && !['running', 'queued'].includes(run.status)) {
          recover({ conversation_id: message.event.conversation_id, last_run: run })?.catch((failure) => setError(failure.message));
        }
      } else if (message.type === 'task.event') {
        try {
          callbacks.current.onRuntimeEvent?.(message);
        }
        catch (failure) { setError(failure.message); }
      } else if (message.type === 'task.end') {
        refresh();
      }
    });
    const focus = () => refresh();
    window.addEventListener('focus', focus);
    refresh();
    return () => { alive = false; stop(); window.removeEventListener('focus', focus); };
  }, [api, subscribe]);
  const upsert = (job) => {
    itemsRef.current = applyScheduleEvent(itemsRef.current, { type: 'schedule.event', event: { schedule: job } });
    setItems(itemsRef.current);
  };
  return { items, loading, error, dialog, setDialog, upsert,
    remove: (id) => { itemsRef.current = itemsRef.current.filter((item) => item.id !== id); setItems(itemsRef.current); },
    openCreate: (request) => setDialog({ mode: 'create', ...request }),
    openManage: (conversationId) => setDialog({ mode: 'manage', conversationId }),
  };
}
