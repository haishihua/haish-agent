import React from 'react';
import { PortalTooltip } from './PortalTooltip.jsx';

// 消息气泡的复制按钮：聊天消息行和审批卡片里的助手回复用同一个，
// 类名与 aria 只在这里出现一次，两处的复制入口不会再各自漂移。
export function CopyMessageButton({ copied, onCopy }) {
  return (
    <PortalTooltip text={copied ? 'Copied' : 'Copy'} position="above">
      <button
        type="button"
        className={`chat-bubble-copy ${copied ? 'copied' : ''}`}
        onClick={onCopy}
        aria-label={copied ? 'Copied' : 'Copy message'}
      >
        <span className="ico-copy-message" aria-hidden="true" />
      </button>
    </PortalTooltip>
  );
}
