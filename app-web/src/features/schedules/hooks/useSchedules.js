import React from 'react';
import { schedulesApi } from '../api/schedules.js';
import { applyScheduleEvent } from '../../../core/schedule.js';
import { isLiveTaskStatus } from '../../../core/run-status.js';

export const SchedulesContext = React.createContext(null);
export const useSchedules = () => React.useContext(SchedulesContext);

// 与其它 window.haish 调用一致用可选链：preload 没注上时降级成「没有实时事件」，
// 而不是在渲染期抛 TypeError 把整个应用推到顶层错误页。
const subscribeSchedules = (callback) => window.haish?.onScheduleEvent?.(callback) ?? null;

export function useSchedulesState({ api = schedulesApi, onRuntimeEvent, onRecover, subscribe = subscribeSchedules }) {
  const [items, setItems] = React.useState([]);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [dialog, setDialog] = React.useState(null);
  const callbacks = React.useRef({ onRuntimeEvent, onRecover });
  callbacks.current = { onRuntimeEvent, onRecover };
  const revision = React.useRef(0);
  const itemsRef = React.useRef([]);
  React.useEffect(() => {
    let alive = true;
    let requestNumber = 0;
    const recover = (job) => callbacks.current.onRecover?.(job);
    async function refresh() {
      const number = ++requestNumber;
      const before = revision.current;
      try {
        const snapshot = await api.list();
        if (!alive || number !== requestNumber) return;
        if (revision.current !== before) { refresh(); return; }
        itemsRef.current = snapshot;
        setItems(snapshot);
        setError('');
        setLoading(false);
        await Promise.all(snapshot.filter((job) => job.last_run?.task_id).map(recover));
      } catch (failure) {
        if (alive && number === requestNumber) { setError(String(failure.message || failure)); setLoading(false); }
      }
    }
    const stop = subscribe((message) => {
      if (!alive) return;
      if (message.type === 'schedule.resync') { revision.current += 1; refresh(); return; }
      if (message.type === 'schedule.event') {
        // Content deltas still reach the runtime, but cannot invalidate a schedule snapshot.
        if (message.event.schedule || message.event.run || message.event.action === 'deleted') revision.current += 1;
        itemsRef.current = applyScheduleEvent(itemsRef.current, message);
        setItems(itemsRef.current);
        // Run metadata may precede the task stream; recover only its terminal receipt.
        const run = message.event.run;
        if (run?.task_id && !isLiveTaskStatus(run.status)) {
          recover({ conversation_id: message.event.conversation_id, last_run: run })?.catch((failure) => setError(failure.message));
        }
      } else if (message.type === 'task.event') {
        try {
          callbacks.current.onRuntimeEvent?.(message);
        }
        catch (failure) { setError(failure.message); }
      } else if (message.type === 'task.end') {
        revision.current += 1;
        refresh();
      }
    });
    const focus = () => refresh();
    window.addEventListener('focus', focus);
    refresh();
    return () => { alive = false; stop?.(); window.removeEventListener('focus', focus); };
  }, [api, subscribe]);
  // 返回值稳定化：SchedulesProvider 把这份对象放进 context value 的 useMemo 依赖，
  // 各字段引用不变时（items/loading/error/dialog 未变）不能因重渲染而换新对象，
  // 否则每个消费 useSchedules 的会话行都会跟着父组件一起重渲染。
  const upsert = React.useCallback((job) => {
    revision.current += 1;
    itemsRef.current = applyScheduleEvent(itemsRef.current, { type: 'schedule.event', event: { schedule: job } });
    setItems(itemsRef.current);
  }, []);
  const remove = React.useCallback((id) => {
    revision.current += 1;
    itemsRef.current = itemsRef.current.filter((item) => item.id !== id); setItems(itemsRef.current);
  }, []);
  const openCreate = React.useCallback((request) => setDialog({ mode: 'create', ...request }), []);
  const openManage = React.useCallback((conversationId) => setDialog({ mode: 'manage', conversationId }), []);
  return React.useMemo(() => ({ items, loading, error, dialog, setDialog, upsert, remove, openCreate, openManage }),
    [items, loading, error, dialog, upsert, remove, openCreate, openManage]);
}
