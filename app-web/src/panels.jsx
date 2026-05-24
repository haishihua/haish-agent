// New layout: top bar, left task records, right live feed,
// bottom task delegation overlay, bottom navigation, map viewport with zoom.

function PortalTooltip({ text, position = 'below', multiline = false, children }) {
  const [visible, setVisible] = React.useState(false);
  const [coords, setCoords] = React.useState(null);
  const triggerRef = React.useRef(null);

  const computeCoords = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({
      x: r.left + r.width / 2,
      y: position === 'above' ? r.top - 8 : r.bottom + 8,
    });
  }, [position]);

  React.useEffect(() => {
    if (!visible) return undefined;
    computeCoords();
    const onScroll = () => computeCoords();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [visible, computeCoords]);

  const child = React.Children.only(children);
  const enhanced = React.cloneElement(child, {
    ref: triggerRef,
    onMouseEnter: (e) => { setVisible(true); child.props.onMouseEnter && child.props.onMouseEnter(e); },
    onMouseLeave: (e) => { setVisible(false); child.props.onMouseLeave && child.props.onMouseLeave(e); },
    onFocus: (e) => { setVisible(true); child.props.onFocus && child.props.onFocus(e); },
    onBlur: (e) => { setVisible(false); child.props.onBlur && child.props.onBlur(e); },
  });

  const portalNode = (visible && coords && text)
    ? ReactDOM.createPortal(
        <div
          className={`portal-tooltip portal-tooltip-${position}${multiline ? ' is-multiline' : ''}`}
          style={{ left: coords.x, top: coords.y }}
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

function TopBar({ now, viewMode = 'world', onToggleViewMode, calibrationActive = false, calibrationDisabled = false, onToggleCalibration }) {
  const chatMode = viewMode === 'chat';
  return (
    <div className="app-topbar">
      <div className="topbar-brand">
        <div className="topbar-logo" />
        <div className="topbar-title">HAISH AGENT</div>
      </div>
      <div className="topbar-actions">
        <button type="button" className="topbar-icon" title="Network">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
            <line x1="12" y1="20" x2="12.01" y2="20"/>
          </svg>
        </button>
        <button
          type="button"
          className={`topbar-icon topbar-mode-toggle ${chatMode ? 'active' : ''}`}
          title={chatMode ? 'Agent World Mode' : 'Chat Mode'}
          aria-label={chatMode ? 'Switch to Agent World Mode' : 'Switch to Chat Mode'}
          aria-pressed={chatMode}
          onClick={onToggleViewMode}
        >
          <span className={`ico ${chatMode ? 'ico-robot' : 'ico-bubble-chat'}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={`topbar-icon ${calibrationActive ? 'active' : ''}`}
          title={calibrationActive ? 'Exit calibration' : 'Settings'}
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
        <div className="trc-title" title={quest.title || ''}>{formatTaskCardTitle(quest.title)}</div>
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
      <button
        type="button"
        className={`filter-pill icon-only ${open ? 'open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Filter: ${current.label}`}
        data-tooltip={current.label}
        data-tooltip-pos="below"
      >
        <span className="ico ico-task-filter" aria-hidden="true" />
      </button>
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

function ConversationAction({ label, icon, onClick, disabled = false }) {
  return (
    <button
      type="button"
      className="conversation-icon-btn"
      title={label}
      aria-label={label}
      onClick={(event) => { event.stopPropagation(); onClick?.(); }}
      disabled={disabled}
    >
      <span className={`ico ico-${icon}`} aria-hidden="true" />
    </button>
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
    return <span className="conversation-task-status-icon cancelled"><span className="ico ico-close" aria-hidden="true" /></span>;
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
          <div className="conversation-task-title" title={task.title || ''}>{task.title || 'Untitled task'}</div>
        </div>
        {hasReport && (
          <button
            type="button"
            className="conversation-report-btn"
            title="View report"
            aria-label="View report"
            data-tooltip="View report"
            data-tooltip-pos="above"
            onClick={(event) => { event.stopPropagation(); onOpenReport?.(task); }}
          >
            <span className="ico ico-report" aria-hidden="true" />
          </button>
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

function ConversationNode({
  project,
  conversation,
  active,
  now,
  onSelectConversation,
  onToggleConversation,
  onToggleConversationTasks,
  onRequestDeleteConversation,
  onRequestRenameConversation,
  onOpenTaskReport,
}) {
  const tasks = conversation.tasks || [];
  const visibleTasks = conversation.tasksExpanded ? tasks.slice().reverse() : tasks.slice(-5).reverse();
  const hiddenCount = Math.max(0, tasks.length - 5);

  return (
    <div className={`conversation-node ${active ? 'active' : ''}`}>
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
          <span className={`ico ${conversation.expanded ? 'ico-comment-alt-dots' : 'ico-mobile-message'}`} aria-hidden="true" />
        </button>
        <span className="conversation-name" title={conversation.name || ''}>{conversation.name}</span>
        <span className="conversation-actions">
          <ConversationAction label="Rename conversation" icon="pen-field" onClick={() => onRequestRenameConversation(project, conversation)} />
          <ConversationAction label="Delete conversation" icon="trash" onClick={() => onRequestDeleteConversation(project, conversation)} />
        </span>
      </div>

      {conversation.expanded && (
        <div className="conversation-task-list">
          {tasks.length === 0 ? (
            <div className="conversation-empty">No tasks yet.</div>
          ) : (
            visibleTasks.map((task) => <TaskRecordCompact key={task.taskId || task.id} task={task} now={now} onOpenReport={onOpenTaskReport} />)
          )}
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

function ProjectNode({
  project,
  workspaceState,
  now,
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
}) {
  const isActiveProject = workspaceState.activeProjectId === project.id;

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
        <span className="project-name" title={project.workspacePath || project.name}>{project.name}</span>
        <span className="conversation-actions">
          {project.removable && <ConversationAction label="Remove project" icon="trash" onClick={() => onRemoveProject(project)} />}
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
              now={now}
              onSelectConversation={onSelectConversation}
              onToggleConversation={onToggleConversation}
              onToggleConversationTasks={onToggleConversationTasks}
              onRequestDeleteConversation={onRequestDeleteConversation}
              onRequestRenameConversation={onRequestRenameConversation}
              onOpenTaskReport={onOpenTaskReport}
            />
          ))}
          <button
            type="button"
            className="conversation-add-row"
            onClick={() => onAddConversation(project.id)}
          >
            <span className="ico ico-multiple" aria-hidden="true" />
            New Conversation
          </button>
        </div>
      )}
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
}) {
  const [panelRef, panelWidth] = usePanelWidth();
  const [dialog, setDialog] = React.useState(null);

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
        <div className="title">CONVERSATIONS</div>
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
            onSelectProject={onSelectProject}
            onToggleProject={onToggleProject}
            onRemoveProject={requestRemoveProject}
            onAddConversation={onAddConversation}
            onSelectConversation={onSelectConversation}
            onToggleConversation={onToggleConversation}
            onToggleConversationTasks={onToggleConversationTasks}
            onRequestDeleteConversation={requestDeleteConversation}
            onRequestRenameConversation={requestRenameConversation}
            onOpenTaskReport={onOpenTaskReport}
          />
        ))}
      </div>
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
    return <span className="live-activity-icon cancelled"><span className="ico ico-close" aria-hidden="true" /></span>;
  }
  return <span className="live-activity-icon pending"><span className="ico ico-loading" aria-hidden="true" /></span>;
}

function LiveActivityRow({ entry }) {
  return (
    <div className={`live-activity-row status-${normalizeLiveStatus(entry.status)}`}>
      <LiveActivityStatusIcon status={entry.status} />
      <div className="live-activity-copy">
        <div
          className="live-activity-desc"
          title={entry.description || ''}
          data-tooltip={entry.description || ''}
          data-tooltip-pos="above"
        >
          {entry.description || entry.tag || 'Working'}
        </div>
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
        <div className="title">LIVE FEED</div>
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

const MODEL_OPTIONS = [
  { id: 'deepseek-ai/DeepSeek-V3.2', label: 'deepseek-v3.2' },
  { id: 'openAi/gpt-5.5', label: 'gpt5.5' },
  { id: 'anthropic/opus4.7', label: 'opus4.7' },
  { id: 'deepseek-ai/DeepSeek-V4-Flash', label: 'deepseek-v4-flash' },
  { id: 'Pro/moonshotai/Kimi-K2.6', label: 'kimi-k2.6' },
  { id: 'Pro/zai-org/GLM-5.1', label: 'glm-5.1' },
  { id: 'Pro/MiniMaxAI/MiniMax-M2.5', label: 'MiniMax-M2.5' },
];

// 按 provider 分组的模型清单。后端 /api/llm/provider 探测当前生效 provider，
// 前端按 key 选对应清单；拿不到或未登记的统一兜底到 openai 桶（也就是目前
// 的硅基流动那套）。
const PROVIDER_MODEL_CATALOG = {
  openai: {
    options: MODEL_OPTIONS,
    defaultModelId: 'deepseek-ai/DeepSeek-V3.2',
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
  if (provider && PROVIDER_MODEL_CATALOG[provider]) return PROVIDER_MODEL_CATALOG[provider];
  return PROVIDER_MODEL_CATALOG.openai;
}

window.resolveModelCatalog = resolveModelCatalog;

const DEFAULT_REASONING_EFFORT = 'high';
const REASONING_EFFORT_OPTIONS = [
  { id: 'low', label: 'low' },
  { id: 'medium', label: 'medium' },
  { id: 'high', label: 'high' },
  { id: 'xhigh', label: 'xhigh' },
];

function ModelPicker({ value, reasoningEffort, options, reasoningOptions = REASONING_EFFORT_OPTIONS, onChange, onReasoningChange, disabled, loading = false }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const current = options.find((o) => o.id === value) || options[0];
  const currentReasoning = reasoningOptions.find((o) => o.id === reasoningEffort) || reasoningOptions.find((o) => o.id === DEFAULT_REASONING_EFFORT) || reasoningOptions[0];

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
      <button
        type="button"
        className="model-picker-trigger"
        onClick={() => { if (!disabled && !loading) setOpen((o) => !o); }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select model"
        title={loading ? 'Loading provider models...' : `${currentReasoning ? currentReasoning.id : ''} · ${current ? current.id : ''}`}
      >
        <span className="model-picker-value">{currentReasoning ? currentReasoning.label : ''} · {current ? current.label : ''}</span>
        <span className={loading ? 'model-picker-loading' : 'model-picker-caret'} aria-hidden="true" />
      </button>
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
              <span className="model-picker-option-label">{current ? current.label : ''}</span>
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
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function joinWorkspacePath(workspacePath, relativePath) {
  const base = String(workspacePath || '').trim().replace(/\/+$/, '');
  const rel = String(relativePath || '').trim().replace(/^\.?\//, '');
  if (!base || !rel) return rel;
  return `${base}/${rel}`;
}

function normalizePastedPathLine(line, workspacePath, forceAbsolute = false) {
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
  if (isAbsolutePathLike(text)) return text;
  if (forceAbsolute || text.startsWith('./') || text.startsWith('../') || text.includes('/')) {
    return joinWorkspacePath(workspacePath, text);
  }
  return text;
}

function normalizePastedPathText(text, workspacePath) {
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
  const normalized = lines.map((line) => normalizePastedPathLine(line, workspacePath)).join('\n');
  return normalized === raw ? '' : normalized;
}

function clipboardFilesToPathText(files, workspacePath) {
  return Array.from(files || [])
    .map((file) => {
      const rawPath = file?.path || file?.webkitRelativePath || file?.name || '';
      return normalizePastedPathLine(rawPath, workspacePath, true);
    })
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

function handlePathPaste(event, currentValue, setValue, workspacePath, maxLength = 500) {
  const clipboard = event.clipboardData;
  if (!clipboard) return;
  const fileText = clipboardFilesToPathText(clipboard.files, workspacePath);
  const plainText = clipboard.getData('text/plain');
  const normalizedText = fileText || normalizePastedPathText(plainText, workspacePath);
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

function formatContextPercent(value, usedTokens) {
  const percent = Math.max(0, Number(value) || 0) * 100;
  if (!usedTokens || percent === 0) return '0';
  if (percent < 0.1) return '<0.1';
  if (percent < 10) return percent.toFixed(1).replace(/\.0$/, '');
  return String(Math.round(percent));
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

function TaskDelegation({ onDeploy, onStop, onSelectFile, onClearFile, attachment, uploading, running, disabled, contextUsage, workspacePath, activeTaskText, modelOptions, defaultModelId, modelLoading = false }) {
  const resolvedOptions = (Array.isArray(modelOptions) && modelOptions.length > 0) ? modelOptions : MODEL_OPTIONS;
  const resolvedDefaultModelId = defaultModelId || 'Pro/zai-org/GLM-5.1';
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
  const usedTokens = Math.max(0, Math.round(Number(contextUsage?.usedTokens) || 0));
  const totalTokens = Math.max(1, Math.round(Number(contextUsage?.totalTokens) || 128000));
  const contextRatio = Math.max(0, Math.min(1, Number(contextUsage?.ratio) || (usedTokens / totalTokens)));
  const contextPercent = formatContextPercent(contextRatio, usedTokens);
  const visibleContextRatio = usedTokens > 0 ? Math.max(contextRatio, 0.01) : 0;
  const contextTooltip = [
    `Context: ${contextPercent}% used`,
    `Used ${formatContextTokens(usedTokens)} tokens of ${formatContextTokens(totalTokens)}`,
    'Context will be compressed automatically when full',
  ].join('\n');
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
    if (!v.trim() || disabled) return;
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
          TASK DELEGATION
        </div>
      </div>
      <div className="td-input-row">
        <textarea
          ref={taRef}
          rows={1}
          value={v}
          onChange={e => setV(e.target.value)}
          onPaste={e => handlePathPaste(e, v, setV, workspacePath, 500)}
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
          maxLength={500}
        />
        <div className="char-count">{v.length} / 500</div>
      </div>
      <div className="td-actions">
        <div className="td-tools">
          <button
            type="button"
            className="td-btn td-btn-attach icon-only"
            onClick={pickFile}
            disabled={disabled}
            aria-label="Attach File"
            data-tooltip="Attach File"
            data-tooltip-pos="above"
          >
            <span className="ico ico-attach" aria-hidden="true" />
          </button>
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
          {attachment && (
            <div className={`td-file-chip ${uploading ? 'uploading' : attachment.uploaded ? 'ready' : ''}`} title={attachment.name}>
              <span className="name">{attachment.name}</span>
              {uploading ? <span className="td-upload-spinner" aria-hidden="true" /> : null}
              <span className="status">{uploading ? 'Processing' : attachment.uploaded ? 'Uploaded' : 'Pending'}</span>
              <button type="button" className="x" onClick={clearFile} aria-label="Remove file" disabled={uploading}>×</button>
            </div>
          )}
          <ModelPicker
            value={modelId}
            reasoningEffort={reasoningEffort}
            options={resolvedOptions}
            onChange={setModelId}
            onReasoningChange={setReasoningEffort}
            disabled={disabled}
            loading={modelLoading}
          />
        </div>
        <PortalTooltip text={contextTooltip} position="above" multiline>
          <button
            type="button"
            className={`context-usage-btn icon-only ${contextUsage?.compressed ? 'compressed' : ''}`}
            aria-label={contextTooltip}
            aria-disabled="true"
          >
            <span className="context-usage-icon" style={contextRingStyle} aria-hidden="true" />
          </button>
        </PortalTooltip>
        {running ? (
          <button
            type="button"
            className="deploy-btn stop icon-only"
            onClick={onStop}
            aria-label="Stop"
            data-tooltip="Stop"
            data-tooltip-pos="above"
          >
            <span className="ico ico-stop" aria-hidden="true" />
          </button>
        ) : (
          <button
            className="deploy-btn icon-only"
            onClick={submit}
            disabled={disabled || !v.trim()}
            aria-label="Deploy"
            data-tooltip="Deploy"
            data-tooltip-pos="above"
          >
            <span className="ico ico-deploy" aria-hidden="true" />
          </button>
        )}
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
  if (name.includes('rag') || name.includes('knowledge') || name.includes('retrieve')
      || name.includes('vector') || name.includes('embed')) {
    return 'ico-rag';
  }
  if (name.includes('memory') || name.includes('remember') || name.includes('recall')) {
    return 'ico-memory';
  }
  if (name.includes('weather') || name.includes('forecast') || name.includes('temperature')) {
    return 'ico-weather';
  }
  if (name.includes('write') || name.includes('edit_file') || name.includes('create_file')
      || name.includes('save_file') || name.includes('patch')) {
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

function ChatTimelineToolNode({ item }) {
  const [open, setOpen] = React.useState(false);
  const status = item.status || 'pending';
  const category = item.category || 'tool';
  const defaultIconClass = CATEGORY_ICON_CLASS[category] || CATEGORY_ICON_CLASS.tool;
  // skill/mcp/subagent 三个分类的图标固定，不被工具名覆盖；
  // 普通 tool 才看工具名挑专属 icon（如 web_search → 地球）。
  const iconClass = category === 'tool'
    ? resolveToolIconClass(item.toolName, defaultIconClass)
    : defaultIconClass;
  const categoryLabel = CATEGORY_LABEL[category] || 'Tool';
  const hasInput = Boolean(item.inputSummary);
  const hasOutput = Boolean(item.outputSummary);
  const hasChildren = Array.isArray(item.children) && item.children.length > 0;
  const hasBody = hasInput || hasOutput || hasChildren;
  const bodyLines = [item.inputSummary, item.outputSummary].filter(Boolean).slice(0, 2);
  return (
    <div className={`chat-timeline-tool category-${category} status-${status}`}>
      <button
        type="button"
        className="chat-timeline-tool-head"
        onClick={() => hasBody && setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!hasBody}
      >
        <span className={`chat-timeline-status status-${status}`} aria-hidden="true" />
        <span className={`ico ${iconClass}`} aria-label={categoryLabel} role="img" />
        <span className="chat-timeline-tool-name">{item.label}</span>
        {hasBody ? (
          <ChatTimelineChevron open={open} />
        ) : null}
      </button>
      {open && hasBody ? (
        <div className="chat-timeline-tool-body">
          {bodyLines.map((line, index) => (
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

function ChatTimelineMetaNode({ item }) {
  const [open, setOpen] = React.useState(false);
  const details = Array.isArray(item.details) ? item.details : [];
  const hasDetails = details.length > 0;
  return (
    <div className={`chat-timeline-meta status-${item.status || 'done'}`}>
      <button
        type="button"
        className="chat-timeline-meta-head"
        onClick={() => hasDetails && setOpen((value) => !value)}
        aria-expanded={open}
        disabled={!hasDetails}
      >
        <ChatTimelineChevron open={open} />
        <span className="chat-timeline-meta-label">{item.summary || 'Thinking…'}</span>
        {hasDetails ? (
          <span className="chat-timeline-meta-count">{details.length}</span>
        ) : null}
      </button>
      {open && hasDetails ? (
        <ul className="chat-timeline-meta-body">
          {details.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : null}
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

function ChatAgentTimeline({ items = [], streaming = false }) {
  const safeItems = Array.isArray(items) ? items : [];
  // Empty timeline + done = nothing to show, exit early.
  // Empty timeline + streaming = still in-flight, keep the activity indicator visible
  // so the user knows the task is alive (no "Preparing…" placeholder needed).
  if (!safeItems.length && !streaming) return null;
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

function ChatMessageRow({ message, now }) {
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

  return (
    <div className={`chat-message-row ${message.role}`}>
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
            {traceExpanded ? <ChatAgentTimeline items={timeline} streaming={false} /> : null}
          </>
        ) : null}
        {showTimelineExpanded && !showTimelineCollapsed ? (
          <ChatAgentTimeline items={timeline} streaming={message.streaming} />
        ) : null}
        {message.text ? (
          <div className="chat-bubble-text">
            {!message.streaming && window.Markdown
              ? <window.Markdown source={message.text || ''} />
              : <span className="chat-stream-text">{message.text || ''}</span>}
          </div>
        ) : null}
        {(messageClock || copyText) ? (
          <div className="chat-bubble-footer">
            {messageClock ? <span className="chat-bubble-clock">{messageClock}</span> : null}
            {copyText ? (
              <button
                type="button"
                className={`chat-bubble-copy ${copied ? 'copied' : ''}`}
                onClick={handleCopy}
                aria-label={copied ? 'Copied' : 'Copy message'}
                title={copied ? 'Copied' : 'Copy'}
              >
                <span className="ico-copy-message" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChatPanel({
  messages = [],
  running = false,
  disabled = false,
  onSend,
  onStop,
  onSelectFile,
  onClearFile,
  attachment,
  uploading,
  contextUsage,
  workspacePath,
  activeTaskText,
  now,
  modelOptions,
  defaultModelId,
  modelLoading = false,
}) {
  const resolvedOptions = (Array.isArray(modelOptions) && modelOptions.length > 0) ? modelOptions : MODEL_OPTIONS;
  const resolvedDefaultModelId = defaultModelId || 'Pro/zai-org/GLM-5.1';
  const [draft, setDraft] = React.useState('');
  const [modelId, setModelId] = React.useState(resolvedDefaultModelId);
  const [reasoningEffort, setReasoningEffort] = React.useState(DEFAULT_REASONING_EFFORT);

  React.useEffect(() => {
    if (!resolvedOptions.find((o) => o.id === modelId)) {
      setModelId(resolvedDefaultModelId);
    }
  }, [resolvedOptions, resolvedDefaultModelId]);
  const listRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const fileRef = React.useRef(null);
  const usedTokens = Math.max(0, Math.round(Number(contextUsage?.usedTokens) || 0));
  const totalTokens = Math.max(1, Math.round(Number(contextUsage?.totalTokens) || 128000));
  const contextRatio = Math.max(0, Math.min(1, Number(contextUsage?.ratio) || (usedTokens / totalTokens)));
  const contextPercent = formatContextPercent(contextRatio, usedTokens);
  const visibleContextRatio = usedTokens > 0 ? Math.max(contextRatio, 0.01) : 0;
  const contextTooltip = [
    `Context: ${contextPercent}% used`,
    `Used ${formatContextTokens(usedTokens)} tokens of ${formatContextTokens(totalTokens)}`,
    'Context will be compressed automatically when full',
  ].join('\n');
  const contextRingStyle = {
    '--context-used': `${visibleContextRatio * 100}%`,
  };

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, running]);

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
    const text = draft.trim();
    if (!text || disabled) return;
    onSend?.(text, attachment, modelId, reasoningEffort);
    setDraft('');
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
    <section className="chat-workspace" aria-label="Chat">
      <div ref={listRef} className="chat-message-list">
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
          <ChatMessageRow key={message.id} message={message} now={now} />
        ))}
      </div>
      <form className="chat-composer" onSubmit={submit}>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPaste={(event) => handlePathPaste(event, draft, setDraft, workspacePath, 500)}
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
          placeholder={disabled ? 'Assistant is currently processing...' : 'Ask, draft, or delegate...'}
          disabled={disabled}
          maxLength={500}
        />
        <div className="chat-composer-actions">
          <div className="chat-composer-tools">
            <button
              type="button"
              className="chat-tool-btn chat-tool-attach icon-only"
              onClick={pickFile}
              disabled={disabled}
              aria-label="Attach File"
              data-tooltip="Attach File"
              data-tooltip-pos="above"
            >
              <span className="ico ico-attach" aria-hidden="true" />
            </button>
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
            {attachment && (
              <div className={`td-file-chip ${uploading ? 'uploading' : attachment.uploaded ? 'ready' : ''}`} title={attachment.name}>
                <span className="name">{attachment.name}</span>
                {uploading ? <span className="td-upload-spinner" aria-hidden="true" /> : null}
                <span className="status">{uploading ? 'Processing' : attachment.uploaded ? 'Uploaded' : 'Pending'}</span>
                <button type="button" className="x" onClick={clearFile} aria-label="Remove file" disabled={uploading}>×</button>
              </div>
            )}
            <ModelPicker
              value={modelId}
              reasoningEffort={reasoningEffort}
              options={resolvedOptions}
              onChange={setModelId}
              onReasoningChange={setReasoningEffort}
              disabled={disabled}
              loading={modelLoading}
            />
          </div>
          <div className="chat-composer-submit">
            <PortalTooltip text={contextTooltip} position="above" multiline>
              <button
                type="button"
                className={`context-usage-btn icon-only ${contextUsage?.compressed ? 'compressed' : ''}`}
                aria-label={contextTooltip}
                aria-disabled="true"
              >
                <span className="context-usage-icon" style={contextRingStyle} aria-hidden="true" />
              </button>
            </PortalTooltip>
            {running ? (
              <button type="button" className="chat-send stop" onClick={onStop} aria-label="Stop">
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
