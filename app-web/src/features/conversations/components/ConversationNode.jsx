import React from 'react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';
import { ApprovalGlyph, ConversationAction, WaitingInputGlyph } from './ConversationIcons.jsx';
import { TaskRecordCompact } from './ConversationTaskCards.jsx';
import {
  RUN_STATE_APPROVAL,
  RUN_STATE_RUNNING,
  RUN_STATE_WAITING_INPUT,
  isRunStateWaiting,
  resolveConversationStatusMark,
  taskIdOf,
} from '../model/conversation-run-state.js';
import { useConversationRunState } from '../hooks/useConversationRunState.js';
import { PREVIEW_PAGE_SIZE, nextExtraVisible } from '../model/list-preview.js';

// 两种「等用户动手」的状态灯：颜色由 `.conversation-running-indicator.waiting-input` /
// `.awaiting-approval` 给，图标与任务卡共用同一份 glyph（唯一来源）。
const WAIT_INDICATORS = {
  [RUN_STATE_WAITING_INPUT]: {
    className: 'waiting-input',
    label: 'Waiting for your answer',
    Glyph: WaitingInputGlyph,
  },
  [RUN_STATE_APPROVAL]: {
    className: 'awaiting-approval',
    label: 'Awaiting approval',
    Glyph: ApprovalGlyph,
  },
};

/**
 * 会话标题：不用悬停 tooltip 展示完整标题；
 * 标题超出容器宽度时自动轮播（marquee）滚动显示完整内容。
 * 非溢出状态渲染普通文本，溢出状态启用无缝循环动画。
 */
function ConversationMarqueeTitle({ name }) {
  const containerRef = React.useRef(null);
  const [marquee, setMarquee] = React.useState(false);
  const [seconds, setSeconds] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    let raf = 0;
    let timer = 0;
    const measure = () => {
      // 测量始终渲染的 .conversation-name-static：它自带 overflow:hidden +
      // ellipsis，其自身 scrollWidth 恒等于完整文本宽度（元素自身的溢出内容
      // 会计入自己的 scrollWidth）。不能量容器——容器在激活态下子元素各自
      // 裁剪/隐藏溢出，scrollWidth 会塌缩回 clientWidth，导致误判为不溢出、
      // marquee 状态被反复复位，轮播永远不触发。
      const staticEl = el.querySelector('.conversation-name-static');
      if (!staticEl) return;
      const overflow = staticEl.scrollWidth > staticEl.clientWidth + 1;
      if (overflow) {
        // 按文本宽度估算轮播时长，约 45px/s，至少 10s，保证可读。
        const next = Math.max(10, Math.ceil(staticEl.scrollWidth / 45));
        setSeconds((prev) => (prev === next ? prev : next));
        setMarquee(true);
      } else {
        setSeconds(0);
        setMarquee(false);
      }
    };
    measure();
    // 自定义字体加载前后文本宽度会变，而块级元素宽度固定、ResizeObserver
    // 不会触发；所以额外在 rAF 和 300ms 后再各量一次，避免首次测量拿到
    // 未排版完成的宽度而误判为不溢出。
    raf = requestAnimationFrame(measure);
    timer = window.setTimeout(measure, 300);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => measure());
      ro.observe(el);
    }
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      if (ro) ro.disconnect();
    };
  }, [name]);

  const active = marquee && seconds > 0;
  return (
    <span
      ref={containerRef}
      className={`conversation-name${active ? ' marquee' : ''}`}
      style={active ? { '--marquee-duration': `${seconds}s` } : undefined}
    >
      <span className="conversation-name-static">{name}</span>
      {active ? (
        <span className="conversation-name-track" aria-hidden="true">
          <span>{name}</span>
          <span>{name}</span>
        </span>
      ) : null}
    </span>
  );
}

export function ConversationNode({
  project,
  conversation,
  active,
  nodeRef,
  terminalStatus = '',
  taskPreviewLimit = PREVIEW_PAGE_SIZE,
  onSelectConversation,
  showTaskRecords = true,
  onRequestDeleteConversation,
  onRequestRenameConversation,
  onPinConversation,
  onDropConversation,
  onOpenTaskReport,
  onRetryTask,
}) {
  const tasks = conversation.tasks || [];
  const [extraVisible, setExtraVisible] = React.useState(0);
  const visibleLimit = Math.max(1, Number(taskPreviewLimit) || PREVIEW_PAGE_SIZE);
  const visibleTasks = tasks.slice(-(visibleLimit + extraVisible)).reverse();
  const hiddenCount = Math.max(0, tasks.length - visibleTasks.length);
  const showTaskList = showTaskRecords && conversation.expanded && tasks.length > 0;
  // 状态灯只有一份判据（model/conversation-run-state.js）：在跑 = 蓝灯、等用户动手 = 黄灯、
  // 任务落地终态 = 熄灯。这里不再自己算「有没有 running 任务」。
  const runState = useConversationRunState({
    conversationId: conversation.id,
    tasks: conversation.tasks,
  });
  // 行尾只有一个状态坑位：在等人 / 在跑 / 未读终态三选一，同一时刻只渲染一条最新状态
  // （判据同上）。以前两个来源各占一个坑位、同时亮，两个图标会叠在一起。
  const statusMark = resolveConversationStatusMark({
    runState: runState.state,
    terminalStatus,
  });
  const waitIndicator = statusMark ? WAIT_INDICATORS[statusMark.kind] : null;
  const WaitGlyph = waitIndicator?.Glyph;
  // 任务卡的状态串来自任务拷贝（可能还在轮询路上），而「在等人」实时快照说了算：
  // 同一份快照命中的那张卡立刻换黄灯图标，不必等下一次轮询把 workflowRun 追上来。
  const waitingTaskId = isRunStateWaiting(runState.state) ? runState.taskId : '';
  const isPinned = Boolean(conversation.pinned);

  const [dropPosition, setDropPosition] = React.useState(null);

  function handleDragStart(event) {
    event.dataTransfer.setData('text/plain', conversation.id);
    event.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const isAfter = (event.clientY - rect.top) > rect.height / 2;
    setDropPosition(isAfter ? 'after' : 'before');
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
  }

  return (
    <div className={`conversation-node ${active ? 'active' : ''} ${dropPosition ? `drag-over drag-over-${dropPosition}` : ''}`} ref={nodeRef}>
      <div
        role="button"
        tabIndex={0}
        className="conversation-row"
        draggable={true}
        onClick={() => onSelectConversation(project.id, conversation.id)}
        onDoubleClick={(event) => {
          // Rename via double-click on the row; ignore action buttons / expand toggle.
          if (event.target.closest?.('.conversation-actions, .conversation-icon-btn')) return;
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
        <ConversationMarqueeTitle name={conversation.name || ''} />
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
        {/* 状态坑位只有一个：在跑 / 在等人 / 未读终态，判据在 model/conversation-run-state.js */}
        {WaitGlyph ? (
          <span className={`conversation-running-indicator ${waitIndicator.className}`} role="status" aria-label={waitIndicator.label}>
            <WaitGlyph />
          </span>
        ) : statusMark?.kind === RUN_STATE_RUNNING ? (
          <span className="conversation-running-indicator" role="status" aria-label="Task running">
            <span className="ico ico-loading" aria-hidden="true" />
          </span>
        ) : statusMark?.status ? (
          <span className={`conversation-terminal-notice chat-timeline-status status-${statusMark.status}`} aria-hidden="true" />
        ) : null}
      </div>

      {showTaskList && (
        <div className="conversation-task-list">
          {visibleTasks.map((task) => (
            <TaskRecordCompact
              key={task.taskId || task.id}
              task={task}
              liveWaitState={waitingTaskId && taskIdOf(task) === waitingTaskId ? runState.state : ''}
              onOpenReport={onOpenTaskReport}
              onRetry={onRetryTask}
            />
          ))}
          {(hiddenCount > 0 || extraVisible > 0) && (
            <button
              type="button"
              className="conversation-show-more"
              onClick={() => setExtraVisible((previous) => nextExtraVisible(previous, hiddenCount))}
            >
              {hiddenCount > 0 ? 'Show more' : 'Show less'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
