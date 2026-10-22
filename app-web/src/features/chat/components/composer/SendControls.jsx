import React from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { PortalTooltip } from '../../../../shared/ui/PortalTooltip.jsx';
import { MetalActionEffect } from '../../../../shared/ui/MotionEffects.jsx';

/**
 * 发送 / 停止按钮簇。四种分支（保存中、停止失败、运行中纠偏、运行中停止）
 * 的判定条件全部由 ChatComposer 推导好后整体传进 sendState：
 * 这里不再自己算运行状态，也不持有任何状态，只把 onClick / onKeyDown
 * 回调原样接到按钮上。
 */
export function SendControls({ sendState, onStopPress, onStopKey }) {
  const {
    submitPending,
    stopError,
    running,
    allowRuntimeInput,
    hasComposerPayload,
    pendingCommentCount,
    disabled,
    waitingForSend,
    runtimeInputPending,
    goalPending,
    canSubmitPayload,
    sendBeamActive,
    modelConfigError,
    goal,
    sendBlockedReason,
    configSync,
    currentSelection,
  } = sendState;
  return (
    <>
      {submitPending ? (
        <MetalActionEffect active={sendBeamActive}>
          <button type="button" className="chat-send stop" onMouseDown={onStopPress} onKeyDown={onStopKey} aria-label="Cancel pending request">
            <Square className="chat-send-icon chat-stop-icon" fill="currentColor" strokeWidth={0} aria-hidden="true" />
          </button>
        </MetalActionEffect>
      ) : stopError ? (
        <MetalActionEffect active={sendBeamActive}>
          <button type="button" className="chat-send stop" onMouseDown={onStopPress} onKeyDown={onStopKey} aria-label="Stop again">
            <Square className="chat-send-icon chat-stop-icon" fill="currentColor" strokeWidth={0} aria-hidden="true" />
          </button>
        </MetalActionEffect>
      ) : running && allowRuntimeInput && hasComposerPayload && !pendingCommentCount ? (
        // Running + user typed a mid-run instruction: replace Stop with Send,
        // so Stop and Send never appear side by side. Sending clears the
        // draft and the button flips back to Stop.
        <MetalActionEffect active={sendBeamActive}>
          <button type="submit" className="chat-send" disabled={disabled || waitingForSend || runtimeInputPending || goalPending || !canSubmitPayload} aria-label={goal ? 'Run Goal Loop' : 'Add instruction'}>
            <ArrowUp className="chat-send-icon" strokeWidth={2.3} aria-hidden="true" />
          </button>
        </MetalActionEffect>
      ) : running ? (
        <MetalActionEffect active={sendBeamActive}>
          <button type="button" className="chat-send stop" onMouseDown={onStopPress} onKeyDown={onStopKey} aria-label="Stop">
            <Square className="chat-send-icon chat-stop-icon" fill="currentColor" strokeWidth={0} aria-hidden="true" />
          </button>
        </MetalActionEffect>
      ) : (
        <PortalTooltip text={sendBlockedReason} position="above">
          <span className="chat-send-tooltip-trigger" tabIndex={sendBlockedReason ? 0 : undefined}>
            <MetalActionEffect active={sendBeamActive}>
              <button type="submit" className="chat-send" disabled={disabled || waitingForSend || goalPending || !configSync.ready || currentSelection?.disabled || !canSubmitPayload || Boolean((!goal || goal.prompt) && modelConfigError)} aria-busy={waitingForSend} aria-label={goal ? 'Run Goal Loop' : 'Send'}>
                <ArrowUp className="chat-send-icon" strokeWidth={2.3} aria-hidden="true" />
              </button>
            </MetalActionEffect>
          </span>
        </PortalTooltip>
      )}
    </>
  );
}
