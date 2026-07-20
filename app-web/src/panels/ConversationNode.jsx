// @haish-esm
import React from 'react';
import { PortalTooltip } from './PortalTooltip.jsx';
import { ConversationAction } from './ConversationIcons.jsx';
import { TaskRecordCompact } from './ConversationTaskCards.jsx';
import { conversationHasRunningTask } from './conversation-status.js';

export function ConversationNode({
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
  onPinConversation,
  onDragStartConversation,
  onDragOverConversation,
  onDropConversation,
  onDragEndConversation,
  onOpenTaskReport,
  onRetryTask,
}) {
  const tasks = conversation.tasks || [];
  const visibleLimit = Math.max(1, Number(taskPreviewLimit) || 5);
  const visibleTasks = conversation.tasksExpanded ? tasks.slice().reverse() : tasks.slice(-visibleLimit).reverse();
  const hiddenCount = Math.max(0, tasks.length - visibleLimit);
  const runningTask = conversationHasRunningTask(conversation);
  const showTaskList = conversation.expanded && tasks.length > 0;
  const isPinned = Boolean(conversation.pinned);

  const [dropPosition, setDropPosition] = React.useState(null);

  function handleDragStart(event) {
    event.dataTransfer.setData('text/plain', conversation.id);
    event.dataTransfer.effectAllowed = 'move';
    onDragStartConversation?.(project.id, conversation.id);
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const isAfter = (event.clientY - rect.top) > rect.height / 2;
    setDropPosition(isAfter ? 'after' : 'before');
    onDragOverConversation?.(project.id, conversation.id);
  }

  function handleDragLeave(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setDropPosition(null);
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const sourceId = event.dataTransfer.getData('text/plain');
    const position = dropPosition;
    setDropPosition(null);
    if (sourceId && sourceId !== conversation.id) {
      onDropConversation?.(project.id, sourceId, conversation.id, position);
    }
  }

  function handleDragEnd() {
    setDropPosition(null);
    onDragEndConversation?.();
  }

  return (
    <div className={`conversation-node ${active ? 'active' : ''} ${dropPosition ? `drag-over drag-over-${dropPosition}` : ''}`} ref={nodeRef}>
      <div
        role="button"
        tabIndex={0}
        className="conversation-row"
        draggable={true}
        title="Double-click to rename"
        onClick={() => onSelectConversation(project.id, conversation.id)}
        onDoubleClick={(event) => {
          // Rename via double-click on the row; ignore action buttons / expand toggle.
          if (event.target.closest?.('.conversation-actions, .conversation-session-toggle, .conversation-icon-btn')) return;
          event.preventDefault();
          event.stopPropagation();
          onRequestRenameConversation?.(project, conversation);
        }}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectConversation(project.id, conversation.id); }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
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
          <PortalTooltip text={isPinned ? 'Unpin conversation' : 'Pin conversation'} position="above">
            <button
              type="button"
              className={`conversation-icon-btn conversation-pin-toggle${isPinned ? ' pinned' : ''}`}
              aria-label={isPinned ? 'Unpin conversation' : 'Pin conversation'}
              onClick={(event) => { event.stopPropagation(); onPinConversation?.(project.id, conversation.id); }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 17v5"/>
                <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
              </svg>
            </button>
          </PortalTooltip>
          <ConversationAction label="Delete conversation" icon="trash" onClick={() => onRequestDeleteConversation(project, conversation)} />
        </span>
      </div>

      {showTaskList && (
        <div className="conversation-task-list">
          {visibleTasks.map((task) => <TaskRecordCompact key={task.taskId || task.id} task={task} now={now} onOpenReport={onOpenTaskReport} onRetry={onRetryTask} />)}
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
