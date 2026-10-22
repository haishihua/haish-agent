import { createContextUsageTracker } from '../../chat/model/context-usage.js';

/**
 * 表盘（context usage）的唯一写入入口：实时流 / 任务轮询 / 恢复分页 / 会话激活 / fork 都从这里进。
 * 仲裁与落盘都在 createContextUsageTracker：当前显示的会话改 state + 落盘，别的会话
 * （后台轮询 / 恢复）只落盘，切回去时直接复用同一份读数。
 *
 * tracker 实例挂在 ref 上：同一次事件里可能连着写几次（任务 + 会话级），
 * 后台会话的轮询也要先跟已落盘的值比一次，state 闭包里读不到最新的那份。
 */
export function useContextUsageBridge({ contextUsageTrackerRef, conversationIdRef, setContextUsage }) {
  const tracker = contextUsageTrackerRef.current || (
    contextUsageTrackerRef.current = createContextUsageTracker({
      getActiveConversationId: () => conversationIdRef.current,
      onChange: (usage) => setContextUsage(usage),
    })
  );

  function applyContextUsage(candidate, options) {
    return tracker.apply(candidate, options);
  }

  // 新建/切到空白会话时换一块空表盘（没人跑过任务就没有读数，也不写存储）。
  function resetContextUsage(conversationIdValue = null) {
    return tracker.reset(conversationIdValue);
  }

  return { applyContextUsage, resetContextUsage };
}
