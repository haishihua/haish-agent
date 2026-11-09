import React from 'react';
import { Search, SquarePen, X } from 'lucide-react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import { LoadingState } from '../../../shared/ui/agent-elements/LoadingState.jsx';
import { AppIcon } from '../../../shared/ui/AppIcon.jsx';
import { ConversationAction, ConversationPinAction, ApprovalGlyph, WaitingInputGlyph } from './ConversationIcons.jsx';
import { useConversationRunState } from '../hooks/useConversationRunState.js';
import { resolveConversationStatusMark } from '../model/conversation-run-state.js';
import { RUN_STATE_APPROVAL, RUN_STATE_RUNNING, RUN_STATE_WAITING_INPUT } from '../../../core/run-status.js';
import { isTaskLive } from '../../../core/run-status.js';
import { ACTIVITY_PAGE_SIZE, activityEntries, filterActivityEntries } from '../model/activity.js';
import { newEntryLabel } from '../model/new-entry.js';
import { terminalTaskNoticeStatus } from '../../../core/task-completion-notices.js';

function ActivityStatus({ entry, mode, terminalStatus }) {
  const runState = useConversationRunState({ conversationId: entry.conversation.id, tasks: entry.conversation.tasks });
  const taskLive = mode === 'bot' && isTaskLive(entry.task);
  const relevantRunState = mode === 'chat' || (taskLive && (!runState.taskId || runState.taskId === entry.taskId))
    ? runState.state : taskLive ? RUN_STATE_RUNNING : '';
  const mark = resolveConversationStatusMark({ runState: relevantRunState, terminalStatus });
  if (mark?.kind === RUN_STATE_APPROVAL || mark?.kind === RUN_STATE_WAITING_INPUT) {
    const approval = mark.kind === RUN_STATE_APPROVAL;
    const Glyph = approval ? ApprovalGlyph : WaitingInputGlyph;
    return <span className={`conversation-running-indicator ${approval ? 'awaiting-approval' : 'waiting-input'}`}
      role="status" aria-label={approval ? 'Awaiting approval' : 'Waiting for your answer'}><Glyph /></span>;
  }
  if (mark?.kind === RUN_STATE_RUNNING) return <span className="conversation-running-indicator" role="status" aria-label="Task running"><span className="ico ico-loading" aria-hidden="true" /></span>;
  return mark?.status ? <span className={`conversation-terminal-notice chat-timeline-status status-${mark.status}`} aria-label={`Unread ${mark.status}`} /> : null;
}

function formatTime(timestamp) {
  return timestamp ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp) : '';
}

export function ActivityView({ projects, workspaceProjects, activeConversationId, activeTaskId, notices, terminalNotices = {}, taskTerminalNotices = {}, mode, onSelect, onPin, onDeleteConversation,
  onDeleteTask, onOpenReport, onNewEntry, isDraftSelected = false, loading, error }) {
  const [limit, setLimit] = React.useState(ACTIVITY_PAGE_SIZE);
  const [query, setQuery] = React.useState('');
  const entries = React.useMemo(() => activityEntries(loading ? null : projects, notices, mode, workspaceProjects, activeConversationId),
    [projects, notices, mode, workspaceProjects, activeConversationId, loading]);
  const filtered = React.useMemo(() => filterActivityEntries(entries, query, mode), [entries, query, mode]);
  const isActiveEntry = (entry) => (mode === 'chat'
    ? entry.conversation.id === activeConversationId
    : Boolean(activeTaskId && entry.taskId === activeTaskId));
  const activeIndex = filtered.findIndex(isActiveEntry);
  const visibleEntries = filtered.slice(0, limit);
  if (!query.trim() && activeIndex >= limit) visibleEntries.push(filtered[activeIndex]);
  const currentConversations = React.useMemo(() => new Map((workspaceProjects || []).flatMap((project) => (
    (project.conversations || []).map((conversation) => [conversation.id, conversation])
  ))), [workspaceProjects]);
  const searchLabel = mode === 'bot' ? 'Search tasks' : 'Search conversations';
  // 两种模式都要有「新建」入口：会话是 New Conversation，任务是 New Task——
  // 任务面板少了它就只能跑到项目树里点，跟会话模式的习惯不一致。
  return (
    <section className="activity-view" aria-label="Activity">
      <button type="button" className={`activity-new-entry${isDraftSelected ? ' active' : ''}`}
        aria-current={isDraftSelected ? 'page' : undefined} onClick={onNewEntry}>
        <SquarePen size={16} aria-hidden="true" /><span>{newEntryLabel(mode)}</span>
      </button>
      <div className="haish-thread-search">
        <div className="haish-search-field">
          <Search size={15} aria-hidden="true" />
          <input aria-label={searchLabel} placeholder={searchLabel} value={query}
            onChange={(event) => { setQuery(event.target.value); setLimit(ACTIVITY_PAGE_SIZE); }}
            onKeyDown={(event) => { if (event.key === 'Escape') setQuery(''); }} />
          {query ? <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} /></button> : null}
        </div>
      </div>
      {error ? <ErrorState variant="inline" detail="Could not refresh activity. Showing available history." /> : null}
      {!filtered.length ? (loading ? <div className="activity-loading" role="status"><LoadingState label="Loading activity…" /></div>
        : <p className="activity-message">{query.trim() ? 'No matching activity.' : 'No completed activity yet.'}</p>) : (
        <div className="activity-list">
          {visibleEntries.map((entry) => {
            const title = mode === 'bot' ? (entry.task.title || 'Untitled task') : (entry.conversation.name || 'Untitled conversation');
            const time = formatTime(entry.completedAt);
            const tooltip = (
              <span className="project-tooltip-content">
                <span className="project-tooltip-name">{title}</span>
                <span className="project-tooltip-path">{entry.project.name}</span>
                {time ? <span className="project-tooltip-meta">{time}</span> : null}
              </span>
            );
            const conversation = currentConversations.get(entry.conversation.id) || entry.conversation;
            const terminalStatus = terminalTaskNoticeStatus(mode === 'bot' ? taskTerminalNotices[entry.taskId] : terminalNotices[entry.conversation.id]);
            const active = isActiveEntry(entry);
            return (
              <div key={mode === 'bot' ? `${entry.conversation.id}:${entry.taskId}` : entry.conversation.id}
                className={`activity-row conversation-row${active ? ' active' : ''}`} role="button" tabIndex={0}
                aria-current={active ? 'true' : undefined} onClick={() => onSelect(entry)}
                onKeyDown={(event) => {
                  if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault(); onSelect(entry);
                  }
                }}>
                <PortalTooltip text={tooltip} position="below" multiline alwaysDelay>
                  <span className="conversation-name"><span className="conversation-name-static">{title}</span></span>
                </PortalTooltip>
                <ActivityStatus entry={entry} mode={mode} terminalStatus={terminalStatus} />
                <span className="conversation-actions">
                  {mode === 'chat' ? <>
                    <ConversationPinAction pinned={Boolean(conversation.pinned)} onClick={() => onPin?.(entry.project.id, conversation.id)} />
                    <ConversationAction label="Delete conversation" icon="trash" onClick={() => onDeleteConversation(entry.project, conversation)} />
                  </> : <>
                    <PortalTooltip text="View report" position="above">
                      <button type="button" className="conversation-icon-btn" aria-label="View report"
                        onClick={(event) => { event.stopPropagation(); onOpenReport(entry); }}>
                        <AppIcon name="report" size={15} />
                      </button>
                    </PortalTooltip>
                    <ConversationAction label="Delete task" icon="trash" onClick={() => onDeleteTask(entry.project, entry.conversation, entry.task)} />
                  </>}
                </span>
              </div>
            );
          })}
          {filtered.length > visibleEntries.length ? (
            <button type="button" className="conversation-show-more" onClick={() => setLimit((value) => value + ACTIVITY_PAGE_SIZE)}>Show more</button>
          ) : null}
        </div>
      )}
    </section>
  );
}
