// @haish-esm
import React from 'react';
import { PortalTooltip } from './PortalTooltip.jsx';;
import { fmtAgo,
  fmtAgoCompact,
} from './Format.jsx';

export const STAGES = [
  { id: 'assigned',    label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'check',       label: 'Review' },
  { id: 'done',        label: 'Done' },
];
export const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));
export function getStageTrackState(stage, status) {
  const normalizedStatus = normalizeTaskStatus(status);
  if ((normalizedStatus === 'failed' || normalizedStatus === 'cancelled') && stage === 'done') {
    return 'in_progress';
  }
  return stage || 'assigned';
}

export function StageTrack({ stage, status }) {
  const normalizedStatus = normalizeTaskStatus(status);
  const trackStage = getStageTrackState(stage, normalizedStatus);
  const idx = STAGE_INDEX[trackStage] ?? 0;
  const isFailed = normalizedStatus === 'failed';
  const isCancelled = normalizedStatus === 'cancelled';
  const finished = normalizedStatus === 'done' && trackStage === 'done';
  const filledRatio = finished ? 1 : (idx > 0 ? idx / 3 : 0);
  const trackClassName = [
    'stage-track',
    finished ? 'finished' : '',
    isFailed ? 'failed' : '',
    isCancelled ? 'cancelled' : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={trackClassName}>
      <div className="seg-bar" style={{ width: `${(filledRatio * 75).toFixed(2)}%` }} />
      {STAGES.map((s, i) => {
        let cls = '';
        if (finished) cls = 'complete';
        else if (i < idx) cls = 'complete';
        else if (i === idx) cls = isFailed ? 'failed' : isCancelled ? 'cancelled' : 'active';
        return (
          <div key={s.id} className={`seg ${cls}`}>
            <div className="node" />
            <div className="label">{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

export const STAGE_PILL_TEXT = {
  assigned: 'PENDING',
  in_progress: 'IN PROGRESS',
  check: 'REVIEW',
  done: 'COMPLETED',
};

export function normalizeTaskStatus(status) {
  if (status === 'aborted') return 'cancelled';
  if (status === 'completed') return 'done';
  return status || 'queued';
}

export function getTaskPillMeta(status, stage) {
  const normalizedStatus = normalizeTaskStatus(status);
  if (normalizedStatus === 'failed') return { className: 'failed', text: 'FAILED' };
  if (normalizedStatus === 'cancelled') return { className: 'cancelled', text: 'CANCELLED' };
  if (normalizedStatus === 'done') return { className: 'done', text: 'COMPLETED' };
  if (normalizedStatus === 'running') {
    return {
      className: stage === 'check' ? 'check' : 'in_progress',
      text: stage === 'check' ? 'REVIEW' : 'IN PROGRESS',
    };
  }
  return {
    className: stage === 'assigned' ? 'pending' : (stage || 'pending'),
    text: STAGE_PILL_TEXT[stage] || 'PENDING',
  };
}

export function getTaskTerminalMeta(status) {
  const normalizedStatus = normalizeTaskStatus(status);
  if (normalizedStatus === 'failed') return { label: 'Failed', className: 'failed' };
  if (normalizedStatus === 'cancelled') return { label: 'Cancelled', className: 'cancelled' };
  if (normalizedStatus === 'done') return { label: 'Completed', className: 'done' };
  return null;
}

export function formatTaskCardTitle(title, maxChars = 34) {
  const text = String(title || '').trim();
  if (!text) return '—';
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}...` : text;
}

export function TaskRecordCard({ quest, now }) {
  const stage = quest.stage || 'assigned';
  const status = normalizeTaskStatus(quest.status);
  const ago = fmtAgoCompact(quest.createdAt, now);
  const completedAgo = quest.completedAt ? fmtAgoCompact(quest.completedAt, now) : null;
  const terminalMeta = getTaskTerminalMeta(status);
  return (
    <div className="task-record-card">
      <div className="trc-head">
        <PortalTooltip text={quest.title || ''} position="above" multiline>
          <div className="trc-title">{formatTaskCardTitle(quest.title)}</div>
        </PortalTooltip>
      </div>
      <StageTrack stage={stage} status={status} />
      <div className="trc-foot">
        <span className="ago">{ago}</span>
        {terminalMeta && completedAgo && <span className={`completed-stamp ${terminalMeta.className}`}>{terminalMeta.label} {completedAgo}</span>}
      </div>
    </div>
  );
}

export const TASK_FILTERS = [
  { id: 'all',         label: 'All Tasks' },
  { id: 'assigned',    label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'check',       label: 'Review' },
  { id: 'done',        label: 'Completed' },
  { id: 'failed',      label: 'Failed' },
  { id: 'cancelled',   label: 'Cancelled' },
];

export function TaskFilterDropdown({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const current = TASK_FILTERS.find(o => o.id === value) || TASK_FILTERS[0];

  return (
    <div className="filter-pill-wrap" ref={wrapRef}>
      <PortalTooltip text={open ? '' : current.label} position="below">
        <button
          type="button"
          className={`filter-pill icon-only ${open ? 'open' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Filter: ${current.label}`}
        >
          <span className="ico ico-task-filter" aria-hidden="true" />
        </button>
      </PortalTooltip>
      {open && (
        <div className="filter-menu" role="listbox">
          {TASK_FILTERS.map(opt => (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={opt.id === value}
              className={`filter-option ${opt.id === value ? 'selected' : ''}`}
              onClick={() => { onChange(opt.id); setOpen(false); }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function usePanelWidth() {
  const ref = React.useRef(null);
  const [width, setWidth] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.offsetWidth || 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}

export function TaskRecordsPanel({ quests, now, extensionStyle }) {
  const [filter, setFilter] = React.useState('all');
  const [panelRef, panelWidth] = usePanelWidth();
  const filtered = React.useMemo(() => {
    if (filter === 'all') return quests;
    return quests.filter((q) => {
      const status = normalizeTaskStatus(q.status);
      if (filter === 'done' || filter === 'failed' || filter === 'cancelled') {
        return status === filter;
      }
      return (q.stage || 'assigned') === filter && !['done', 'failed', 'cancelled'].includes(status);
    });
  }, [quests, filter]);

  return (
    <div className="side-panel left" ref={panelRef} style={{ ...extensionStyle, '--panel-width': `${panelWidth}px` }}>
      <div className="side-panel-head">
        <div className="title">TASK RECORDS</div>
        <TaskFilterDropdown value={filter} onChange={setFilter} />
      </div>
      <div className="side-panel-body">
        {filtered.length === 0 && (
          <div style={{padding:'40px 12px', color:'var(--dim-2)', fontSize:15, textAlign:'center', fontFamily:'Zpix', lineHeight:1.6}}>
            {quests.length === 0 ? (
              <>No tasks yet.<br/>Use the Task Delegation box below to deploy your first task.</>
            ) : (
              <>No tasks match this filter.</>
            )}
          </div>
        )}
        {filtered.slice().reverse().map(q => (
          <TaskRecordCard key={q.id} quest={q} now={now} />
        ))}
      </div>
    </div>
  );
}
