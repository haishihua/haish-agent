import React from 'react';
import { History, Pause, Pencil, Play, Trash2 } from 'lucide-react';
import { ScheduleCard } from './ScheduleCard.jsx';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import { AnimateDialog } from '../../../shared/ui/AnimateDialog.jsx';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../../shared/ui/settings-elements/ui/select.tsx';
import { ScheduleDateTimePicker } from './ScheduleDateTimePicker.jsx';
import { buildScheduleSpec, scheduleFields } from '../model/schedule.js';

function ScheduleForm({ job, initialMessage = '', busy, onSave, onCancel }) {
  const [message, setMessage] = React.useState(job?.message || initialMessage);
  const [fields, setFields] = React.useState(() => scheduleFields(job?.schedule));
  const [error, setError] = React.useState('');
  // Explicit body portal: never inherit a hidden settings-page portal or the animated dialog's transform.
  const container = document.body;
  const kindId = React.useId();
  const timeId = React.useId();
  const change = (key) => (event) => setFields((previous) => ({ ...previous, [key]: event.target.value }));
  return <form className="schedule-form" onSubmit={(event) => {
    event.preventDefault();
    try {
      if (!message.trim()) throw new Error('Describe what the task should do.');
      const unchanged = job && JSON.stringify(fields) === JSON.stringify(scheduleFields(job.schedule));
      setError('');
      onSave({ message: message.trim(), ...(unchanged ? {} : { schedule: buildScheduleSpec(fields) }) });
    } catch (failure) { setError(failure.message); }
  }}>
    <label>What to do<textarea autoFocus required maxLength={20000} value={message} onChange={(event) => setMessage(event.target.value)} disabled={busy} /></label>
    <div className="schedule-field"><label htmlFor={kindId}>When</label>
      <Select value={fields.kind} onValueChange={(kind) => setFields((previous) => ({ ...previous, kind }))} disabled={busy}>
        <SelectTrigger id={kindId} className="schedule-select-trigger"><SelectValue /></SelectTrigger>
        <SelectContent container={container} className="schedule-select-menu">
          <SelectItem value="once">Once</SelectItem><SelectItem value="interval">Every N minutes</SelectItem><SelectItem value="cron">Cron</SelectItem>
        </SelectContent>
      </Select>
    </div>
    {fields.kind === 'once' && <div className="schedule-field"><label htmlFor={timeId}>Date and time (local)</label>
      <ScheduleDateTimePicker id={timeId} value={fields.at} onChange={(at) => setFields((previous) => ({ ...previous, at }))} disabled={busy} container={container} />
    </div>}
    {fields.kind === 'interval' && <label>Minutes<input type="number" min="1" max="525600" step="1" required value={fields.minutes} onChange={change('minutes')} disabled={busy} /></label>}
    {fields.kind === 'cron' && <>
      <label>Five-field cron<input required value={fields.expr} onChange={change('expr')} disabled={busy} placeholder="0 9 * * *" /></label>
      <label>IANA timezone<input required value={fields.timezone} onChange={change('timezone')} disabled={busy} placeholder="Asia/Shanghai" /></label>
    </>}
    {error && <ErrorState variant="inline" detail={error} />}
    <div className="schedule-actions"><button type="button" onClick={onCancel} disabled={busy}>Cancel</button><button type="submit" className="schedule-save" disabled={busy}>{busy ? 'Saving…' : 'Save task'}</button></div>
  </form>;
}

function RunHistory({ id, api, revision }) {
  const [runs, setRuns] = React.useState([]);
  const [more, setMore] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const alive = React.useRef(true);
  React.useEffect(() => {
    alive.current = true;
    let cancelled = false;
    setBusy(true);
    api.runs(id).then((rows) => {
      if (!cancelled) { setRuns(rows); setMore(rows.length === 50); setError(''); }
    }).catch((failure) => { if (!cancelled) setError(failure.message); }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; alive.current = false; };
  }, [id, api, revision]);
  async function loadMore() {
    setBusy(true);
    try {
      const rows = await api.runs(id, runs.length);
      if (alive.current) { setRuns((previous) => [...previous, ...rows]); setMore(rows.length === 50); }
    } catch (failure) { if (alive.current) setError(failure.message); }
    finally { if (alive.current) setBusy(false); }
  }
  return <div className="schedule-history" aria-label="Run history">
    {error && <ErrorState variant="inline" detail={error} />}
    {!runs.length && <p>{busy ? 'Loading…' : 'No runs yet.'}</p>}
    {runs.map((run) => <div key={run.id}><time>{new Date(run.scheduled_at).toLocaleString()}</time> · {run.status}{run.reason && <p>{run.reason}</p>}</div>)}
    {more && <button type="button" disabled={busy} onClick={loadMore}>Load more</button>}
  </div>;
}

export function ScheduleDialog({ state, api, ensureConversation }) {
  const request = state.dialog;
  const [editing, setEditing] = React.useState(null);
  const [historyId, setHistoryId] = React.useState('');
  const [deleteId, setDeleteId] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  // Stable binding survives the draft's real-id handoff, even when POST fails.
  const boundId = React.useRef(null);
  const close = () => state.setDialog(null);
  const jobs = state.items.filter((job) => job.conversation_id === request.conversationId);
  async function action(work) {
    if (busy) return;
    setBusy(true); setError('');
    try { await work(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function save(payload) {
    await action(async () => {
      if (editing) {
        state.upsert(await api.update(editing.id, payload));
        setEditing(null);
      } else {
        if (!boundId.current) boundId.current = await ensureConversation(payload.message, request.conversationId);
        await state.configSync.flush(boundId.current, request.scopeId);
        const job = await api.create({ ...payload, conversation_id: boundId.current });
        state.upsert(job);
        close();
      }
    });
  }
  return <AnimateDialog open className={`schedule-dialog${request.mode === 'manage' && !editing ? ' schedule-manage-dialog' : ''}`} title={request.mode === 'create' ? 'Schedule task' : 'Scheduled tasks'} busy={busy} onClose={close}
    description="Runs in this conversation. Keep Haish open.">
    <div className="schedule-dialog-body">
      {(error || state.error) && <ErrorState variant="inline" detail={error || state.error} />}
      {request.mode === 'create' || editing ? <ScheduleForm key={editing?.id || 'new'} job={editing} initialMessage={request.message} busy={busy} onSave={save} onCancel={editing ? () => setEditing(null) : close} /> : <>
        {state.loading && <p role="status">Loading…</p>}
        {!state.loading && !jobs.length && <p>No scheduled tasks in this conversation.</p>}
        {jobs.map((job) => <ScheduleCard job={job} key={job.id}>
          <div className="schedule-actions schedule-card-actions">
            <button type="button" className="schedule-edit" disabled={busy} onClick={() => setEditing(job)}><Pencil size={18} aria-hidden="true" />Edit</button>
            <button type="button" disabled={busy || job.state === 'completed'} onClick={() => action(async () => state.upsert(await (job.state === 'paused' ? api.resume(job.id) : api.pause(job.id))))}>{job.state === 'paused' ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}{job.state === 'paused' ? 'Resume' : 'Pause'}</button>
            <button type="button" disabled={busy} aria-expanded={historyId === job.id} onClick={() => setHistoryId(historyId === job.id ? '' : job.id)}><History size={18} aria-hidden="true" />History</button>
            <button type="button" className="schedule-danger" disabled={busy} aria-expanded={deleteId === job.id} onClick={() => setDeleteId(job.id)}><Trash2 size={18} aria-hidden="true" />Delete</button>
          </div>
          {deleteId === job.id && <div className="schedule-delete" role="status">
            <p>Delete this task and its run history? An already running task will not be stopped.</p>
            <button type="button" disabled={busy} onClick={() => setDeleteId('')}>Cancel</button>
            <button type="button" className="schedule-danger" disabled={busy} onClick={() => action(async () => { await api.remove(job.id); state.remove(job.id); setDeleteId(''); })}>Confirm delete</button>
          </div>}
          {historyId === job.id && <RunHistory id={job.id} api={api} revision={`${job.last_run?.id}:${job.last_run?.status}`} />}
        </ScheduleCard>)}
        <div className="schedule-actions schedule-dialog-footer"><button type="button" disabled={busy} onClick={close}>Close</button></div>
      </>}
    </div>
  </AnimateDialog>;
}
