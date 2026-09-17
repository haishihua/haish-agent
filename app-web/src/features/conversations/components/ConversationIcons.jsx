import React from 'react';
import { MessageCircleQuestion } from 'lucide-react';
import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';

export function ConversationAction({ label, icon, onClick, disabled = false, tooltipPosition = 'above' }) {
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

// 等待类图标在会话行指示灯里复用，抽成组件，避免两处各抄一份路径。
export function ApprovalGlyph() {
  return (
    <svg className="conversation-status-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 9v6M14 9v6" />
    </svg>
  );
}

// 「等回答」用 lucide 的 message-circle-question（对话气泡 + 问号）：17px 下问号仍看得清，
// 一眼就是「有个问题在等你」，比原来的空白气泡多一层语义；描边/尺寸仍走共用的
// .conversation-status-glyph（任务卡 17px、会话行 15px），不再手写一份路径。
export function WaitingInputGlyph() {
  return <MessageCircleQuestion className="conversation-status-glyph" aria-hidden="true" />;
}

export function TaskStatusIcon({ statusClass }) {
  if (statusClass === 'done') {
    return <span className="conversation-task-status-icon done"><span className="ico ico-check-success" aria-hidden="true" /></span>;
  }
  if (statusClass === 'failed') {
    return <span className="conversation-task-status-icon failed"><span className="ico ico-close" aria-hidden="true" /></span>;
  }
  if (statusClass === 'cancelled') {
    return <span className="conversation-task-status-icon cancelled"><StopCancelIcon /></span>;
  }
  if (statusClass === 'approval') {
    return (
      <span className="conversation-task-status-icon approval" role="status" aria-label="Awaiting approval">
        <ApprovalGlyph />
      </span>
    );
  }
  if (statusClass === 'waiting_input') {
    return (
      <span className="conversation-task-status-icon waiting-input" role="status" aria-label="Waiting for input">
        <WaitingInputGlyph />
      </span>
    );
  }
  return <span className="conversation-task-status-icon pending"><span className="ico ico-loading" aria-hidden="true" /></span>;
}
