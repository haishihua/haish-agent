import React from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { PortalTooltip } from '../../../../shared/ui/PortalTooltip.jsx';
import { MetalActionEffect } from '../../../../shared/ui/MotionEffects.jsx';
import { resolveSendGate } from '../../model/send-gate.js';

/**
 * 发送 / 停止按钮簇。四种分支（保存中、停止失败、运行中纠偏、运行中停止）
 * 的判定条件全部由 ChatComposer 推导好后整体传进 sendState：
 * 这里不再自己算运行状态，也不持有任何状态，只把 onClick / onKeyDown
 * 回调原样接到按钮上。
 *
 * 「能不能发」不在这里另写条件表：主发送直接用 ChatComposer 备好的 sendGate，
 * 运行中纠偏用同一个 model/send-gate.js 换个上下文再算一次。两块按钮只保留界面
 * 差异（图标、aria 文案、tooltip 挂载），判据改动永远只有一处。
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
    goal,
    sendGate,
  } = sendState;
  // 纠偏分支只换上下文、不换判据：这次发送复用已经在跑的那条任务，不写 run config，
  // 所以配置同步 / Agent 可用 / 模型路由三条不参与，多出来的只有「上一笔纠偏还在飞」。
  const runtimeInputGate = resolveSendGate({
    disabled, waitingForSend, runtimeInputPending, goalPending, canSubmitPayload, runtimeInput: true,
  });
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
          <button type="submit" className="chat-send" disabled={!runtimeInputGate.canSend} aria-label={goal ? 'Run Goal Loop' : 'Add instruction'}>
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
        <PortalTooltip text={sendGate.blockedReason} position="above">
          <span className="chat-send-tooltip-trigger" tabIndex={sendGate.blockedReason ? 0 : undefined}>
            <MetalActionEffect active={sendBeamActive}>
              <button type="submit" className="chat-send" disabled={!sendGate.canSend} aria-busy={waitingForSend} aria-label={goal ? 'Run Goal Loop' : 'Send'}>
                <ArrowUp className="chat-send-icon" strokeWidth={2.3} aria-hidden="true" />
              </button>
            </MetalActionEffect>
          </span>
        </PortalTooltip>
      )}
    </>
  );
}
