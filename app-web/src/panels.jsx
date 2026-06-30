// New layout: top bar, left task records, right live feed,
// bottom task delegation overlay, bottom navigation, map viewport with zoom.

function PortalTooltip({ text, position = 'below', multiline = false, children }) {
  const [visible, setVisible] = React.useState(false);
  const [coords, setCoords] = React.useState(null);
  const triggerRef = React.useRef(null);
  const bubbleRef = React.useRef(null);
  const suppressAfterClickRef = React.useRef(false);

  const computeCoords = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const triggerCenter = r.left + r.width / 2;
    // Clamp to viewport so the tooltip doesn't get cut off at the screen edges.
    const margin = 8;
    const bubbleW = bubbleRef.current?.offsetWidth || 0;
    const halfW = bubbleW / 2;
    const minX = margin + halfW;
    const maxX = window.innerWidth - margin - halfW;
    const x = bubbleW > 0
      ? Math.min(Math.max(triggerCenter, minX), maxX)
      : triggerCenter;
    setCoords({
      x,
      y: position === 'above' ? r.top - 8 : r.bottom + 8,
      arrow: triggerCenter - x, // px offset from bubble center to actual trigger
    });
  }, [position]);

  React.useEffect(() => {
    if (!visible) return undefined;
    computeCoords();
    // After the bubble mounts we may need to re-clamp once its width is known.
    const raf = requestAnimationFrame(computeCoords);
    const onScroll = () => computeCoords();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [visible, computeCoords]);

  const child = React.Children.only(children);
  const enhanced = React.cloneElement(child, {
    ref: triggerRef,
    onMouseEnter: (e) => {
      if (!suppressAfterClickRef.current) setVisible(true);
      child.props.onMouseEnter && child.props.onMouseEnter(e);
    },
    onMouseLeave: (e) => {
      suppressAfterClickRef.current = false;
      setVisible(false);
      child.props.onMouseLeave && child.props.onMouseLeave(e);
    },
    onFocus: (e) => {
      if (!suppressAfterClickRef.current) setVisible(true);
      child.props.onFocus && child.props.onFocus(e);
    },
    onBlur: (e) => {
      suppressAfterClickRef.current = false;
      setVisible(false);
      child.props.onBlur && child.props.onBlur(e);
    },
    onClick: (e) => {
      suppressAfterClickRef.current = true;
      setVisible(false);
      child.props.onClick && child.props.onClick(e);
    },
  });

  const portalNode = (visible && coords && text)
    ? ReactDOM.createPortal(
        <div
          ref={bubbleRef}
          className={`portal-tooltip portal-tooltip-${position}${multiline ? ' is-multiline' : ''}`}
          style={{ left: coords.x, top: coords.y, '--arrow-offset': `${coords.arrow}px` }}
          role="tooltip"
        >
          {text}
        </div>,
        document.body,
      )
    : null;

  return <>{enhanced}{portalNode}</>;
}
window.PortalTooltip = PortalTooltip;

function fmtAgo(ts, now) {
  if (!ts) return '';
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return s === 0 ? `${m}m ago` : `${m}m ${s}s ago`;
  }
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
}
window.fmtAgo = fmtAgo;

function fmtAgoCompact(ts, now) {
  if (!ts) return '';
  const diff = Math.max(0, Math.floor((now - ts) / 1000));
  if (diff < 60) return '0m ago';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return m === 0 ? `${h}h ago` : `${h}h ${m}m ago`;
}

function getAttachmentKind(attachment) {
  const name = String(attachment?.name || attachment?.title || '').trim();
  const type = String(attachment?.type || attachment?.mime || '').toLowerCase();
  const ext = name.match(/\.([^.\\/]+)$/)?.[1];
  if (ext) return ext.slice(0, 5).toUpperCase();
  if (type.includes('markdown')) return 'MD';
  if (type.includes('pdf')) return 'PDF';
  if (type.startsWith('image/')) return 'IMG';
  if (type.startsWith('text/')) return 'TXT';
  return 'FILE';
}

function AttachmentFileChip({ attachment, uploading = false, onClear }) {
  if (!attachment) return null;
  const name = attachment.name || attachment.title || 'Attached file';
  const kind = getAttachmentKind(attachment);
  const iconState = uploading ? 'is-loading' : attachment.uploaded ? 'is-ready' : 'is-pending';
  const glyphClass = uploading ? 'ico-loading' : attachment.uploaded ? 'ico-google-docs' : 'ico-attach';
  return (
    <PortalTooltip text={name} position="above">
      <div className={`composer-file-chip ${uploading ? 'is-uploading' : ''} ${attachment.uploaded ? 'is-ready' : ''}`}>
        <span className={`composer-file-icon ${iconState}`} aria-hidden="true">
          <span className={`ico composer-file-glyph ${glyphClass}`} />
        </span>
        <span className="composer-file-copy">
          <span className="composer-file-name">{name}</span>
          <span className="composer-file-kind">{kind}</span>
        </span>
        <button type="button" className="composer-file-remove" onClick={onClear} aria-label="Remove file" disabled={uploading}>×</button>
      </div>
    </PortalTooltip>
  );
}

function TopBar({ now, viewMode = 'world', onToggleViewMode, calibrationActive = false, calibrationDisabled = false, onToggleCalibration }) {
  const chatMode = viewMode === 'chat';
  return (
    <div className="app-topbar">
      <div className="topbar-brand">
        <div className="topbar-logo" />
        <div className="topbar-title">Haish Agent</div>
      </div>
      <div className="topbar-actions">
        <PortalTooltip text="Documents" position="below">
          <button type="button" className="topbar-icon" aria-label="Documents">
            <span className="ico ico-preview" aria-hidden="true" />
          </button>
        </PortalTooltip>
        <PortalTooltip text={chatMode ? 'Agent World Mode' : 'Chat Mode'} position="below">
          <button
            type="button"
            className={`topbar-icon topbar-mode-toggle ${chatMode ? 'active' : ''}`}
            aria-label={chatMode ? 'Switch to Agent World Mode' : 'Switch to Chat Mode'}
            aria-pressed={chatMode}
            onClick={onToggleViewMode}
          >
            <span className={`ico ${chatMode ? 'ico-robot' : 'ico-bubble-chat'}`} aria-hidden="true" />
          </button>
        </PortalTooltip>
        <PortalTooltip text={calibrationActive ? 'Exit calibration' : 'Settings'} position="below">
          <button
            type="button"
            className={`topbar-icon ${calibrationActive ? 'active' : ''}`}
            aria-label={calibrationActive ? 'Exit calibration' : 'Settings'}
            aria-pressed={calibrationActive}
            onClick={onToggleCalibration}
            disabled={calibrationDisabled}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        </PortalTooltip>
      </div>
    </div>
  );
}
window.TopBar = TopBar;

const STAGES = [
  { id: 'assigned',    label: 'Assigned' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'check',       label: 'Review' },
  { id: 'done',        label: 'Done' },
];
const STAGE_INDEX = Object.fromEntries(STAGES.map((s, i) => [s.id, i]));
window.STAGES = STAGES;
window.STAGE_INDEX = STAGE_INDEX;

function getStageTrackState(stage, status) {
  const normalizedStatus = normalizeTaskStatus(status);
  if ((normalizedStatus === 'failed' || normalizedStatus === 'cancelled') && stage === 'done') {
    return 'in_progress';
  }
  return stage || 'assigned';
}

function StageTrack({ stage, status }) {
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

const STAGE_PILL_TEXT = {
  assigned: 'PENDING',
  in_progress: 'IN PROGRESS',
  check: 'REVIEW',
  done: 'COMPLETED',
};

function normalizeTaskStatus(status) {
  if (status === 'aborted') return 'cancelled';
  if (status === 'completed') return 'done';
  return status || 'queued';
}

function getTaskPillMeta(status, stage) {
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

function getTaskTerminalMeta(status) {
  const normalizedStatus = normalizeTaskStatus(status);
  if (normalizedStatus === 'failed') return { label: 'Failed', className: 'failed' };
  if (normalizedStatus === 'cancelled') return { label: 'Cancelled', className: 'cancelled' };
  if (normalizedStatus === 'done') return { label: 'Completed', className: 'done' };
  return null;
}

function formatTaskCardTitle(title, maxChars = 34) {
  const text = String(title || '').trim();
  if (!text) return '—';
  return text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}...` : text;
}

function TaskRecordCard({ quest, now }) {
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

const TASK_FILTERS = [
  { id: 'all',         label: 'All Tasks' },
  { id: 'assigned',    label: 'Pending' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'check',       label: 'Review' },
  { id: 'done',        label: 'Completed' },
  { id: 'failed',      label: 'Failed' },
  { id: 'cancelled',   label: 'Cancelled' },
];

function TaskFilterDropdown({ value, onChange }) {
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
window.TaskFilterDropdown = TaskFilterDropdown;

function usePanelWidth() {
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

function TaskRecordsPanel({ quests, now, extensionStyle }) {
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
window.TaskRecordsPanel = TaskRecordsPanel;

function PanelIcon({ name }) {
  const common = { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'folder') return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>;
  if (name === 'chevron') return <svg {...common}><polyline points="9 18 15 12 9 6"/></svg>;
  if (name === 'plus') return <svg {...common}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
  if (name === 'edit') return <svg {...common}><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>;
  if (name === 'trash') return <svg {...common}><polyline points="3 6 5 6 21 6"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>;
  if (name === 'remove') return <svg {...common}><line x1="5" y1="12" x2="19" y2="12"/></svg>;
  return null;
}

function ConversationAction({ label, icon, onClick, disabled = false, tooltipPosition = 'above' }) {
  return (
    <PortalTooltip text={label} position={tooltipPosition}>
      <button
        type="button"
        className="conversation-icon-btn"
        aria-label={label}
        onClick={(event) => { event.stopPropagation(); onClick?.(); }}
        disabled={disabled}
      >
        <span className={`ico ico-${icon}`} aria-hidden="true" />
      </button>
    </PortalTooltip>
  );
}

function StopCancelIcon() {
  return (
    <svg className="stop-cancel-svg" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="8" fill="#ffa20a" />
      <rect x="6" y="6" width="6" height="6" rx="1.5" fill="#fffdf8" />
    </svg>
  );
}

function TaskStatusIcon({ statusClass }) {
  if (statusClass === 'done') {
    return <span className="conversation-task-status-icon done"><span className="ico ico-check-success" aria-hidden="true" /></span>;
  }
  if (statusClass === 'failed') {
    return <span className="conversation-task-status-icon failed"><span className="ico ico-close" aria-hidden="true" /></span>;
  }
  if (statusClass === 'cancelled') {
    return <span className="conversation-task-status-icon cancelled"><StopCancelIcon /></span>;
  }
  return <span className="conversation-task-status-icon pending"><span className="ico ico-loading" aria-hidden="true" /></span>;
}

function TaskRecordCompact({ task, now, onOpenReport }) {
  const stage = task.stage || 'assigned';
  const status = normalizeTaskStatus(task.status);
  const pill = getTaskPillMeta(status, stage);
  const hasReport = status === 'done' && !!String(task.answerText || '').trim();
  return (
    <div className={`conversation-task-card ${pill.className}`}>
      <div className="conversation-task-main">
        <TaskStatusIcon statusClass={pill.className} />
        <div className="conversation-task-copy">
          <PortalTooltip text={task.title || ''} position="above" multiline>
            <div className="conversation-task-title">{task.title || 'Untitled task'}</div>
          </PortalTooltip>
        </div>
        {hasReport && (
          <PortalTooltip text="View report" position="above">
            <button
              type="button"
              className="conversation-report-btn"
              aria-label="View report"
              onClick={(event) => { event.stopPropagation(); onOpenReport?.(task); }}
            >
              <span className="ico ico-report" aria-hidden="true" />
            </button>
          </PortalTooltip>
        )}
      </div>
    </div>
  );
}

function ConversationDialog({ dialog, onCancel }) {
  const [value, setValue] = React.useState('');
  React.useEffect(() => {
    setValue(dialog?.value || '');
  }, [dialog]);
  if (!dialog) return null;
  const isRename = dialog.kind === 'rename';
  const trimmed = value.trim();
  const confirmDisabled = isRename && !trimmed;

  function confirm() {
    if (confirmDisabled) return;
    dialog.onConfirm?.(isRename ? trimmed : undefined);
    onCancel?.();
  }

  return (
    <div className="conversation-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className={`conversation-dialog ${dialog.danger ? 'danger' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="conversation-dialog-title" id="conversation-dialog-title">{dialog.title}</div>
        {dialog.message ? <div className="conversation-dialog-message">{dialog.message}</div> : null}
        {isRename ? (
          <input
            className="conversation-dialog-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirm();
              if (event.key === 'Escape') onCancel?.();
            }}
            autoFocus
          />
        ) : null}
        <div className="conversation-dialog-actions">
          <button type="button" className="conversation-dialog-btn secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="conversation-dialog-btn primary" onClick={confirm} disabled={confirmDisabled}>
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function conversationHasRunningTask(conversation) {
  const tasks = Array.isArray(conversation?.tasks) ? conversation.tasks : [];
  return tasks.some((task) => {
    const status = String(task?.status || '').toLowerCase();
    if (status !== 'running' && status !== 'queued') return false;
    if (task?.completedAt || task?.completed_at) return false;
    const answer = task?.answerText ?? task?.answer_text;
    return !(typeof answer === 'string' && answer.trim());
  });
}

function conversationLatestTerminalStatus(conversation) {
  const tasks = Array.isArray(conversation?.tasks) ? conversation.tasks : [];
  for (let index = tasks.length - 1; index >= 0; index -= 1) {
    const status = String(tasks[index]?.status || '').toLowerCase();
    if (status === 'done' || status === 'completed' || status === 'success') return 'done';
    if (status === 'failed' || status === 'error') return 'failed';
    if (status === 'cancelled' || status === 'canceled' || status === 'aborted') return 'cancelled';
  }
  return '';
}

function collectConversationRunningStates(workspaceState) {
  const states = new Map();
  (workspaceState?.projects || []).forEach((project) => {
    (project?.conversations || []).forEach((conversation) => {
      if (!conversation?.id) return;
      states.set(conversation.id, conversationHasRunningTask(conversation));
    });
  });
  return states;
}

function ConversationNode({
  project,
  conversation,
  active,
  nodeRef,
  terminalStatus = '',
  now,
  taskPreviewLimit = 5,
  onSelectConversation,
  onToggleConversation,
  onToggleConversationTasks,
  onRequestDeleteConversation,
  onRequestRenameConversation,
  onOpenTaskReport,
}) {
  const tasks = conversation.tasks || [];
  const visibleLimit = Math.max(1, Number(taskPreviewLimit) || 5);
  const visibleTasks = conversation.tasksExpanded ? tasks.slice().reverse() : tasks.slice(-visibleLimit).reverse();
  const hiddenCount = Math.max(0, tasks.length - visibleLimit);
  const runningTask = conversationHasRunningTask(conversation);
  const showTaskList = conversation.expanded && tasks.length > 0;

  return (
    <div className={`conversation-node ${active ? 'active' : ''}`} ref={nodeRef}>
      <div
        role="button"
        tabIndex={0}
        className="conversation-row"
        onClick={() => onSelectConversation(project.id, conversation.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectConversation(project.id, conversation.id); }}
      >
        <button
          type="button"
          className="conversation-session-toggle"
          aria-label={conversation.expanded ? 'Collapse conversation' : 'Expand conversation'}
          aria-expanded={conversation.expanded}
          onClick={(event) => { event.stopPropagation(); onToggleConversation(project.id, conversation.id); }}
        >
          <span
            className={`ico ${runningTask ? 'ico-loading' : (conversation.expanded ? 'ico-comment-alt-dots' : 'ico-mobile-message')}`}
            aria-hidden="true"
          />
        </button>
        <PortalTooltip text={conversation.name || ''} position="above">
          <span className="conversation-name">{conversation.name}</span>
        </PortalTooltip>
        {terminalStatus && !active ? (
          <span className={`conversation-terminal-notice chat-timeline-status status-${terminalStatus}`} aria-hidden="true" />
        ) : null}
        <span className="conversation-actions">
          <ConversationAction label="Rename conversation" icon="pen-field" onClick={() => onRequestRenameConversation(project, conversation)} />
          <ConversationAction label="Delete conversation" icon="trash" onClick={() => onRequestDeleteConversation(project, conversation)} />
        </span>
      </div>

      {showTaskList && (
        <div className="conversation-task-list">
          {visibleTasks.map((task) => <TaskRecordCompact key={task.taskId || task.id} task={task} now={now} onOpenReport={onOpenTaskReport} />)}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="conversation-show-more"
              onClick={() => onToggleConversationTasks(project.id, conversation.id)}
            >
              {conversation.tasksExpanded ? 'Show less' : `Show ${hiddenCount} more`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function useConversationOrderAnimation(conversations) {
  const nodesRef = React.useRef(new Map());
  const previousRectsRef = React.useRef(new Map());
  const orderKey = (Array.isArray(conversations) ? conversations : [])
    .map((conversation) => conversation.id)
    .join('|');

  const registerNode = React.useCallback((id, node) => {
    if (!id) return;
    if (node) nodesRef.current.set(id, node);
    else nodesRef.current.delete(id);
  }, []);

  React.useLayoutEffect(() => {
    const nextRects = new Map();
    nodesRef.current.forEach((node, id) => {
      nextRects.set(id, node.getBoundingClientRect());
    });

    nextRects.forEach((nextRect, id) => {
      const node = nodesRef.current.get(id);
      const previousRect = previousRectsRef.current.get(id);
      if (!node || !previousRect) return;
      const dx = previousRect.left - nextRect.left;
      const dy = previousRect.top - nextRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

      node.style.transition = 'none';
      node.style.transform = `translate(${dx}px, ${dy}px)`;
      node.style.willChange = 'transform';

      requestAnimationFrame(() => {
        node.style.transition = 'transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        node.style.transform = 'translate(0, 0)';
      });

      const cleanup = (event) => {
        if (event && (event.target !== node || event.propertyName !== 'transform')) return;
        node.style.transition = '';
        node.style.transform = '';
        node.style.willChange = '';
        node.removeEventListener('transitionend', cleanup);
      };
      node.addEventListener('transitionend', cleanup);
      window.setTimeout(cleanup, 360);
    });

    previousRectsRef.current = nextRects;
  }, [orderKey]);

  return registerNode;
}

function ProjectNode({
  project,
  workspaceState,
  now,
  terminalNotices,
  onSelectProject,
  onToggleProject,
  onRemoveProject,
  onAddConversation,
  onSelectConversation,
  onToggleConversation,
  onToggleConversationTasks,
  onRequestDeleteConversation,
  onRequestRenameConversation,
  onOpenTaskReport,
  taskPreviewLimit = 5,
}) {
  const isActiveProject = workspaceState.activeProjectId === project.id;
  const registerConversationNode = useConversationOrderAnimation(project.conversations);

  return (
    <div className={`project-node ${isActiveProject ? 'active' : ''}`}>
      <div
        role="button"
        tabIndex={0}
        className="project-row"
        onClick={() => onSelectProject(project.id)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectProject(project.id); }}
      >
        <button
          type="button"
          className="project-icon-toggle"
          aria-label={project.expanded ? 'Collapse project' : 'Expand project'}
          aria-expanded={project.expanded}
          onClick={(event) => { event.stopPropagation(); onToggleProject(project.id); }}
        >
          <span className={`ico ${project.expanded ? 'ico-folder-open' : 'ico-folder'}`} aria-hidden="true" />
        </button>
        <PortalTooltip text={project.workspacePath || project.name || ''} position="below" multiline>
          <span className="project-name">{project.name}</span>
        </PortalTooltip>
        <span className="conversation-actions">
          <ConversationAction
            label="New Conversation"
            icon="multiple"
            tooltipPosition="below"
            onClick={() => {
              if (!project.expanded) onToggleProject(project.id);
              onAddConversation(project.id);
            }}
          />
          {project.removable && <ConversationAction label="Remove project" icon="trash" tooltipPosition="below" onClick={() => onRemoveProject(project)} />}
        </span>
      </div>

      {project.expanded && (
        <div className="project-conversations">
          {project.conversations.map((conversation) => (
            <ConversationNode
              key={conversation.id}
              project={project}
              conversation={conversation}
              active={isActiveProject && workspaceState.activeConversationId === conversation.id}
              nodeRef={(node) => registerConversationNode(conversation.id, node)}
              terminalStatus={terminalNotices?.[conversation.id] || ''}
              now={now}
              taskPreviewLimit={taskPreviewLimit}
              onSelectConversation={onSelectConversation}
              onToggleConversation={onToggleConversation}
              onToggleConversationTasks={onToggleConversationTasks}
              onRequestDeleteConversation={onRequestDeleteConversation}
              onRequestRenameConversation={onRequestRenameConversation}
              onOpenTaskReport={onOpenTaskReport}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserSessionFooter({ authUser, onLogout }) {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef(null);
  const displayName = authUser?.display_name || authUser?.username || 'User';
  const email = authUser?.email || '';

  React.useEffect(() => {
    if (!open) return;
    const handler = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className={`user-session-footer${open ? ' open' : ''}`} ref={wrapRef}>
      <button
        type="button"
        className="user-session-row"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="user-avatar" aria-hidden="true">
          <img src="assets/ui/avatar_default.png" alt="" draggable={false} />
        </span>
        <span className="user-meta">
          <span className="user-name">{displayName}</span>
          {email ? <span className="user-email">{email}</span> : null}
        </span>
        <svg className={`user-chevron${open ? ' rot' : ''}`} viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 L6 8 L9.5 4.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div className="user-session-menu" role="menu">
          <button
            type="button"
            className="user-session-signout"
            role="menuitem"
            onClick={() => { setOpen(false); onLogout && onLogout(); }}
          >
            <span className="logout-icon" aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ConversationsPanel({
  workspaceState,
  now,
  extensionStyle,
  onAddProject,
  onSelectProject,
  onToggleProject,
  onRemoveProject,
  onAddConversation,
  onSelectConversation,
  onToggleConversation,
  onToggleConversationTasks,
  onDeleteConversation,
  onRenameConversation,
  onOpenTaskReport,
  taskPreviewLimit = 5,
  authUser,
  onLogout,
}) {
  const [panelRef, panelWidth] = usePanelWidth();
  const [dialog, setDialog] = React.useState(null);
  const [terminalNotices, setTerminalNotices] = React.useState({});
  const previousRunningRef = React.useRef(new Map());
  // Conversations the user was actively viewing while a task was running.
  // Their completion was already seen, so they must never produce a
  // lingering notice — even after the user switches to another conversation.
  const seenWhileRunningRef = React.useRef(new Set());
  const activeProjectId = workspaceState?.activeProjectId;
  const activeConversationId = workspaceState?.activeConversationId;

  React.useEffect(() => {
    const nextRunning = collectConversationRunningStates(workspaceState);
    // Remember any conversation the user is actively viewing while its
    // task is still running.
    (workspaceState?.projects || []).forEach((project) => {
      (project?.conversations || []).forEach((conversation) => {
        if (!conversation?.id) return;
        if (
          project.id === activeProjectId &&
          conversation.id === activeConversationId &&
          nextRunning.get(conversation.id)
        ) {
          seenWhileRunningRef.current.add(conversation.id);
        }
      });
    });
    setTerminalNotices((current) => {
      let changed = false;
      const next = { ...current };
      (workspaceState?.projects || []).forEach((project) => {
        (project?.conversations || []).forEach((conversation) => {
          if (!conversation?.id) return;
          const wasRunning = previousRunningRef.current.get(conversation.id) === true;
          const isRunning = nextRunning.get(conversation.id) === true;
          if (!wasRunning || isRunning) return;
          // The user was viewing this conversation while its task was
          // running, so the completion was already seen — skip the
          // notice and forget the "seen" marker.
          if (seenWhileRunningRef.current.has(conversation.id)) {
            seenWhileRunningRef.current.delete(conversation.id);
            return;
          }
          const status = conversationLatestTerminalStatus(conversation);
          if (!status || next[conversation.id] === status) return;
          next[conversation.id] = status;
          changed = true;
        });
      });
      return changed ? next : current;
    });
    // Prune "seen" markers for conversations that are gone or no longer
    // running, so the set cannot grow without bound.
    const liveRunningIds = new Set();
    (workspaceState?.projects || []).forEach((project) => {
      (project?.conversations || []).forEach((conversation) => {
        if (conversation?.id && nextRunning.get(conversation.id)) {
          liveRunningIds.add(conversation.id);
        }
      });
    });
    seenWhileRunningRef.current = new Set(
      [...seenWhileRunningRef.current].filter((id) => liveRunningIds.has(id))
    );
    previousRunningRef.current = nextRunning;
  }, [workspaceState, activeProjectId, activeConversationId]);

  // The terminal notice is one-shot: the moment the user opens the
  // conversation (or is already viewing it when the task finishes), the
  // completion indicator should disappear immediately.
  React.useEffect(() => {
    if (!activeConversationId) return;
    setTerminalNotices((current) => {
      if (!current[activeConversationId]) return current;
      const next = { ...current };
      delete next[activeConversationId];
      return next;
    });
  }, [activeConversationId, activeProjectId]);

  const selectConversationAndClearNotice = React.useCallback((projectId, conversationId) => {
    if (conversationId) {
      setTerminalNotices((current) => {
        if (!current[conversationId]) return current;
        const next = { ...current };
        delete next[conversationId];
        return next;
      });
    }
    onSelectConversation(projectId, conversationId);  }, [onSelectConversation]);

  function requestRenameConversation(project, conversation) {
    setDialog({
      kind: 'rename',
      title: 'Rename conversation',
      value: conversation.name || 'Default Session',
      confirmLabel: 'Rename',
      onConfirm: (nextName) => onRenameConversation(project.id, conversation.id, nextName),
    });
  }

  function requestDeleteConversation(project, conversation) {
    setDialog({
      kind: 'delete',
      title: 'Delete conversation',
      message: `Delete "${conversation.name || 'this conversation'}" and all task records under it?`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => onDeleteConversation(project.id, conversation.id),
    });
  }

  function requestRemoveProject(project) {
    setDialog({
      kind: 'delete-project',
      title: 'Remove project',
      message: `Remove "${project.name || 'this project'}" from the workspace list? Local files will not be deleted.`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: () => onRemoveProject(project.id),
    });
  }

  return (
    <div className="side-panel left conversations-panel" ref={panelRef} style={{ ...extensionStyle, '--panel-width': `${panelWidth}px` }}>
      <div className="side-panel-head">
        <div className="title">Conversation</div>
        <PortalTooltip text="Add Project" position="below">
          <button
            type="button"
            className="conversation-head-action"
            onClick={onAddProject}
            aria-label="Add project"
          >
            <span className="ico ico-folder-plus-circle" aria-hidden="true" />
          </button>
        </PortalTooltip>
      </div>
      <div className="side-panel-body conversations-body">
        {workspaceState.projects.map((project) => (
          <ProjectNode
            key={project.id}
            project={project}
            workspaceState={workspaceState}
            now={now}
            terminalNotices={terminalNotices}
            taskPreviewLimit={taskPreviewLimit}
            onSelectProject={onSelectProject}
            onToggleProject={onToggleProject}
            onRemoveProject={requestRemoveProject}
            onAddConversation={onAddConversation}
            onSelectConversation={selectConversationAndClearNotice}
            onToggleConversation={onToggleConversation}
            onToggleConversationTasks={onToggleConversationTasks}
            onRequestDeleteConversation={requestDeleteConversation}
            onRequestRenameConversation={requestRenameConversation}
            onOpenTaskReport={onOpenTaskReport}
          />
        ))}
      </div>
      {authUser ? <UserSessionFooter authUser={authUser} onLogout={onLogout} /> : null}
      <ConversationDialog dialog={dialog} onCancel={() => setDialog(null)} />
    </div>
  );
}
window.ConversationsPanel = ConversationsPanel;

const LIVE_FEED_VISIBLE_COUNT = 3;

function getLiveEntries(agentData) {
  if (!agentData) return [];
  if (Array.isArray(agentData.entries)) return agentData.entries;
  if (!agentData.description && !agentData.tag) return [];
  return [{
    id: agentData.id || `${agentData.taskId || 'task'}:${agentData.ts || 'latest'}`,
    taskId: agentData.taskId,
    description: agentData.description || '',
    stepCurrent: agentData.stepCurrent || 1,
    stepTotal: agentData.stepTotal || 1,
    tag: agentData.tag || 'WORKING',
    kind: agentData.kind || 'info',
    ts: agentData.ts,
    status: agentData.completed
      ? normalizeTaskStatus(agentData.outcome || 'done')
      : (agentData.status || 'pending'),
  }];
}

function normalizeLiveStatus(status) {
  const normalized = normalizeTaskStatus(status);
  if (normalized === 'failed') return 'failed';
  if (normalized === 'cancelled') return 'cancelled';
  if (normalized === 'done') return 'done';
  return 'pending';
}

function LiveActivityStatusIcon({ status }) {
  const normalized = normalizeLiveStatus(status);
  if (normalized === 'done') {
    return <span className="live-activity-icon done"><span className="ico ico-check" aria-hidden="true" /></span>;
  }
  if (normalized === 'failed') {
    return <span className="live-activity-icon failed"><span className="ico ico-close" aria-hidden="true" /></span>;
  }
  if (normalized === 'cancelled') {
    return <span className="live-activity-icon cancelled"><StopCancelIcon /></span>;
  }
  return <span className="live-activity-icon pending"><span className="ico ico-loading" aria-hidden="true" /></span>;
}

function LiveActivityRow({ entry }) {
  const desc = entry.description || '';
  return (
    <div className={`live-activity-row status-${normalizeLiveStatus(entry.status)}`}>
      <LiveActivityStatusIcon status={entry.status} />
      <div className="live-activity-copy">
        <PortalTooltip text={desc} position="above" multiline>
          <div className="live-activity-desc">
            {desc || entry.tag || 'Working'}
          </div>
        </PortalTooltip>
      </div>
    </div>
  );
}

function LiveCard({ agentId, agentData, now }) {
  const [expanded, setExpanded] = React.useState(false);
  const char = window.CHAR_DEFS[agentId];
  if (!char) return null;
  const entries = getLiveEntries(agentData).filter((entry) => entry.taskId === agentData.taskId);
  const orderedEntries = entries.slice().sort((a, b) => a.ts - b.ts);
  const visibleEntries = expanded
    ? orderedEntries.slice().reverse()
    : orderedEntries.slice(-LIVE_FEED_VISIBLE_COUNT).reverse();
  const hiddenCount = Math.max(0, orderedEntries.length - LIVE_FEED_VISIBLE_COUNT);
  const ago = fmtAgoCompact(agentData.ts, now);
  const nameClass = `name agent-${agentId}`;

  return (
    <div className="live-card">
      <div className="avatar">
        <img
          className="portrait"
          data-agent={agentId}
          src={`assets/portraits/${agentId}.png`}
          alt={char.name}
          loading="lazy"
        />
      </div>
      <div className="body">
        <div className="row">
          <div className={nameClass}>{char.name}</div>
          <div className="ago">{ago}</div>
        </div>
        <div className="live-activity-list">
          {visibleEntries.map((entry) => (
            <LiveActivityRow key={entry.id || `${entry.ts}:${entry.description}`} entry={entry} />
          ))}
        </div>
        {hiddenCount > 0 && (
          <button
            type="button"
            className="live-feed-toggle"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Show less' : `Show ${hiddenCount} more`}
          </button>
        )}
      </div>
    </div>
  );
}

function shortRuntimeId(id) {
  if (!id) return '—';
  return String(id).slice(0, 8).toUpperCase();
}

function asRenderableText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => asRenderableText(item)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    if (typeof value.content === 'string') return value.content;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function RuntimeList({ title, items, renderItem, emptyText = 'No data.' }) {
  return (
    <div className="runtime-section">
      <div className="runtime-section-title">{title}</div>
      {items.length === 0 ? (
        <div className="runtime-empty">{emptyText}</div>
      ) : (
        <div className="runtime-list">
          {items.map(renderItem)}
        </div>
      )}
    </div>
  );
}

function LiveFeedPanel({ agentLive, now, extensionStyle, currentTask }) {
  const [panelRef, panelWidth] = usePanelWidth();
  const currentTaskId = currentTask?.taskId || null;
  const agents = currentTaskId
    ? Object.entries(agentLive)
      .filter(([_, data]) => data.ts)
      .filter(([_, data]) => {
        const entries = getLiveEntries(data);
        return data.taskId === currentTaskId || entries.some((entry) => entry.taskId === currentTaskId);
      })
      .sort((a, b) => (b[1].feedRank || 0) - (a[1].feedRank || 0) || b[1].ts - a[1].ts)
    : [];

  return (
    <div className="side-panel right" ref={panelRef} style={{ ...extensionStyle, '--panel-width': `${panelWidth}px` }}>
      <div className="side-panel-head">
        <div className="title">Live Feed</div>
        <div className="live-badge">
          <div className="dot" />
          LIVE
        </div>
      </div>
      <div className="side-panel-body">
        {agents.length === 0 ? (
          <div style={{color:'var(--dim-2)', fontSize:15, textAlign:'center', padding:'40px 12px', fontFamily:'Zpix'}}>
            Waiting for mission data...
          </div>
        ) : (
          agents.map(([id, data]) => (
            <LiveCard key={id} agentId={id} agentData={data} now={now} />
          ))
        )}
      </div>
    </div>
  );
}
window.LiveFeedPanel = LiveFeedPanel;

const OPENAI_CODEX_MODEL_OPTIONS = [
  { id: 'gpt-5.5', label: 'gpt5.5' },
  { id: 'gpt-5.4', label: 'gpt5.4' },
];

const ANTHROPIC_CLAUDE_MODEL_OPTIONS = [
  { id: 'claude-opus-4-8', label: 'opus4.8' },
  { id: 'claude-opus-4-7', label: 'opus4.7' },
  { id: 'claude-sonnet-4-6', label: 'sonnet4.6' },
];

const MODEL_OPTIONS = [
  ...OPENAI_CODEX_MODEL_OPTIONS,
  ...ANTHROPIC_CLAUDE_MODEL_OPTIONS,
];

// OAuth 模型只通过 model_id 下发；provider 由后端 resolver 基于 model_id 判定。
const PROVIDER_MODEL_CATALOG = {
  oauth: {
    options: MODEL_OPTIONS,
    defaultModelId: 'gpt-5.5',
  },
  openai: {
    options: OPENAI_CODEX_MODEL_OPTIONS,
    defaultModelId: 'gpt-5.5',
  },
  codex: {
    options: OPENAI_CODEX_MODEL_OPTIONS,
    defaultModelId: 'gpt-5.5',
  },
  'openai/codex': {
    options: OPENAI_CODEX_MODEL_OPTIONS,
    defaultModelId: 'gpt-5.5',
  },
  openai_codex_oauth: {
    options: OPENAI_CODEX_MODEL_OPTIONS,
    defaultModelId: 'gpt-5.5',
  },
  anthropic: {
    options: ANTHROPIC_CLAUDE_MODEL_OPTIONS,
    defaultModelId: 'claude-opus-4-8',
  },
  claude: {
    options: ANTHROPIC_CLAUDE_MODEL_OPTIONS,
    defaultModelId: 'claude-opus-4-8',
  },
  'anthropic/claude': {
    options: ANTHROPIC_CLAUDE_MODEL_OPTIONS,
    defaultModelId: 'claude-opus-4-8',
  },
  anthropic_oauth: {
    options: ANTHROPIC_CLAUDE_MODEL_OPTIONS,
    defaultModelId: 'claude-opus-4-8',
  },
  deepseek: {
    options: [
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro' },
    ],
    defaultModelId: 'deepseek-v4-flash',
  },
};

function resolveModelCatalog(provider) {
  const normalized = String(provider || '').trim().toLowerCase();
  if (normalized && PROVIDER_MODEL_CATALOG[normalized]) return PROVIDER_MODEL_CATALOG[normalized];
  return PROVIDER_MODEL_CATALOG.oauth;
}

window.resolveModelCatalog = resolveModelCatalog;

// Kept in sync with the backend default reasoning effort.
const DEFAULT_REASONING_EFFORT = 'high';
const REASONING_EFFORT_OPTIONS = [
  { id: 'low', label: 'low' },
  { id: 'medium', label: 'medium' },
  { id: 'high', label: 'high' },
  { id: 'xhigh', label: 'xhigh' },
];

const APPROVAL_MODE_OPTIONS = [
  { id: 'strict', label: 'Request Approval', icon: 'ask-for-help.png',   desc: 'Ask before every write or network op' },
  { id: 'smart',  label: 'Auto Approve',     icon: 'generative.png',     desc: 'Allow safe ops, ask on risk' },
  { id: 'full',   label: 'Full Access',      icon: 'cyber-security.png', desc: 'Allow everything without prompting' },
];

function resolveApprovalApiBase() {
  if (typeof window !== 'undefined') {
    const explicit = String(window.AGENT_WORLD_API_BASE || '').trim();
    if (explicit) return explicit.replace(/\/$/, '');
  }
  return '';
}

function ApprovalModePicker({ disabled = false }) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState('smart');
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const rootRef = React.useRef(null);
  const API = resolveApprovalApiBase();

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch(`${API}/api/approvals/state`, { cache: 'no-store' });
        if (!resp.ok) throw new Error('state fetch failed');
        const data = await resp.json();
        if (!cancelled && data && typeof data.mode === 'string') {
          setMode(data.mode);
        }
      } catch (_) {
        // backend may not be ready; fall back to smart
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    if (!open) return undefined;
    function handleDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  async function changeMode(next) {
    if (next === mode || busy) { setOpen(false); return; }
    const prev = mode;
    setMode(next);
    setOpen(false);
    setBusy(true);
    try {
      const resp = await fetch(`${API}/api/approvals/mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      });
      if (!resp.ok) throw new Error(`set mode failed: ${resp.status}`);
    } catch (err) {
      console.warn('[approval-mode] failed to set mode, reverting', err);
      setMode(prev);
    } finally {
      setBusy(false);
    }
  }

  const current = APPROVAL_MODE_OPTIONS.find((o) => o.id === mode) || APPROVAL_MODE_OPTIONS[1];

  return (
    <div className={`approval-mode-picker ${open ? 'is-open' : ''} ${loaded ? '' : 'is-loading'}`} ref={rootRef}>
      <PortalTooltip text={open ? '' : `Approval mode · ${current.label}`} position="above">
        <button
          type="button"
          className="approval-mode-trigger"
          onClick={() => { if (!disabled) setOpen((o) => !o); }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Approval mode"
        >
          <span
            className="approval-mode-icon"
            style={{
              WebkitMaskImage: `url("assets/ui/icons/${current.icon}")`,
              maskImage: `url("assets/ui/icons/${current.icon}")`,
            }}
            aria-hidden="true"
          />
          <span className="approval-mode-label">{current.label}</span>
          <span className="approval-mode-caret" aria-hidden="true" />
        </button>
      </PortalTooltip>
      {open ? (
        <div className="approval-mode-menu" role="listbox">
          <div className="approval-mode-header">approval mode</div>
          <div className="approval-mode-list">
            {APPROVAL_MODE_OPTIONS.map((opt) => {
              const active = opt.id === mode;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`approval-mode-option ${active ? 'is-active' : ''}`}
                  onClick={() => changeMode(opt.id)}
                  title={opt.desc}
                >
                  <span
                    className="approval-mode-option-icon"
                    style={{
                      WebkitMaskImage: `url("assets/ui/icons/${opt.icon}")`,
                      maskImage: `url("assets/ui/icons/${opt.icon}")`,
                    }}
                    aria-hidden="true"
                  />
                  <span className="approval-mode-option-text">
                    <span className="approval-mode-option-label">{opt.label}</span>
                    <span className="approval-mode-option-desc">{opt.desc}</span>
                  </span>
                  {active ? (
                    <span className="approval-mode-check" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                           strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3.2,8.6 6.6,12 13,4.8" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
window.ApprovalModePicker = ApprovalModePicker;

function ModelPicker({ value, reasoningEffort, options, reasoningOptions = REASONING_EFFORT_OPTIONS, onChange, onReasoningChange, disabled, loading = false }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const current = options.find((o) => o.id === value) || options[0];
  const currentReasoning = reasoningOptions.find((o) => o.id === reasoningEffort) || reasoningOptions.find((o) => o.id === DEFAULT_REASONING_EFFORT) || reasoningOptions[0];
  const modelLabel = current ? current.label : (loading ? 'loading' : 'unavailable');

  React.useEffect(() => {
    if (!open) return undefined;
    function handleDocMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKey(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleDocMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDocMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className={`model-picker ${open ? 'is-open' : ''} ${loading ? 'is-loading' : ''}`} ref={rootRef}>
      <PortalTooltip
        text={open ? '' : (loading ? 'Loading provider models...' : `${currentReasoning ? currentReasoning.id : ''} · ${current ? current.id : ''}`)}
        position="above"
      >
        <button
          type="button"
          className="model-picker-trigger"
          onClick={() => { if (!disabled && !loading) setOpen((o) => !o); }}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Select model"
        >
          <span className="model-picker-value">{currentReasoning ? currentReasoning.label : ''} · {modelLabel}</span>
          <span className={loading ? 'model-picker-loading' : 'model-picker-caret'} aria-hidden="true" />
        </button>
      </PortalTooltip>
      {open ? (
        <div className="model-picker-menu" role="listbox">
          <div className="model-picker-header">thinking</div>
          <div className="model-picker-list">
            {reasoningOptions.map((opt) => {
              const active = opt.id === currentReasoning?.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`model-picker-option ${active ? 'is-active' : ''}`}
                  onClick={() => { onReasoningChange?.(opt.id); }}
                  title={opt.id}
                >
                  <span className="model-picker-option-label">{opt.label}</span>
                  {active ? (
                    <span className="model-picker-check" aria-hidden="true">
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                           strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3.2,8.6 6.6,12 13,4.8" />
                      </svg>
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="model-picker-submenu">
            <button
              type="button"
              className="model-picker-option model-picker-model-entry"
              title={current ? current.id : ''}
              aria-haspopup="listbox"
            >
              <span className="model-picker-option-label">{modelLabel}</span>
              <span className="model-picker-subcaret" aria-hidden="true" />
            </button>
            <div className="model-picker-flyout" role="listbox" aria-label="model">
              <div className="model-picker-header">model</div>
              <div className="model-picker-list">
                {options.map((opt) => {
                  const active = opt.id === value;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`model-picker-option ${active ? 'is-active' : ''}`}
                      onClick={() => { onChange(opt.id); setOpen(false); }}
                      title={opt.id}
                    >
                      <span className="model-picker-option-label">{opt.label}</span>
                      {active ? (
                        <span className="model-picker-check" aria-hidden="true">
                          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
                               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3.2,8.6 6.6,12 13,4.8" />
                          </svg>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
window.ModelPicker = ModelPicker;

function isAbsolutePathLike(value) {
  return value.startsWith('/') || value === '~' || value.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(value);
}

function normalizeFsPath(value, homePath = '') {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  const normalizedHome = String(homePath || '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const expanded = normalizedHome && (raw === '~' || raw.startsWith('~/'))
    ? `${normalizedHome}${raw.slice(1)}`
    : raw;
  return expanded.replace(/\/+$/, '');
}

function basenameFromPath(value) {
  const normalized = normalizeFsPath(value);
  if (!normalized) return '';
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

function workspaceRelativePath(filePath, workspacePath, homePath = '') {
  const normalizedFile = normalizeFsPath(filePath, homePath);
  if (!normalizedFile) return '';
  const normalizedWorkspace = normalizeFsPath(workspacePath || homePath, homePath);
  if (!normalizedWorkspace) return normalizedFile;
  if (normalizedFile === normalizedWorkspace) return basenameFromPath(normalizedFile);
  const prefix = `${normalizedWorkspace}/`;
  if (normalizedFile.startsWith(prefix)) return normalizedFile.slice(prefix.length);
  return normalizedFile;
}

function stripWorkspaceNamePrefix(relativePath, workspacePath, homePath = '') {
  const normalized = normalizeFsPath(relativePath, homePath).replace(/^\.\/+/, '');
  if (!normalized) return '';
  const workspaceName = basenameFromPath(workspacePath || homePath);
  if (!workspaceName || !normalized.includes('/')) return normalized;
  const parts = normalized.split('/').filter(Boolean);
  if (parts[0] === workspaceName && parts.length > 1) return parts.slice(1).join('/');
  return normalized;
}

function normalizePastedPathLine(line, workspacePath, options = {}) {
  const homePath = options.homePath || '';
  let text = String(line || '').trim();
  if (!text) return '';
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  if (text.startsWith('file://')) {
    try {
      text = decodeURIComponent(text.replace(/^file:\/\//, ''));
    } catch (error) {
      text = text.replace(/^file:\/\//, '');
    }
  }
  if (isAbsolutePathLike(text)) return workspaceRelativePath(text, workspacePath, homePath);
  const relativePath = stripWorkspaceNamePrefix(text, workspacePath, homePath);
  return options.filePaste && !normalizeFsPath(workspacePath || homePath, homePath) ? basenameFromPath(relativePath) : relativePath;
}

function normalizePastedPathText(text, workspacePath, homePath = '') {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/);
  const shouldNormalize = lines.every((line) => {
    const item = line.trim();
    return !item
      || item.startsWith('file://')
      || isAbsolutePathLike(item)
      || item.startsWith('./')
      || item.startsWith('../')
      || (item.includes('/') && !/\s/.test(item));
  });
  if (!shouldNormalize) return '';
  const normalized = lines.map((line) => normalizePastedPathLine(line, workspacePath, { homePath })).join('\n');
  return normalized === raw ? '' : normalized;
}

function clipboardFilesToPathText(files, workspacePath, homePath = '') {
  return Array.from(files || [])
    .map((file) => {
      const nativePath = (() => {
        try {
          return window.haish?.getPathForFile?.(file) || '';
        } catch (_) {
          return '';
        }
      })();
      const rawPath = nativePath || file?.path || file?.webkitRelativePath || '';
      return normalizePastedPathLine(rawPath, workspacePath, { filePaste: true, homePath });
    })
    .filter(Boolean)
    .join('\n');
}

function clipboardUriListToPathText(uriList, workspacePath, homePath = '') {
  return String(uriList || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => normalizePastedPathLine(line, workspacePath, { filePaste: true, homePath }))
    .filter(Boolean)
    .join('\n');
}

function insertTextAtSelection(value, insertText, selectionStart, selectionEnd, maxLength) {
  const current = String(value || '');
  const start = Number.isFinite(selectionStart) ? selectionStart : current.length;
  const end = Number.isFinite(selectionEnd) ? selectionEnd : start;
  const prefix = current.slice(0, start);
  const suffix = current.slice(end);
  const spacerBefore = prefix && !/[\s\n]$/.test(prefix) ? '\n' : '';
  const spacerAfter = suffix && !/^[\s\n]/.test(suffix) ? '\n' : '';
  return `${prefix}${spacerBefore}${insertText}${spacerAfter}${suffix}`.slice(0, maxLength);
}

function handlePathPaste(event, currentValue, setValue, workspacePath, homePath = '', maxLength = 500) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const uriText = clipboardUriListToPathText(clipboard.getData('text/uri-list'), workspacePath, homePath);
  const fileText = clipboardFilesToPathText(clipboard.files, workspacePath, homePath);
  const plainText = clipboard.getData('text/plain');
  const normalizedText = uriText || fileText || normalizePastedPathText(plainText, workspacePath, homePath);
  if (!normalizedText) return;
  event.preventDefault();
  const target = event.currentTarget;
  const selectionStart = target.selectionStart;
  const nextValue = insertTextAtSelection(
    currentValue,
    normalizedText,
    selectionStart,
    target.selectionEnd,
    maxLength,
  );
  setValue(nextValue);
  window.requestAnimationFrame(() => {
    const cursor = Math.min(nextValue.length, (selectionStart || 0) + normalizedText.length);
    target.setSelectionRange(cursor, cursor);
  });
}

function formatContextTokens(value) {
  const tokens = Math.max(0, Math.round(Number(value) || 0));
  const thousands = tokens / 1000;
  if (tokens === 0) return '0k';
  if (thousands < 10) return `${Math.max(0.1, thousands).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(thousands)}k`;
}

function formatContextUsageLabel(usedTokens, totalTokens) {
  return `Context: ${formatContextTokens(usedTokens)} / ${formatContextTokens(totalTokens)}`;
}

function formatElapsedDuration(start, end) {
  const startMs = Number(start) || 0;
  const endMs = Number(end) || 0;
  if (!startMs || !endMs || endMs < startMs) return '';
  const totalSeconds = Math.max(0, Math.floor((endMs - startMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatMessageClock(value) {
  const time = Number(value) || 0;
  if (!time) return '';
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (!value.trim()) return false;
  try {
    const clipboard = globalThis.navigator?.clipboard;
    if (clipboard?.writeText) {
      await clipboard.writeText(value);
      return true;
    }
  } catch (error) {
    // Fall through to the textarea copy path below.
  }
  try {
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    el.setSelectionRange(0, value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch (error) {
    return false;
  }
}

function TaskDelegation({ onDeploy, onStop, onSelectFile, onClearFile, attachment, uploading, running, disabled, contextUsage, workspacePath, homePath, activeTaskText, modelOptions, defaultModelId, modelLoading = false }) {
  const resolvedOptions = Array.isArray(modelOptions) ? modelOptions : MODEL_OPTIONS;
  const resolvedDefaultModelId = defaultModelId || resolvedOptions[0]?.id || 'gpt-5.5';
  const [v, setV] = React.useState('');
  const [modelId, setModelId] = React.useState(resolvedDefaultModelId);

  React.useEffect(() => {
    if (!resolvedOptions.find((o) => o.id === modelId)) {
      setModelId(resolvedDefaultModelId);
    }
  }, [resolvedOptions, resolvedDefaultModelId]);
  const [reasoningEffort, setReasoningEffort] = React.useState(DEFAULT_REASONING_EFFORT);
  const taRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const suppressSubmitUntilRef = React.useRef(0);
  const usedTokens = Math.max(0, Math.round(Number(contextUsage?.usedTokens) || 0));
  const totalTokens = Math.max(1, Math.round(Number(contextUsage?.totalTokens) || 128000));
  const contextRatio = Math.max(0, Math.min(1, Number(contextUsage?.ratio) || (usedTokens / totalTokens)));
  const visibleContextRatio = usedTokens > 0 ? Math.max(contextRatio, 0.01) : 0;
  const contextTooltip = formatContextUsageLabel(usedTokens, totalTokens);
  const contextRingStyle = {
    '--context-used': `${visibleContextRatio * 100}%`,
  };

  React.useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  }, [v]);

  function restoreActiveTaskText() {
    const text = String(activeTaskText || '').trim();
    if (!text) return;
    setV(text);
    requestAnimationFrame(() => {
      taRef.current?.focus?.();
      taRef.current?.setSelectionRange?.(text.length, text.length);
    });
  }

  function stopAndRestore() {
    onStop?.();
    restoreActiveTaskText();
  }

  function handleStopPress(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    suppressSubmitUntilRef.current = Date.now() + 700;
    stopAndRestore();
  }

  function handleStopKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    handleStopPress(event);
  }

  React.useEffect(() => {
    if (!running) return undefined;
    function handleEscape(event) {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      stopAndRestore();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [running, activeTaskText, onStop]);

  function submit(e) {
    e?.preventDefault();
    if (Date.now() < suppressSubmitUntilRef.current) return;
    if (!v.trim() || disabled) return;
    if (modelLoading || !resolvedOptions.some((o) => o.id === modelId)) return;
    onDeploy(v.trim(), attachment, modelId, reasoningEffort);
    setV('');
    onClearFile?.();
    if (fileRef.current) fileRef.current.value = '';
  }

  function pickFile() {
    if (disabled) return;
    fileRef.current?.click();
  }

  function clearFile(e) {
    e.stopPropagation();
    onClearFile?.();
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="task-delegation">
      <div className="td-head">
        <div className="td-title">
          <span className="td-glyph ico ico-task-delegation" aria-hidden="true" />
          Task Delegation
        </div>
      </div>
      {attachment && (
        <div className="td-attachments" aria-label="Attached files">
          <AttachmentFileChip attachment={attachment} uploading={uploading} onClear={clearFile} />
        </div>
      )}
      <div className="td-input-row">
        <textarea
          ref={taRef}
          rows={1}
          value={v}
          onChange={e => setV(e.target.value)}
          onPaste={e => handlePathPaste(e, v, setV, workspacePath, homePath, 5000)}
          onKeyDown={e => {
            if (e.key === 'Escape' && running && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.stopPropagation();
              stopAndRestore();
              return;
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }}
          placeholder={uploading ? 'Document is processing. Please wait...' : disabled ? 'Agents are currently busy executing...' : 'Describe the task you want to delegate...'}
          disabled={disabled}
          maxLength={5000}
        />
        <div className="char-count">{v.length} / 5000</div>
      </div>
      <div className="td-actions">
        <div className="td-tools">
          <PortalTooltip text="Attach File" position="above">
            <button
              type="button"
              className="td-btn td-btn-attach icon-only"
              onClick={pickFile}
              disabled={disabled}
              aria-label="Attach File"
            >
              <span className="ico ico-attach" aria-hidden="true" />
            </button>
          </PortalTooltip>
          <input
            ref={fileRef}
            type="file"
            className="td-file-input"
            onChange={e => {
              const nextFile = e.target.files?.[0] || null;
              if (!nextFile) return;
              onSelectFile?.(nextFile);
            }}
          />
          <ApprovalModePicker />
        </div>
        <div className="td-submit-cluster">
          <PortalTooltip text={contextTooltip} position="above">
            <button
              type="button"
              className={`context-usage-btn icon-only ${contextUsage?.compressed ? 'compressed' : ''}`}
              aria-label={contextTooltip}
              aria-disabled="true"
            >
              <span className="context-usage-icon" style={contextRingStyle} aria-hidden="true" />
            </button>
          </PortalTooltip>
          <ModelPicker
            value={modelId}
            reasoningEffort={reasoningEffort}
            options={resolvedOptions}
            onChange={setModelId}
            onReasoningChange={setReasoningEffort}
            disabled={disabled}
            loading={modelLoading}
          />
          {running ? (
            <PortalTooltip text="Stop" position="above">
              <button
                type="button"
                className="deploy-btn stop icon-only"
                onMouseDown={handleStopPress}
                onKeyDown={handleStopKey}
                aria-label="Stop"
              >
                <span className="ico ico-stop" aria-hidden="true" />
              </button>
            </PortalTooltip>
          ) : (
            <PortalTooltip text="Deploy" position="above">
              <button
                className="deploy-btn icon-only"
                onClick={submit}
                disabled={disabled || !v.trim()}
                aria-label="Deploy"
              >
                <span className="ico ico-deploy" aria-hidden="true" />
              </button>
            </PortalTooltip>
          )}
        </div>
      </div>
    </div>
  );
}
window.TaskDelegation = TaskDelegation;

const CATEGORY_ICON_CLASS = {
  tool: 'ico-tool',
  skill: 'ico-skill',
  mcp: 'ico-mcp',
  subagent: 'ico-subagent',
};

const CATEGORY_LABEL = {
  tool: 'Tool',
  skill: 'Skill',
  mcp: 'MCP',
  subagent: 'SubAgent',
};

// 工具名 → 专属 icon class（用 .ico-* mask-image 系统）。
// 比如 web_search / web_fetch / fetch_url 都该用 globe 图标，而不是默认扳手。
// 匹配顺序按更具体的关键词在前。
function resolveToolIconClass(toolName, defaultClass) {
  const name = String(toolName || '').toLowerCase();
  if (!name) return defaultClass;
  if (name === 'workspace_artifact') {
    return 'ico-workspace-artifact';
  }
  if (name === 'vision_analyze' || name === 'visual_inspect') {
    return 'ico-visual-inspect';
  }
  if (name === 'image_describe') {
    return 'ico-image-describe';
  }
  if (name === 'terminal') {
    return 'ico-terminal';
  }
  if (name === 'copy_file') {
    return 'ico-copy-file';
  }
  if (name === 'create_dir') {
    return 'ico-create-dir';
  }
  if (name === 'delete_file') {
    return 'ico-delete-file';
  }
  if (name === 'list_dir') {
    return 'ico-list-dir';
  }
  if (name === 'glob_files') {
    return 'ico-glob-files';
  }
  if (name.includes('checkpoint') || name.includes('rollback')) {
    return 'ico-checkpoint';
  }
  if (name.includes('background_process')) {
    return 'ico-background-process';
  }
  if (name.startsWith('note_')) {
    return 'ico-note';
  }
  if (name === 'search_text') {
    return 'ico-search-text';
  }
  if (name === 'edit_file' || name === 'replace_lines' || name === 'multi_edit' || name === 'apply_patch') {
    return 'ico-file-write';
  }
  if (name.startsWith('document_') || name.includes('rag') || name.includes('knowledge') || name.includes('retrieve')
      || name.includes('vector') || name.includes('embed')) {
    return 'ico-rag';
  }
  if (name.includes('memory') || name.includes('remember') || name.includes('recall')) {
    return 'ico-memory';
  }
  if (name.includes('weather') || name.includes('forecast') || name.includes('temperature')) {
    return 'ico-weather';
  }
  if (name.includes('write') || name.includes('create_file') || name.includes('save_file') || name.includes('patch')) {
    return 'ico-file-write';
  }
  if (name.includes('read_file') || name.includes('read_text') || name.includes('open_file')
      || name.includes('cat_file') || name.includes('view_file')) {
    return 'ico-file-read';
  }
  if (name.includes('web') || name.includes('search') || name.includes('fetch')
      || name.includes('http') || name.includes('url')) {
    return 'ico-web';
  }
  return defaultClass;
}

/**
 * 复用的 collapse/expand chevron。
 * 用 inline SVG 而不是 <img src=...png>——因为全局 body 有 `image-rendering: pixelated`
 * 会把任何位图强制走最邻近缩放、变得很糊。SVG 是矢量，不受影响。
 * fill="currentColor" 让箭头颜色跟随容器 color（比如折叠胶囊的金色）。
 *
 * open=false → ▸ (next, 朝右)
 * open=true  → ▾ (down, 朝下)
 */
function ChatTimelineChevron({ open }) {
  return (
    <svg
      className={`chat-timeline-chevron ${open ? 'is-open' : ''}`}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open
        ? <polyline points="6 9 12 16 18 9" />   /* down */
        : <polyline points="9 6 16 12 9 18" />   /* next */}
    </svg>
  );
}

const TOOL_READ_NAMES = new Set(['read_file', 'search_text', 'glob_files', 'list_dir']);
const TOOL_DIFF_NAMES = new Set(['write_file', 'edit_file', 'replace_lines', 'multi_edit', 'apply_patch']);
const TOOL_CHANGE_NAMES = new Set([
  'write_file',
  'edit_file',
  'replace_lines',
  'multi_edit',
  'apply_patch',
  'create_file',
  'delete_file',
  'copy_file',
  'create_dir',
]);
const TOOL_SHELL_NAMES = new Set([
  'terminal',
  'start_background_process',
  'background_process_status',
  'read_background_process_output',
  'stop_background_process',
  'list_background_processes',
]);
const TOOL_PROCESS_NAMES = new Set([
  'dispatch_sub_agent',
  'sub_agent',
  'subagent',
  'vision_analyze',
  'visual_inspect',
  'image_describe',
]);
const TOOL_BLOCK_LIMIT = 16000;
const TOOL_SHELL_TAIL_LINES = 80;
const TOOL_SHELL_TAIL_CHARS = 8192;
const TOOL_JSON_STRING_LIMIT = 2000;
const TOOL_JSON_ARRAY_LIMIT = 20;
const TOOL_JSON_DEPTH_LIMIT = 4;
const TOOL_SUMMARY_VALUE_LIMIT = 420;
const TOOL_JSON_OMIT_KEYS = new Set([
  'meta',
  'metadata',
  'limits',
  'references',
  'raw',
  'raw_content',
  'html',
  'base64',
  'bytes',
  'image',
  'images',
  'screenshot',
  'trace',
  'debug',
  'stack',
  'tool_input',
  'tool_output',
  'tool_response',
  'tool_call',
  'tool_call_id',
]);
const TOOL_ARTIFACT_KEEP_KEYS = new Set([
  'preview',
  'output',
  'content',
  'text',
  'stdout',
  'stderr',
  'log_preview',
]);
function compactToolText(value, limit = TOOL_BLOCK_LIMIT) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 24)}\n... output truncated ...`;
}

function stableJson(value) {
  try {
    return compactToolText(JSON.stringify(value, null, 2));
  } catch {
    return compactToolText(String(value ?? ''));
  }
}

function compactToolValue(value, limit = TOOL_SUMMARY_VALUE_LIMIT) {
  if (value == null) return '';
  const text = typeof value === 'string' ? value : stableJson(value);
  return truncateToolString(text.replace(/\n{3,}/g, '\n\n').trim(), limit);
}

function truncateToolString(value, limit = TOOL_JSON_STRING_LIMIT) {
  const text = String(value ?? '');
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 18)}... truncated ...`;
}

function tailToolOutput(value) {
  const text = String(value ?? '');
  if (!text.trim()) return 'No output.';
  const lineTail = text.split('\n').slice(-TOOL_SHELL_TAIL_LINES).join('\n');
  if (lineTail.length <= TOOL_SHELL_TAIL_CHARS) {
    return lineTail.length < text.length
      ? `... output truncated, showing tail ...\n${lineTail}`
      : lineTail;
  }
  return `... output truncated, showing tail ...\n${lineTail.slice(-TOOL_SHELL_TAIL_CHARS)}`;
}

function summarizeProgressEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((event) => {
      if (!event) return '';
      const state = String(event.state || '').trim();
      const summary = compactToolValue(event.summary || event.outputSummary || event.inputSummary || event.message, 760);
      if (!summary) return '';
      return state ? `${state}: ${summary}` : summary;
    })
    .filter(Boolean);
}

function sanitizeToolJson(value, depth = 0, keyName = '') {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'string') return truncateToolString(value);
  if (depth >= TOOL_JSON_DEPTH_LIMIT) return '[Object truncated]';
  if (Array.isArray(value)) {
    const items = value.slice(0, TOOL_JSON_ARRAY_LIMIT).map((item) => sanitizeToolJson(item, depth + 1));
    if (value.length > TOOL_JSON_ARRAY_LIMIT) {
      items.push(`... ${value.length - TOOL_JSON_ARRAY_LIMIT} more item(s) ...`);
    }
    return items;
  }
  if (typeof value !== 'object') return truncateToolString(value);
  const key = String(keyName || '').toLowerCase();
  if (key === 'artifacts') {
    const artifacts = {};
    Object.entries(value).forEach(([artifactKey, artifactValue]) => {
      if (!TOOL_ARTIFACT_KEEP_KEYS.has(String(artifactKey).toLowerCase())) return;
      artifacts[artifactKey] = sanitizeToolJson(artifactValue, depth + 1, artifactKey);
    });
    return Object.keys(artifacts).length ? artifacts : undefined;
  }
  const result = {};
  Object.entries(value).forEach(([entryKey, entryValue]) => {
    const normalizedKey = String(entryKey).toLowerCase();
    if (TOOL_JSON_OMIT_KEYS.has(normalizedKey)) return;
    const sanitized = sanitizeToolJson(entryValue, depth + 1, entryKey);
    if (sanitized !== undefined) result[entryKey] = sanitized;
  });
  return result;
}

function compactToolJsonPayload(input, output) {
  const payload = {};
  if (input) payload.input = sanitizeToolJson(input);
  if (output) {
    if (output && typeof output === 'object') {
      payload.output = sanitizeToolJson({
        status: output.status,
        result_state: output.result_state,
        summary: output.summary,
        subject: output.subject,
        data: output.data,
        artifacts: output.artifacts,
        error: output.error,
      });
    } else {
      payload.output = sanitizeToolJson(output);
    }
  }
  return payload;
}

function isEmptyToolJsonValue(value) {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function toolJsonText(value, limit = TOOL_BLOCK_LIMIT) {
  if (value == null || value === '') return '';
  const sanitized = sanitizeToolJson(value);
  if (isEmptyToolJsonValue(sanitized)) return '';
  return compactToolText(JSON.stringify(sanitized, null, 2), limit);
}

function outputJsonText(output) {
  if (output == null || output === '') return '';
  if (output && typeof output === 'object') {
    const payload = compactToolJsonPayload(undefined, output);
    return toolJsonText(payload.output || sanitizeToolJson(output));
  }
  return toolJsonText(output);
}

function normalizeToolName(toolName) {
  return String(toolName || '').trim().toLowerCase();
}

function toolPlainObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    const text = value.trim();
    if (text.startsWith('{') && text.endsWith('}')) {
      try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
  }
  return {};
}

function isToolFailure(item) {
  const status = String(item?.status || '').toLowerCase();
  if (status === 'failed' || status === 'error') return true;
  const response = toolPlainObject(item?.toolResponse);
  const responseStatus = String(response.status || '').toLowerCase();
  const resultState = String(response.result_state || response.resultState || response.state || '').toLowerCase();
  return Boolean(response.error)
    || responseStatus === 'error'
    || responseStatus === 'failed'
    || resultState === 'blocked'
    || resultState === 'failed'
    || resultState === 'error';
}

function firstToolDisplayValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return '';
}

function isRawToolResponseText(value) {
  return String(value || '').trimStart().startsWith('TOOL_RESPONSE');
}

function isVisualProcessTool(name) {
  return name === 'vision_analyze'
    || name === 'visual_inspect'
    || name === 'image_describe'
    || name === 'acceptance_check'
    || name.includes('visual')
    || name.includes('vision');
}

function isProcessTool(item, name) {
  return item.category === 'subagent' || TOOL_PROCESS_NAMES.has(name) || isVisualProcessTool(name);
}

function getToolSubject(item) {
  const response = toolPlainObject(item.toolResponse);
  const subject = toolPlainObject(response.subject);
  const input = toolPlainObject(item.toolInput);
  return {
    ...input,
    ...subject,
  };
}

function firstToolPath(item) {
  const subject = getToolSubject(item);
  if (subject.path) return String(subject.path);
  if (subject.source_path && subject.destination_path) return `${subject.source_path} -> ${subject.destination_path}`;
  if (subject.destination_path) return String(subject.destination_path);
  if (subject.source_path) return String(subject.source_path);
  if (subject.pattern) return String(subject.pattern);
  if (subject.query) return String(subject.query);
  if (subject.command) return String(subject.command);
  return '';
}

function toolStreamTextForEvent(event, item) {
  const type = String(event?.type || '');
  const text = compactToolValue(event?.summary || event?.message || event?.outputSummary || event?.inputSummary, TOOL_BLOCK_LIMIT);
  const normalizedText = text.trim().toLowerCase();
  if (type === 'sub_agent_answer_delta') return '';
  if (type === 'llm_tool_call_requested') return '';
  if (type === 'tool_manager_received') return '';
  if (type === 'tool_dispatched') return '';
  if (type === 'tool_executor_started') return '';
  if (type === 'sub_agent_tool_executor_completed' && (text.length > 180 || text.trim().startsWith('{') || text.includes('\n'))) return '';
  if (normalizedText === 'queued') return '';
  if (normalizedText === 'dispatched') return '';
  if (normalizedText === `${normalizeToolName(item.toolName)} started`) return '';
  if (normalizedText === `${toolActionLabel(item).toLowerCase()} started`) return '';
  if (normalizedText === 'the tool request has reached the tool manager.') return '';
  if (normalizedText === 'dispatched to internal tool executor.') return '';
  return text;
}

function buildToolStreamAnswerText(item) {
  const events = Array.isArray(item.progressEvents) ? item.progressEvents : [];
  return events
    .filter((event) => event?.type === 'sub_agent_answer_delta')
    .map((event) => String(event.message || event.summary || '').trimEnd())
    .filter(Boolean)
    .join('');
}

function buildToolStreamLines(item) {
  const lines = [];
  const events = Array.isArray(item.progressEvents) ? item.progressEvents : [];
  events.forEach((event, index) => {
    const text = toolStreamTextForEvent(event, item);
    if (!text) return;
    const last = lines[lines.length - 1];
    if (last && last.text === text) return;
    lines.push({
      id: event.id || `${event.type || 'event'}-${index}`,
      state: event.state || event.type || '',
      text,
    });
  });
  if (!lines.length && item.outputSummary) {
    lines.push({ id: 'output-summary', state: 'completed', text: compactToolValue(item.outputSummary, TOOL_BLOCK_LIMIT) });
  }
  return lines;
}

function subAgentEventText(event) {
  return String(event?.message || event?.summary || event?.outputSummary || event?.inputSummary || '').trim();
}

function subAgentToolEventKey(event) {
  return event?.callId
    || event?.toolCallId
    || event?.tool_call_id
    || '';
}

function subAgentToolNameKey(event) {
  return String(event?.toolName || event?.label || event?.summary || 'tool')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findPendingSubAgentTool(items, event) {
  const nameKey = subAgentToolNameKey(event);
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (!item || item.kind !== 'tool' || item.status === 'done') continue;
    if (subAgentToolNameKey(item) === nameKey) return item;
  }
  return null;
}

function subAgentToolCategory(event) {
  const explicit = String(event?.category || event?.toolCategory || event?.tool_category || '').trim();
  if (explicit) return explicit;
  const name = String(event?.toolName || '').trim();
  if (name.includes(' ')) return 'mcp';
  return 'tool';
}

function buildSubAgentTimelineItems(view) {
  const events = Array.isArray(view.progressEvents) ? view.progressEvents : [];
  const items = [];
  const toolItemsByKey = new Map();
  let textBuffer = '';
  let textIndex = 0;
  const flushText = (streaming = false) => {
    const value = textBuffer;
    textBuffer = '';
    if (!value.trim()) return;
    items.push({
      kind: 'text',
      id: `sub-text-${textIndex}`,
      text: value,
      streaming,
    });
    textIndex += 1;
  };
  events.forEach((event, index) => {
    const type = String(event?.type || '');
    if (type === 'sub_agent_answer_delta' || type === 'sub_agent_progress_delta') {
      const value = subAgentEventText(event);
      if (value) textBuffer += value;
      return;
    }
    if (type === 'sub_agent_tool_call_requested') {
      flushText(false);
      const key = subAgentToolEventKey(event) || `pending-${index}`;
      const item = {
        kind: 'tool',
        id: `sub-tool-${key}-${index}`,
        category: subAgentToolCategory(event),
        status: 'running',
        toolName: event.toolName || event.summary || 'Tool',
        label: event.toolName || event.summary || 'Tool',
        inputSummary: event.inputSummary || event.summary || '',
        outputSummary: '',
        toolInput: event.toolInput || null,
        toolResponse: null,
        toolOutput: '',
      };
      items.push(item);
      if (subAgentToolEventKey(event)) toolItemsByKey.set(key, item);
      return;
    }
    if (type === 'sub_agent_tool_executor_completed') {
      flushText(false);
      const key = subAgentToolEventKey(event);
      let item = key ? toolItemsByKey.get(key) : null;
      if (!item) item = findPendingSubAgentTool(items, event);
      if (!item) {
        const fallbackKey = key || `completed-${index}`;
        item = {
          kind: 'tool',
          id: `sub-tool-${fallbackKey}-${index}`,
          category: subAgentToolCategory(event),
          status: 'done',
          toolName: event.toolName || 'Tool',
          label: event.toolName || 'Tool',
          inputSummary: event.inputSummary || '',
          outputSummary: event.outputSummary || event.summary || '',
          toolInput: event.toolInput || null,
          toolResponse: event.toolResponse || null,
          toolOutput: event.toolOutput || '',
        };
        items.push(item);
        if (key) toolItemsByKey.set(key, item);
        return;
      }
      item.status = 'done';
      item.outputSummary = event.outputSummary || event.summary || item.outputSummary || '';
      item.toolResponse = event.toolResponse || item.toolResponse || null;
      item.toolOutput = event.toolOutput || item.toolOutput || '';
    }
  });
  flushText(Boolean(view.isRunning));
  return items;
}

function extractProcessResultText(item) {
  const response = toolPlainObject(item.toolResponse);
  const data = toolPlainObject(response.data);
  const verdict = toolPlainObject(data.verdict);
  const report = toolPlainObject(data.report);
  const error = toolPlainObject(response.error);
  // 不再截断 finalText：sub-agent / vision 完成答案需要完整展示。
  return compactToolValue(firstToolDisplayValue(
    data.answer,
    data.final_answer,
    verdict.summary,
    report.summary,
    data.summary,
    response.summary,
    error.message,
    item.outputSummary,
  ), TOOL_BLOCK_LIMIT);
}

function extractTerminalOutput(item, response, artifacts, data) {
  const rawToolOutput = isRawToolResponseText(item.toolOutput) ? '' : item.toolOutput;
  return firstToolDisplayValue(
    artifacts.output,
    artifacts.content,
    artifacts.text,
    artifacts.stdout,
    data.stdout,
    data.output,
    rawToolOutput,
  );
}

function toolDisplayOutput(item) {
  if (item.toolResponse) return item.toolResponse;
  if (isRawToolResponseText(item.toolOutput)) return item.outputSummary || undefined;
  return item.toolOutput || item.outputSummary || undefined;
}

function toolLineDelta(item, diffText) {
  const data = item.toolResponse && typeof item.toolResponse === 'object' && item.toolResponse.data
    ? item.toolResponse.data
    : {};
  const explicitAdded = Number(data.added_lines);
  const explicitRemoved = Number(data.removed_lines);
  if (Number.isFinite(explicitAdded) || Number.isFinite(explicitRemoved)) {
    return {
      added: Number.isFinite(explicitAdded) ? explicitAdded : 0,
      removed: Number.isFinite(explicitRemoved) ? explicitRemoved : 0,
    };
  }
  let added = 0;
  let removed = 0;
  String(diffText || '').split('\n').forEach((line) => {
    if (line.startsWith('+++') || line.startsWith('---')) return;
    if (line.startsWith('+')) added += 1;
    if (line.startsWith('-')) removed += 1;
  });
  return { added, removed };
}

function getToolDiff(item) {
  const response = item.toolResponse && typeof item.toolResponse === 'object' ? item.toolResponse : {};
  const artifacts = response.artifacts && typeof response.artifacts === 'object' ? response.artifacts : {};
  const data = response.data && typeof response.data === 'object' ? response.data : {};
  return artifacts.diff || data.diff || artifacts.unified_diff || '';
}

function toolActionLabel(item) {
  const name = normalizeToolName(item.toolName);
  if (name === 'write_file') return 'Wrote';
  if (name === 'edit_file') return 'Edited';
  if (name === 'replace_lines') return 'Replaced lines';
  if (name === 'multi_edit') return 'Edited';
  if (name === 'apply_patch') return 'Patched';
  if (name === 'create_file') return 'Created';
  if (name === 'delete_file') return 'Deleted';
  if (name === 'copy_file') return 'Copied';
  if (name === 'create_dir') return 'Created dir';
  if (name === 'read_file') return 'Read';
  if (name === 'search_text') return 'Search text';
  if (name === 'glob_files') return 'Glob files';
  if (name === 'list_dir') return 'List dir';
  if (name === 'terminal') return 'Shell';
  if (name === 'start_background_process') return 'Start background process';
  if (name === 'read_background_process_output') return 'Read background output';
  if (name === 'stop_background_process') return 'Stop background process';
  if (name === 'background_process_status') return 'Background process status';
  if (name === 'list_background_processes') return 'List background processes';
  return item.label || item.toolName || 'Tool';
}

function toolFailureActionLabel(item) {
  const name = normalizeToolName(item.toolName);
  if (name === 'write_file') return 'Write failed';
  if (name === 'edit_file') return 'Edit failed';
  if (name === 'replace_lines') return 'Replace lines failed';
  if (name === 'multi_edit') return 'Edit failed';
  if (name === 'apply_patch') return 'Apply patch failed';
  if (name === 'create_file') return 'Create failed';
  if (name === 'delete_file') return 'Delete failed';
  if (name === 'copy_file') return 'Copy failed';
  return `${toolActionLabel(item)} failed`;
}

function extractProcessChatMeta(item, name) {
  const input = toolPlainObject(item.toolInput);
  const task = firstToolDisplayValue(
    input.task,
    input.prompt,
    input.message,
    input.query,
    input.question,
    input.instruction,
    input.description,
    input.user_message,
  );
  const role = firstToolDisplayValue(
    input.role,
    input.agent_name,
    input.agent,
    input.sub_agent,
    input.subagent,
    input.name,
  );
  const systemPrompt = firstToolDisplayValue(
    input.system_prompt,
    input.system,
    input.systemPrompt,
    input.persona,
    input.instructions,
  );
  const isVision = isVisualProcessTool(name);
  const mediaPath = isVision
    ? firstToolDisplayValue(input.media_path, input.image_path, input.path, input.image, input.file)
    : '';
  const visionMode = isVision ? firstToolDisplayValue(input.mode, input.task_type) : '';
  return {
    task: task ? String(task) : '',
    role: role ? String(role) : '',
    systemPrompt: systemPrompt ? String(systemPrompt) : '',
    mediaPath: mediaPath ? String(mediaPath) : '',
    visionMode: visionMode ? String(visionMode) : '',
    isVision,
  };
}

function buildToolView(item) {
  const name = normalizeToolName(item.toolName);
  const path = firstToolPath(item);
  if (isProcessTool(item, name)) {
    const output = toolDisplayOutput(item);
    const streamLines = buildToolStreamLines(item);
    const streamAnswerText = buildToolStreamAnswerText(item);
    const finalText = extractProcessResultText(item);
    const chatMeta = extractProcessChatMeta(item, name);
    return {
      mode: 'process',
      label: item.category === 'subagent'
        ? (item.label || item.toolName || 'Sub-agent')
        : (item.label || toolActionLabel(item)),
      requestJson: toolJsonText(item.toolInput),
      streamLines,
      streamAnswerText,
      progressEvents: Array.isArray(item.progressEvents) ? item.progressEvents : [],
      finalText,
      defaultOpen: false,
      task: chatMeta.task,
      role: chatMeta.role,
      systemPrompt: chatMeta.systemPrompt,
      mediaPath: chatMeta.mediaPath,
      visionMode: chatMeta.visionMode,
      isVision: chatMeta.isVision,
      isRunning: (item.status || '') === 'running',
    };
  }
  if (TOOL_DIFF_NAMES.has(name)) {
    const diff = getToolDiff(item);
    const { added, removed } = toolLineDelta(item, diff);
    const failed = isToolFailure(item);
    const target = path || item.label || name;
    if (failed) {
      const response = toolPlainObject(item.toolResponse);
      const error = toolPlainObject(response.error);
      const failureText = compactToolValue(error.message || response.summary || item.outputSummary || item.message, TOOL_BLOCK_LIMIT);
      const failureTarget = path ? ` ${path}` : '';
      return {
        mode: 'diff',
        label: `${toolFailureActionLabel(item)}${failureTarget}`,
        body: failureText || outputJsonText(item.toolResponse) || compactToolValue(item.toolOutput, TOOL_BLOCK_LIMIT),
      };
    }
    return {
      mode: 'diff',
      label: `${toolActionLabel(item)} ${target}${added || removed ? ` (+${added} -${removed})` : ' (no changes)'}`,
      body: diff ? compactToolText(diff) : '',
    };
  }
  if (TOOL_CHANGE_NAMES.has(name)) {
    const output = toolDisplayOutput(item);
    const jsonPayload = compactToolJsonPayload(
      item.toolInput || undefined,
      output,
    );
    return {
      mode: 'json',
      label: [toolActionLabel(item), path].filter(Boolean).join(' ') || item.label,
      requestJson: toolJsonText(item.toolInput),
      responseJson: outputJsonText(output),
      body: (jsonPayload.input || jsonPayload.output) ? stableJson(jsonPayload) : '',
    };
  }
  if (TOOL_READ_NAMES.has(name)) {
    return {
      mode: 'read',
      label: [toolActionLabel(item), path].filter(Boolean).join(' ') || item.label,
      body: '',
    };
  }
  if (TOOL_SHELL_NAMES.has(name)) {
    const response = toolPlainObject(item.toolResponse);
    const subject = toolPlainObject(response.subject);
    const artifacts = toolPlainObject(response.artifacts);
    const data = toolPlainObject(response.data);
    const diagnostics = toolPlainObject(artifacts.diagnostics);
    const error = toolPlainObject(response.error);
    const input = toolPlainObject(item.toolInput);
    const command = subject.command || input.command || input.cmd || '';
    const cwd = subject.cwd || input.working_dir || '';
    const output = extractTerminalOutput(item, response, artifacts, data);
    const stderr = firstToolDisplayValue(artifacts.stderr, data.stderr);
    const fallback = firstToolDisplayValue(error.message, response.summary, item.outputSummary);
    const exitCode = firstToolDisplayValue(error.exit_code, data.exit_code, diagnostics.exit_code);
    return {
      mode: 'terminal',
      label: command ? `${toolActionLabel(item)} ${command}` : toolActionLabel(item),
      command,
      cwd,
      requestJson: toolJsonText(item.toolInput),
      responseJson: outputJsonText(response),
      stdout: output || command ? (output ? tailToolOutput(output) : compactToolValue(fallback, 1200)) : '',
      stderr: stderr ? tailToolOutput(stderr) : '',
      exitCode,
      running: item.status === 'running' || item.status === 'pending',
      defaultOpen: false,
    };
  }
  const output = toolDisplayOutput(item);
  const jsonPayload = compactToolJsonPayload(
    item.toolInput || undefined,
    output,
  );
  return {
    mode: 'json',
    label: item.label || item.toolName || 'Tool',
    requestJson: toolJsonText(item.toolInput),
    responseJson: outputJsonText(output),
    body: (jsonPayload.input || jsonPayload.output) ? stableJson(jsonPayload) : '',
  };
}

function ChatTimelineToolBody({ view }) {
  if (view.mode === 'terminal') {
    const hasTerminalContent = Boolean(view.command || view.stdout || view.stderr || view.running);
    return (
      <>
        {hasTerminalContent ? (
          <div className="chat-terminal-frame">
            <div className="chat-terminal-bar">
              <span className="chat-terminal-dots" aria-hidden="true"><span /><span /><span /></span>
              {view.cwd ? <span className="chat-terminal-cwd">{view.cwd}</span> : null}
              {view.running || (view.exitCode !== undefined && view.exitCode !== '') ? (
                <span className={`chat-terminal-state ${view.running ? 'running' : ''}`}>
                  {view.running ? 'running' : `exit ${view.exitCode}`}
                </span>
              ) : null}
            </div>
            {view.command ? (
              <div className="chat-terminal-command">
                <span className="chat-terminal-prompt">$</span>
                <span>{view.command}</span>
              </div>
            ) : null}
            {view.stdout ? <pre className="chat-terminal-output">{view.stdout}</pre> : null}
            {view.stderr ? <pre className="chat-terminal-output stderr">{view.stderr}</pre> : null}
            {view.running && !view.stdout && !view.stderr ? (
              <div className="chat-terminal-waiting">Waiting for output<span className="chat-terminal-cursor" aria-hidden="true" /></div>
            ) : null}
          </div>
        ) : null}
        {!hasTerminalContent ? <ChatJsonPair requestJson={view.requestJson} responseJson={view.responseJson} /> : null}
      </>
    );
  }
  if (view.mode === 'process') {
    return <ChatProcessConversation view={view} />;
  }
  if (view.mode === 'diff') {
    if (!view.body) return null;
    return (
      <pre className="chat-timeline-tool-code diff">
        {view.body.split('\n').map((line, index) => {
          const kind = line.startsWith('+') && !line.startsWith('+++')
            ? 'add'
            : line.startsWith('-') && !line.startsWith('---')
              ? 'remove'
              : line.startsWith('@@')
                ? 'hunk'
                : 'context';
          return <span key={index} className={`chat-tool-diff-line ${kind}`}>{line || ' '}</span>;
        })}
      </pre>
    );
  }
  if (view.mode === 'json') {
    return <ChatJsonPair requestJson={view.requestJson} responseJson={view.responseJson || view.body} />;
  }
  return null;
}

const CHAT_TODO_COLLAPSED_COMPLETED_LIMIT = 2;

function ChatTodoPanel({ todos = [], streaming = false }) {
  const safeTodos = Array.isArray(todos) ? todos : [];
  const [showAllCompleted, setShowAllCompleted] = React.useState(false);
  if (!safeTodos.length) return null;

  // 渲染顺序：in_progress 最前 → pending 居中 → completed 最后。
  // 不动原数组，按 status 分组聚合即可。
  const inProgress = safeTodos.filter((t) => t.status === 'in_progress');
  const pending = safeTodos.filter((t) => t.status === 'pending');
  const completed = safeTodos.filter((t) => t.status === 'completed');

  const visibleCompleted = showAllCompleted
    ? completed
    : completed.slice(-CHAT_TODO_COLLAPSED_COMPLETED_LIMIT);
  const hiddenCount = completed.length - visibleCompleted.length;

  return (
    <div className={`chat-todo-panel ${streaming ? 'streaming' : 'done'}`} role="list">
      {inProgress.map((todo, index) => (
        <ChatTodoRow key={`ip-${index}`} todo={todo} streaming={streaming} />
      ))}
      {pending.map((todo, index) => (
        <ChatTodoRow key={`pe-${index}`} todo={todo} streaming={streaming} />
      ))}
      {visibleCompleted.map((todo, index) => (
        <ChatTodoRow key={`co-${index}`} todo={todo} streaming={streaming} />
      ))}
      {hiddenCount > 0 ? (
        <button
          type="button"
          className="chat-todo-expand"
          onClick={() => setShowAllCompleted(true)}
        >
          … +{hiddenCount} completed
        </button>
      ) : null}
    </div>
  );
}

function ChatTodoRow({ todo, streaming = false }) {
  const status = todo.status || 'pending';
  // 已完成、或本轮非 streaming 状态的 in_progress 项不要再继续转 spinner。
  // 只有"任务还在 running 时的 in_progress 项"才显示真正的旋转动画。
  const showLiveSpinner = status === 'in_progress' && streaming;
  return (
    <div className={`chat-todo-item status-${status}`} role="listitem">
      <ChatTodoStatusIcon status={status} live={showLiveSpinner} />
      <span className="chat-todo-content">{todo.content}</span>
    </div>
  );
}

function ChatTodoStatusIcon({ status, live = false }) {
  if (status === 'completed') {
    return (
      <span className="chat-todo-icon completed" aria-label="completed">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 8.5 L6.8 11.7 L12.5 5" />
        </svg>
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="chat-todo-icon in-progress" aria-label="in progress">
        <span className={`chat-todo-spinner ${live ? 'live' : ''}`} />
      </span>
    );
  }
  return <span className="chat-todo-icon pending" aria-label="pending" />;
}

function ChatJsonBlock({ text, compact = false }) {
  if (!text) return null;
  return (
    <pre className={`chat-json-block ${compact ? 'compact' : ''}`}>
      {text}
    </pre>
  );
}

function ChatJsonPair({ requestJson, responseJson }) {
  if (!requestJson && !responseJson) return null;
  const segments = [];
  if (requestJson) segments.push({ id: 'request', label: 'Request', text: requestJson });
  if (responseJson) segments.push({ id: 'response', label: 'Response', text: responseJson });
  const defaultId = responseJson ? 'response' : 'request';
  const [activeId, setActiveId] = React.useState(defaultId);
  const active = segments.find((seg) => seg.id === activeId) || segments[0];
  if (!active) return null;
  return (
    <div className="chat-json-card">
      {segments.length > 1 ? (
        <div className="chat-json-segments" role="tablist">
          {segments.map((seg) => (
            <button
              key={seg.id}
              type="button"
              role="tab"
              aria-selected={seg.id === active.id}
              className={`chat-json-segment ${seg.id === active.id ? 'is-active' : ''}`}
              onClick={() => setActiveId(seg.id)}
            >
              {seg.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="chat-json-card-head">
          <span className="chat-json-card-title">{active.label}</span>
        </div>
      )}
      <pre className="chat-json-card-body">{active.text}</pre>
    </div>
  );
}

function chatProcessFileName(path) {
  if (!path) return '';
  const segments = String(path).split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || path;
}

function ChatImsgCollapsible({ children, maxHeight = 360 }) {
  const bodyRef = React.useRef(null);
  const [expanded, setExpanded] = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);
  React.useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return undefined;
    const check = () => {
      const overflow = el.scrollHeight > el.clientHeight + 2;
      setOverflows((prev) => (prev === overflow ? prev : overflow));
    };
    check();
    const ro = (typeof ResizeObserver !== 'undefined') ? new ResizeObserver(check) : null;
    if (ro) ro.observe(el);
    return () => { if (ro) ro.disconnect(); };
  }, [children, expanded]);
  const showToggle = overflows || expanded;
  return (
    <div className={`chat-imsg-collapsible ${expanded ? 'is-expanded' : ''} ${overflows && !expanded ? 'is-collapsed' : ''}`}>
      <div
        ref={bodyRef}
        className="chat-imsg-collapsible-body"
        style={expanded ? null : { maxHeight: `${maxHeight}px` }}
      >
        {children}
      </div>
      {showToggle ? (
        <button
          type="button"
          className="chat-imsg-show-toggle"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Collapse' : 'View All'}
        </button>
      ) : null}
    </div>
  );
}

function ChatProcessConversation({ view }) {
  const hasPrompt = Boolean(view.task || view.role || view.systemPrompt || view.mediaPath);
  const streamAnswerText = String(view.streamAnswerText || '');
  const hasStreamAnswer = Boolean(streamAnswerText.trim());
  const hasStream = Array.isArray(view.streamLines) && view.streamLines.length > 0;
  const subTimelineItems = buildSubAgentTimelineItems(view);
  const hasSubTimeline = subTimelineItems.length > 0;
  const hasFinal = Boolean(view.finalText);
  if (!hasPrompt && !hasSubTimeline && !hasStreamAnswer && !hasStream && !hasFinal && !view.requestJson) {
    return null;
  }
  const fileName = chatProcessFileName(view.mediaPath);
  const fields = [];
  if (view.role) fields.push({ label: 'Role', value: view.role });
  if (view.systemPrompt) fields.push({ label: 'System Prompt', value: view.systemPrompt, multiline: true, markdown: true });
  if (view.task) fields.push({ label: 'Task', value: view.task, multiline: true, markdown: true });
  const renderSubContent = () => {
    if (hasFinal) {
      const inner = view.isVision
        ? <div className="chat-imsg-plain">{view.finalText}</div>
        : <window.Markdown source={view.finalText} />;
      return <ChatImsgCollapsible maxHeight={360}>{inner}</ChatImsgCollapsible>;
    }
    if (hasSubTimeline) {
      return (
        <ChatImsgCollapsible maxHeight={420}>
          <div className="chat-imsg-subtimeline">
            <ChatAgentTimeline items={subTimelineItems} streaming={view.isRunning} />
          </div>
        </ChatImsgCollapsible>
      );
    }
    if (hasStreamAnswer || hasStream) {
      return (
        <ChatImsgCollapsible maxHeight={360}>
          {hasStreamAnswer ? (
            <div className="chat-imsg-stream-answer">
              <span className="chat-imsg-stream-answer-body">{streamAnswerText}</span>
              {view.isRunning ? <span className="chat-imsg-cursor" aria-hidden="true" /> : null}
            </div>
          ) : null}
          {hasStream ? (
            <div className="chat-imsg-stream-activity" aria-label="Sub-agent activity">
              {view.streamLines.map((row) => (
                <div key={row.id} className={`chat-imsg-stream-line ${row.state || ''}`}>
                  {row.text}
                </div>
              ))}
            </div>
          ) : null}
          {!hasStreamAnswer && view.isRunning ? <span className="chat-imsg-cursor" aria-hidden="true" /> : null}
        </ChatImsgCollapsible>
      );
    }
    return (
      <span className="chat-imsg-thinking">
        <span className="chat-imsg-dot" />
        <span className="chat-imsg-dot" />
        <span className="chat-imsg-dot" />
      </span>
    );
  };
  const showSub = hasSubTimeline || hasStreamAnswer || hasStream || hasFinal || view.isRunning;
  const subState = hasFinal ? 'final' : ((hasSubTimeline || hasStreamAnswer || hasStream) ? 'stream' : 'thinking');
  return (
    <div className="chat-imsg">
      {hasPrompt ? (
        <div className="chat-imsg-row from-main">
          <div className="chat-imsg-bubble main">
            {view.mediaPath ? (
              <div className="chat-imsg-attachment" title={view.mediaPath}>
                <span className="chat-imsg-attachment-icon ico ico-image-describe" aria-hidden="true" />
                <span className="chat-imsg-attachment-name">{fileName}</span>
                {view.visionMode ? (
                  <span className="chat-imsg-attachment-mode">{view.visionMode}</span>
                ) : null}
              </div>
            ) : null}
            {fields.length > 0 ? (
              <div className="chat-imsg-fields">
                {fields.map((field) => (
                  <div key={field.label} className={`chat-imsg-field ${field.multiline ? 'is-multiline' : ''}`}>
                    <div className="chat-imsg-field-label">{field.label}</div>
                    <div className={`chat-imsg-field-value ${field.markdown ? 'is-md' : ''}`}>
                      {field.markdown ? <window.Markdown source={String(field.value || '')} /> : field.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showSub ? (
        <div className="chat-imsg-row from-sub">
          <div className={`chat-imsg-bubble sub ${subState} ${hasSubTimeline ? 'timeline' : ''}`}>
            {renderSubContent()}
          </div>
        </div>
      ) : null}

      {!hasPrompt && !showSub && view.requestJson ? (
        <ChatJsonBlock text={view.requestJson} compact />
      ) : null}
    </div>
  );
}

function ChatTimelineToolNode({ item }) {
  const status = item.status || 'pending';
  const category = item.category || 'tool';
  const defaultIconClass = CATEGORY_ICON_CLASS[category] || CATEGORY_ICON_CLASS.tool;
  // 先按 toolName 匹配专属 icon；匹配不到再退回 skill/mcp/subagent 分类图标。
  const iconClass = resolveToolIconClass(item.toolName, defaultIconClass);
  const categoryLabel = CATEGORY_LABEL[category] || 'Tool';
  const view = buildToolView(item);
  const [open, setOpen] = React.useState(Boolean(view.defaultOpen));
  const fallbackLines = view.mode === 'read'
    ? []
    : [item.inputSummary, item.outputSummary].filter(Boolean).slice(0, 2);
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
  const hasBody = Boolean(view.body)
    || Boolean(view.command)
    || Boolean(view.stdout)
    || Boolean(view.stderr)
    || Boolean(view.requestJson)
    || Boolean(view.responseJson)
    || (Array.isArray(view.streamLines) && view.streamLines.length > 0)
    || Boolean(view.finalText)
    || fallbackLines.length > 0
    || hasChildren;
  return (
    <div className={`chat-timeline-tool category-${category} status-${status} mode-${view.mode}`}>
      <button
        type="button"
        className="chat-timeline-tool-head"
        onClick={() => hasBody && setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!hasBody}
      >
        <span className={`chat-timeline-status status-${status}`} aria-hidden="true" />
        <span className={`ico ${iconClass}`} aria-label={categoryLabel} role="img" />
        <span className="chat-timeline-tool-name">{view.label}</span>
        {hasBody ? (
          <ChatTimelineChevron open={open} />
        ) : null}
      </button>
      {open && hasBody ? (
        <div className="chat-timeline-tool-body">
          {view.mode !== 'read' ? <ChatTimelineToolBody view={view} /> : null}
          {view.mode === 'read' && fallbackLines.map((line, index) => (
            <div key={index} className="chat-timeline-tool-line">{line}</div>
          ))}
          {hasChildren ? (
            <div className="chat-timeline-tool-children">
              {item.children.map((child) => (
                <ChatTimelineToolNode key={child.id} item={child} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Collapsed view of a run of consecutive tool calls. Looks like a regular
// tool chip (same .chat-timeline-tool-head border / pill) but the label is a
// verb-counted summary like "read 3 files · executed 2 commands · used
// chrome devtools 11 tools". Click expands to the original per-tool chips.
function ChatTimelineToolGroup({ item }) {
  const [open, setOpen] = React.useState(false);
  const status = item.status || 'done';
  const tools = Array.isArray(item.tools) ? item.tools : [];
  const summary = item.summary || `used ${tools.length} tools`;
  // 当 bucket > 3 时 summary 已被裁成 "...+N more"；full 是未裁的完整摘要，
  // 挂在 title 上鼠标 hover 看全。
  const fullSummary = item.summaryFull || summary;
  return (
    <div className={`chat-timeline-tool category-tool status-${status} is-group`}>
      <button
        type="button"
        className="chat-timeline-tool-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title={fullSummary !== summary ? fullSummary : undefined}
      >
        <span className={`chat-timeline-status status-${status}`} aria-hidden="true" />
        <span className="ico ico-tool" aria-label="Tools" role="img" />
        <span className="chat-timeline-tool-name">{summary}</span>
        <span className="chat-timeline-tool-group-count">{tools.length}</span>
        <ChatTimelineChevron open={open} />
      </button>
      {open ? (
        <div className="chat-timeline-tool-group-body">
          {tools.map((tool) => (
            <ChatTimelineToolNode key={tool.id} item={tool} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChatTimelineMetaNode({ item }) {
  const isContextCompaction = String(item.summary || '').toLowerCase() === 'auto-compacting context';
  return (
    <div className={`chat-timeline-meta status-${item.status || 'done'} ${isContextCompaction ? 'is-compaction' : ''}`}>
      <button
        type="button"
        className="chat-timeline-meta-head"
        aria-expanded="false"
        disabled
      >
        <span className={`chat-timeline-status status-${item.status || 'done'}`} aria-hidden="true" />
        {isContextCompaction ? <span className="chat-timeline-compaction-icon" aria-hidden="true" /> : null}
        <span className="chat-timeline-meta-label">{item.summary || 'Thinking…'}</span>
      </button>
    </div>
  );
}

function ChatTimelineThinkingNode({ item }) {
  const [open, setOpen] = React.useState(false);
  const text = String(item.text || '');
  const hasText = text.trim().length > 0;
  const charCount = text.length;
  return (
    <div className={`chat-timeline-thinking status-${item.status || 'done'} ${item.streaming ? 'streaming' : ''}`}>
      <button
        type="button"
        className="chat-timeline-thinking-head"
        onClick={() => hasText && setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!hasText}
      >
        <span className={`chat-timeline-status status-${item.status || 'done'}`} aria-hidden="true" />
        <span className="ico ico-thinking" aria-label="Thinking" role="img" />
        {hasText ? (
          <span className="chat-timeline-thinking-count">{charCount} chars</span>
        ) : null}
        <ChatTimelineChevron open={open} />
      </button>
      {open && hasText ? (
        <div className="chat-timeline-thinking-body">{text}</div>
      ) : null}
    </div>
  );
}

function ChatAgentTimeline({ items = [], streaming = false, latestTodos = null }) {
  const safeItems = Array.isArray(items) ? items : [];
  const todos = Array.isArray(latestTodos) && latestTodos.length > 0 ? latestTodos : null;
  // Empty timeline + done + no todos = nothing to show.
  // Empty timeline + streaming = activity indicator carries the "alive" hint.
  // Has todos = always show the panel even if there are no other items.
  if (!safeItems.length && !streaming && !todos) return null;
  return (
    <div className={`chat-timeline ${streaming ? 'streaming' : 'done'}`}>
      {safeItems.map((item) => {
        if (item.kind === 'text') {
          return (
            <div key={item.id} className={`chat-timeline-text ${item.streaming ? 'streaming' : ''}`}>
              <span className="chat-timeline-text-body">{item.text}</span>
              {item.streaming ? <span className="chat-timeline-text-cursor" aria-hidden="true" /> : null}
            </div>
          );
        }
        if (item.kind === 'tool') {
          return <ChatTimelineToolNode key={item.id} item={item} />;
        }
        if (item.kind === 'tool_group') {
          return <ChatTimelineToolGroup key={item.id} item={item} />;
        }
        if (item.kind === 'thinking') {
          return <ChatTimelineThinkingNode key={item.id} item={item} />;
        }
        if (item.kind === 'meta') {
          return <ChatTimelineMetaNode key={item.id} item={item} />;
        }
        return null;
      })}
      {streaming ? (
        <div className="chat-timeline-activity" aria-label="Agent activity">
          <span className="chat-timeline-spark" aria-hidden="true">*</span>
          <span className="chat-timeline-verb" aria-hidden="true" />
        </div>
      ) : null}
      {todos ? <ChatTodoPanel todos={todos} streaming={streaming} /> : null}
    </div>
  );
}

function ChatTimelineCollapsed({ onExpand, label = 'Trace', expanded = false }) {
  return (
    <button type="button" className="chat-timeline-collapsed" onClick={onExpand}>
      <ChatTimelineChevron open={expanded} />
      <span className="chat-timeline-collapsed-text">{label}</span>
    </button>
  );
}

function ChatMessageRow({ message, now, onPreviewImage }) {
  const timeline = Array.isArray(message.traceTimeline) ? message.traceTimeline : [];
  const hasTimeline = timeline.length > 0;
  const isAgent = message.role === 'agent';
  // While streaming: keep the timeline expanded so users see the live thinking + tools.
  // When the task is done: collapse it behind a one-liner; clicking reveals the trace.
  const [traceExpanded, setTraceExpanded] = React.useState(false);
  // Streaming 时即使 timeline 还没积累任何事件，也要渲染 ChatAgentTimeline，
  // 让黄色 `* Reasoning…` 活动指示器出来——否则刚发出消息那几百毫秒 bubble
  // 是完全空白的，用户以为前端卡了。
  const showTimelineExpanded = isAgent && (message.streaming || (hasTimeline && traceExpanded));
  const showTimelineCollapsed = isAgent && !message.streaming && hasTimeline;
  const isUser = message.role === 'user';
  const [copied, setCopied] = React.useState(false);
  const copyTimerRef = React.useRef(null);
  const nowMs = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  const elapsed = isAgent
    ? formatElapsedDuration(message.createdAt, message.completedAt || (message.streaming ? nowMs : null))
    : '';
  const messageClock = formatMessageClock(isAgent ? (message.completedAt || message.createdAt) : message.createdAt);
  const timelineText = isAgent
    ? timeline.filter((item) => item.kind === 'text').map((item) => item.text || '').join('\n').trim()
    : '';
  const copyText = String(message.text || timelineText || '').trim();

  React.useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  async function handleCopy() {
    if (!copyText) return;
    const ok = await copyTextToClipboard(copyText);
    if (!ok) return;
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 1200);
  }

  const messageImages = Array.isArray(message.images)
    ? message.images.filter((img) => img && (img.previewUrl || img.path))
    : [];

  return (
    <div className={`chat-message-row ${message.role}`}>
      {messageImages.length > 0 && (
        <div className="chat-message-images" aria-label="Attached images">
          {messageImages.map((img, idx) => (
            <div key={img.image_id || `${idx}`} className="chat-message-image">
              <button
                type="button"
                className="chat-message-image-button"
                onClick={() => onPreviewImage?.({
                  src: img.previewUrl || img.path,
                  title: img.name || img.path || 'Attached image',
                })}
                aria-label="Preview attached image"
              >
                {img.previewUrl ? (
                  <img src={img.previewUrl} alt="" draggable={false} />
                ) : (
                  <span className="chat-message-image-fallback" aria-hidden="true">▦</span>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={`chat-bubble ${message.status || ''}`}>
        <div className="chat-bubble-meta">
          <span className="chat-bubble-meta-main">
            <span
              className={`chat-bubble-avatar ${isUser ? 'ico-user-avatar' : 'ico-assistant-avatar'}`}
              aria-hidden="true"
            />
            <span>{isUser ? 'You' : 'Assistant'}</span>
          </span>
        </div>
        {showTimelineCollapsed ? (
          <>
            <ChatTimelineCollapsed
              onExpand={() => setTraceExpanded((value) => !value)}
              label={elapsed || 'Trace'}
              expanded={traceExpanded}
            />
            {traceExpanded ? (
              <ChatAgentTimeline
                items={timeline}
                streaming={false}
                latestTodos={message.traceLatestTodos || null}
              />
            ) : null}
          </>
        ) : null}
        {showTimelineExpanded && !showTimelineCollapsed ? (
          <ChatAgentTimeline
            items={timeline}
            streaming={message.streaming}
            latestTodos={message.traceLatestTodos || null}
          />
        ) : null}
        {message.text ? (
          <div className="chat-bubble-text">
            {!message.streaming && window.Markdown
              ? <window.Markdown source={message.text || ''} />
              : <span className="chat-stream-text">{message.text || ''}</span>}
          </div>
        ) : null}
      </div>
      {(messageClock || copyText) ? (
        <div className="chat-message-actions">
          {messageClock ? <span className="chat-bubble-clock">{messageClock}</span> : null}
          {copyText ? (
            <PortalTooltip text={copied ? 'Copied' : 'Copy'} position="above">
              <button
                type="button"
                className={`chat-bubble-copy ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                aria-label={copied ? 'Copied' : 'Copy message'}
              >
                <span className="ico-copy-message" aria-hidden="true" />
              </button>
            </PortalTooltip>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ImagePreviewOverlay({ image, onClose }) {
  const [scale, setScale] = React.useState(1);
  const src = image?.src || '';
  const title = image?.title || 'image';

  React.useEffect(() => {
    if (!image) return undefined;
    setScale(1);
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [image, onClose]);

  if (!image || !src) return null;

  function adjustScale(delta) {
    setScale((value) => Math.max(0.25, Math.min(3, Number((value + delta).toFixed(2)))));
  }

  function downloadImage() {
    const link = document.createElement('a');
    link.href = src;
    link.download = String(title).split('/').pop() || 'image';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <div
      className="image-preview-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="image-preview-toolbar" aria-label="Image preview actions">
        <button type="button" className="image-preview-action" onClick={downloadImage} aria-label="Download image">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v10" />
            <path d="m7 9 5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
        </button>
        <button type="button" className="image-preview-action image-preview-close" onClick={onClose} aria-label="Close preview">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <div className="image-preview-stage">
        <img
          src={src}
          alt=""
          draggable={false}
          style={{ transform: `scale(${scale})` }}
        />
      </div>
      <div className="image-preview-zoom" aria-label="Image zoom controls">
        <button type="button" onClick={() => adjustScale(-0.1)} aria-label="Zoom out">-</button>
        <span>{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => adjustScale(0.1)} aria-label="Zoom in">+</button>
      </div>
    </div>
  );
}

const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const CHAT_IMAGE_MAX_COUNT = 4;
const CHAT_IMAGE_ACCEPTED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
]);

function ChatPanel({
  conversationId,
  messages = [],
  running = false,
  disabled = false,
  onSend,
  onStop,
  onSelectFile,
  onClearFile,
  onUploadImage,
  attachment,
  uploading,
  contextUsage,
  workspacePath,
  homePath,
  activeTaskText,
  now,
  modelOptions,
  defaultModelId,
  modelLoading = false,
}) {
  const resolvedOptions = Array.isArray(modelOptions) ? modelOptions : MODEL_OPTIONS;
  const resolvedDefaultModelId = defaultModelId || resolvedOptions[0]?.id || 'gpt-5.5';
  const [draft, setDraft] = React.useState('');
  const [modelId, setModelId] = React.useState(resolvedDefaultModelId);
  const [reasoningEffort, setReasoningEffort] = React.useState(DEFAULT_REASONING_EFFORT);
  const [composerImages, setComposerImages] = React.useState([]);
  const [previewImage, setPreviewImage] = React.useState(null);
  const closeImagePreview = React.useCallback(() => setPreviewImage(null), []);
  const composerImagesRef = React.useRef([]);
  React.useEffect(() => { composerImagesRef.current = composerImages; }, [composerImages]);

  // Clean up blob URLs + reset draft images when switching conversations.
  React.useEffect(() => {
    return () => {
      composerImagesRef.current.forEach((img) => {
        if (img.previewUrl) URL.revokeObjectURL(img.previewUrl);
      });
    };
  }, [conversationId]);
  React.useEffect(() => {
    setComposerImages([]);
  }, [conversationId]);

  async function attachImageFile(file) {
    if (!file) return;
    if (!CHAT_IMAGE_ACCEPTED_MIME.has((file.type || '').toLowerCase())) {
      console.warn('Unsupported image type', file.type);
      return;
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      const draft = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: '',
        uploading: false,
        error: `File too large (>${Math.round(CHAT_IMAGE_MAX_BYTES / 1024 / 1024)}MB)`,
      };
      setComposerImages((prev) => [...prev, draft]);
      return;
    }
    if (composerImagesRef.current.length >= CHAT_IMAGE_MAX_COUNT) {
      console.warn(`Image limit reached (${CHAT_IMAGE_MAX_COUNT})`);
      return;
    }

    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = URL.createObjectURL(file);
    setComposerImages((prev) => [...prev, { id, file, previewUrl, uploading: true }]);

    try {
      const result = await onUploadImage?.(file);
      if (!result || !result.image_id) {
        throw new Error('Upload response missing image_id');
      }
      setComposerImages((prev) => prev.map((img) =>
        img.id === id
          ? { ...img, uploading: false, imageId: result.image_id, path: result.path, mime: result.mime, sizeBytes: result.size_bytes }
          : img,
      ));
    } catch (error) {
      console.error('Chat image upload failed', error);
      setComposerImages((prev) => prev.map((img) =>
        img.id === id ? { ...img, uploading: false, error: String(error?.message || error) } : img,
      ));
    }
  }

  function removeComposerImage(id) {
    setComposerImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((img) => img.id !== id);
    });
  }

  function handleComposerPaste(event) {
    const items = Array.from(event.clipboardData?.items || []);
    const imageFiles = items
      .filter((it) => it.kind === 'file' && (it.type || '').toLowerCase().startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter(Boolean);

    if (imageFiles.length === 0) {
      // Fall through to existing path-paste behavior.
      handlePathPaste(event, draft, setDraft, workspacePath, homePath, 5000);
      return;
    }
    event.preventDefault();
    imageFiles.forEach((file) => attachImageFile(file));
  }

  function handleComposerDrop(event) {
    const files = Array.from(event.dataTransfer?.files || [])
      .filter((file) => (file.type || '').toLowerCase().startsWith('image/'));
    if (!files.length) return;
    event.preventDefault();
    files.forEach((file) => attachImageFile(file));
  }

  function handleComposerDragOver(event) {
    if (Array.from(event.dataTransfer?.items || []).some((it) => it.kind === 'file')) {
      event.preventDefault();
    }
  }

  const imagesUploading = composerImages.some((img) => img.uploading);
  const openImagePreview = React.useCallback((image) => {
    const src = image?.src || image?.previewUrl || image?.path || '';
    if (!src) return;
    setPreviewImage({
      src,
      title: image?.title || image?.name || image?.path || 'image',
    });
  }, []);

  React.useEffect(() => {
    if (!resolvedOptions.find((o) => o.id === modelId)) {
      setModelId(resolvedDefaultModelId);
    }
  }, [resolvedOptions, resolvedDefaultModelId]);
  const listRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const suppressSubmitUntilRef = React.useRef(0);
  const shouldAutoScrollRef = React.useRef(true);
  const lastMessageCountRef = React.useRef(messages.length);
  const lastConversationIdRef = React.useRef(conversationId || null);
  const usedTokens = Math.max(0, Math.round(Number(contextUsage?.usedTokens) || 0));
  const totalTokens = Math.max(1, Math.round(Number(contextUsage?.totalTokens) || 128000));
  const contextRatio = Math.max(0, Math.min(1, Number(contextUsage?.ratio) || (usedTokens / totalTokens)));
  const visibleContextRatio = usedTokens > 0 ? Math.max(contextRatio, 0.01) : 0;
  const contextTooltip = formatContextUsageLabel(usedTokens, totalTokens);
  const contextRingStyle = {
    '--context-used': `${visibleContextRatio * 100}%`,
  };

  function isMessageListNearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 48;
  }

  function handleMessageListScroll(event) {
    shouldAutoScrollRef.current = isMessageListNearBottom(event.currentTarget);
  }

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const normalizedConversationId = conversationId || null;
    if (normalizedConversationId !== lastConversationIdRef.current || messages.length < lastMessageCountRef.current) {
      shouldAutoScrollRef.current = true;
    }
    lastConversationIdRef.current = normalizedConversationId;
    lastMessageCountRef.current = messages.length;
    if (!shouldAutoScrollRef.current) return;
    requestAnimationFrame(() => {
      if (listRef.current) {
        listRef.current.scrollTop = listRef.current.scrollHeight;
      }
    });
  }, [conversationId, messages, running]);

  React.useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [draft]);

  function restoreActiveTaskText() {
    const text = String(activeTaskText || '').trim();
    if (!text) return;
    setDraft(text);
    requestAnimationFrame(() => {
      inputRef.current?.focus?.();
      inputRef.current?.setSelectionRange?.(text.length, text.length);
    });
  }

  function stopAndRestore() {
    onStop?.();
    restoreActiveTaskText();
  }

  function handleStopPress(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    suppressSubmitUntilRef.current = Date.now() + 700;
    stopAndRestore();
  }

  function handleStopKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    handleStopPress(event);
  }

  React.useEffect(() => {
    if (!running) return undefined;
    function handleEscape(event) {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      stopAndRestore();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [running, activeTaskText, onStop]);

  function submit(e) {
    e?.preventDefault();
    if (Date.now() < suppressSubmitUntilRef.current) return;
    const text = draft.trim();
    if (!text || disabled) return;
    // Block while any pasted image is still uploading.
    if (imagesUploading) return;
    if (modelLoading || !resolvedOptions.some((o) => o.id === modelId)) return;
    const readyImages = composerImages
      .filter((img) => img.imageId && !img.error)
      .map((img) => ({
        image_id: img.imageId,
        path: img.path,
        mime: img.mime,
        previewUrl: img.previewUrl || null,
      }));
    onSend?.(text, attachment, modelId, reasoningEffort, readyImages);
    setDraft('');
    onClearFile?.();
    // Ownership of the blob URLs transfers to the rendered chat message; the
    // unmount cleanup at the conversationId boundary will revoke them. Do NOT
    // revoke here, or the just-sent thumbnail goes blank.
    setComposerImages([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  function pickFile() {
    if (disabled) return;
    fileRef.current?.click();
  }

  function clearFile(e) {
    e.stopPropagation();
    onClearFile?.();
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <section className="chat-workspace" aria-label="Chat">
      <div ref={listRef} className="chat-message-list" onScroll={handleMessageListScroll}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-illustration" aria-hidden="true">
              <div className="chat-empty-card chat-empty-card-primary">
                <img src="/assets/ui/empty-state/penguin-relax-card.png" alt="" />
              </div>
              <div className="chat-empty-card chat-empty-card-secondary">
                <img src="/assets/ui/empty-state/penguin-sleepy-card.png" alt="" />
              </div>
            </div>
            <div className="chat-empty-title">What's on your mind?</div>
            <div className="chat-empty-copy">Drop a task, a question, or a loose idea. I'll take it from there.</div>
          </div>
        ) : messages.map((message) => (
          <ChatMessageRow key={message.id} message={message} now={now} onPreviewImage={openImagePreview} />
        ))}
      </div>
      <form
        className="chat-composer"
        onSubmit={submit}
        onDragOver={handleComposerDragOver}
        onDrop={handleComposerDrop}
      >
        {(composerImages.length > 0 || attachment) && (
          <div className="chat-composer-attachments" aria-label="Attachments">
            {attachment && (
              <AttachmentFileChip attachment={attachment} uploading={uploading} onClear={clearFile} />
            )}
            {composerImages.length > 0 && (
              <div className="chat-composer-images" aria-label="Pasted images">
                {composerImages.map((img) => (
                  <PortalTooltip
                    key={img.id}
                    text={img.error || (img.uploading ? 'Uploading...' : (img.file?.name || 'image'))}
                    position="above"
                  >
                    <div
                      className={`chat-composer-image-chip ${img.uploading ? 'is-uploading' : ''} ${img.error ? 'has-error' : ''}`}
                    >
                      <button
                        type="button"
                        className="chat-composer-image-preview-button"
                        onClick={() => openImagePreview({
                          src: img.previewUrl || img.path,
                          title: img.file?.name || img.path || 'Pasted image',
                        })}
                        disabled={!img.previewUrl && !img.path}
                        aria-label="Preview pasted image"
                      >
                        {img.previewUrl ? (
                          <img src={img.previewUrl} alt="" draggable={false} />
                        ) : (
                          <span className="chat-composer-image-fallback" aria-hidden="true">!</span>
                        )}
                      </button>
                      {img.uploading && <span className="chat-composer-image-spinner" aria-hidden="true" />}
                      <button
                        type="button"
                        className="chat-composer-image-remove"
                        onClick={() => removeComposerImage(img.id)}
                        aria-label="Remove image"
                      >×</button>
                    </div>
                  </PortalTooltip>
                ))}
              </div>
            )}
          </div>
        )}
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={handleComposerPaste}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && running && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.stopPropagation();
              stopAndRestore();
              return;
            }
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit(event);
            }
          }}
          placeholder={running ? 'Assistant is currently processing...' : 'Ask, draft, or delegate...'}
          disabled={disabled}
          maxLength={5000}
        />
        <div className="chat-composer-actions">
          <div className="chat-composer-tools">
            <PortalTooltip text="Attach File" position="above">
              <button
                type="button"
                className="chat-tool-btn chat-tool-attach icon-only"
                onClick={pickFile}
                disabled={disabled}
                aria-label="Attach File"
              >
                <span className="ico ico-attach" aria-hidden="true" />
              </button>
            </PortalTooltip>
            <input
              ref={fileRef}
              type="file"
              className="td-file-input"
              onChange={e => {
                const nextFile = e.target.files?.[0] || null;
                if (!nextFile) return;
                onSelectFile?.(nextFile);
            }}
          />
            <ApprovalModePicker />
          </div>
          <div className="chat-composer-submit">
            <PortalTooltip text={contextTooltip} position="above">
              <button
                type="button"
                className={`context-usage-btn icon-only ${contextUsage?.compressed ? 'compressed' : ''}`}
                aria-label={contextTooltip}
                aria-disabled="true"
              >
                <span className="context-usage-icon" style={contextRingStyle} aria-hidden="true" />
              </button>
            </PortalTooltip>
            <ModelPicker
              value={modelId}
              reasoningEffort={reasoningEffort}
              options={resolvedOptions}
              onChange={setModelId}
              onReasoningChange={setReasoningEffort}
              disabled={disabled}
              loading={modelLoading}
            />
            {running ? (
              <button type="button" className="chat-send stop" onMouseDown={handleStopPress} onKeyDown={handleStopKey} aria-label="Stop">
                <span className="ico ico-stop" aria-hidden="true" />
              </button>
            ) : (
              <button type="submit" className="chat-send" disabled={disabled || !draft.trim()} aria-label="Send">
                <span className="ico ico-deploy" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </form>
      <ImagePreviewOverlay image={previewImage} onClose={closeImagePreview} />
    </section>
  );
}
window.ChatPanel = ChatPanel;

const NAV_ICONS = {
  dashboard: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7"/>
      <rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  agents: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  ),
  tasks: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6"/>
      <line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/>
      <line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/>
      <line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  reports: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="20" x2="18" y2="10"/>
      <line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  system: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
};

const NAV_TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'agents',    label: 'Agents'    },
  { id: 'tasks',     label: 'Tasks'     },
  { id: 'reports',   label: 'Reports'   },
  { id: 'system',    label: 'System'    },
];
window.NAV_TABS = NAV_TABS;

function BottomNav({ active, onChange }) {
  return (
    <div className="app-bottomnav">
      {NAV_TABS.map(tab => (
        <button key={tab.id} type="button"
                className={`nav-item ${active === tab.id ? 'active' : ''}`}
                onClick={() => onChange(tab.id)}>
          <span className="nav-icon">{NAV_ICONS[tab.id]}</span>
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
window.BottomNav = BottomNav;

function MapViewport({ children, overlay, MAP_W, MAP_H, onViewChange }) {
  const wrapRef = React.useRef(null);
  const [view, setView] = React.useState({ scale: 1, tx: 0, ty: 0, fit: 1 });
  const [dragging, setDragging] = React.useState(false);
  const dragStartRef = React.useRef(null);
  // MAP_ANCHOR: which point on the map (0-1) to pin
  // VIEW_ANCHOR_X: fraction of safeW; VIEW_ANCHOR_Y_PX: fixed px from wrap top
  const HOME_ZOOM_MULTIPLIER = 1.66;
  const MAP_ANCHOR_X = 0.281;
  const MAP_ANCHOR_Y = 0.418;
  const VIEW_ANCHOR_X = 0.098;
  const VIEW_ANCHOR_Y_PX = 212;

  const computeHomeView = React.useCallback(() => {
    const el = wrapRef.current;
    if (!el) return null;
    const vw = el.clientWidth, vh = el.clientHeight;
    if (!vw || !vh) return null;
    const insetX = 20;
    const insetTop = 18;
    const insetBottom = 220;
    const safeW = Math.max(1, vw - insetX * 2);
    const safeH = Math.max(1, vh - insetTop - insetBottom);
    const fitScale = Math.min(safeW / MAP_W, safeH / MAP_H);
    const scale = fitScale * HOME_ZOOM_MULTIPLIER;
    const tx = (insetX + safeW * VIEW_ANCHOR_X) - MAP_ANCHOR_X * MAP_W * scale;
    // VIEW_ANCHOR_Y_PX = (MAP_ANCHOR_Y * MAP_H - NPC_SIZE + NPC_FOOT_OFFSET) * scale + ty
    const ty = VIEW_ANCHOR_Y_PX - (MAP_ANCHOR_Y * MAP_H - 98) * scale;

    return { scale, fit: fitScale, tx, ty };
  }, [HOME_ZOOM_MULTIPLIER, MAP_ANCHOR_X, MAP_ANCHOR_Y, VIEW_ANCHOR_X, VIEW_ANCHOR_Y_PX, MAP_H, MAP_W]);

  const fit = React.useCallback(() => {
    const homeView = computeHomeView();
    if (homeView) setView(homeView);
  }, [computeHomeView]);

  React.useEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || !onViewChange) return;
    onViewChange({
      ...view,
      viewportWidth: el.clientWidth,
      viewportHeight: el.clientHeight,
    });
  }, [onViewChange, view]);

  function zoomAt(cx, cy, factor) {
    setView(v => {
      const newScale = Math.max(0.3, Math.min(3, v.scale * factor));
      const k = newScale / v.scale;
      return { ...v, scale: newScale, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
    });
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.1 : 1/1.1);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    try { wrapRef.current.setPointerCapture?.(e.pointerId); } catch (err) {}
  }
  function onPointerMove(e) {
    if (!dragging) return;
    const s = dragStartRef.current;
    setView(v => ({ ...v, tx: s.tx + (e.clientX - s.x), ty: s.ty + (e.clientY - s.y) }));
  }
  function onPointerUp(e) {
    setDragging(false);
    try { wrapRef.current.releasePointerCapture?.(e.pointerId); } catch (err) {}
  }

  const pct = Math.round((view.scale / Math.max(0.0001, view.fit)) * 100);

  return (
    <div className="map-viewport">
      <div className="map-screen-frame">
        <div ref={wrapRef}
             className={`map-stage-wrap ${dragging ? 'dragging' : ''}`}
             onWheel={onWheel}
             onPointerDown={onPointerDown}
             onPointerMove={onPointerMove}
             onPointerUp={onPointerUp}>
          <div className="map-stage"
               style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})` }}>
            {children}
          </div>
        </div>
      </div>
      <div className="zoom-controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomAt(wrapRef.current.clientWidth/2, wrapRef.current.clientHeight/2, 1.2)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomAt(wrapRef.current.clientWidth/2, wrapRef.current.clientHeight/2, 1/1.2)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button type="button" aria-label="Fit to view" onClick={fit}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 3 21 3 21 9"/>
            <polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>
        <div className="zoom-readout">{pct}%</div>
      </div>
      {overlay}
    </div>
  );
}
window.MapViewport = MapViewport;

function TabPlaceholder({ name }) {
  return (
    <div className="tab-placeholder">
      <div className="ph-title">{name.toUpperCase()}</div>
      <div className="ph-sub">Coming soon</div>
    </div>
  );
}
window.TabPlaceholder = TabPlaceholder;
