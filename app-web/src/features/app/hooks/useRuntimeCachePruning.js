import { useEffect } from 'react';
import { evictInactiveRuntimes, releaseWorkspaceRuntimeDetails } from '../../conversations/model/runtime-cache.js';

/**
 * 运行态缓存回收：每 10 秒淘汰一次不活跃会话的 runtime，
 * 并把它们在工作区状态里的大块细节（eventLog / answerText）一并压缩掉。
 */
export function useRuntimeCachePruning({ runtimesRef, conversationId, setWorkspaceState }) {
  useEffect(() => {
    const prune = () => {
      const evicted = evictInactiveRuntimes(runtimesRef.current, conversationId);
      if (evicted.size) setWorkspaceState((state) => releaseWorkspaceRuntimeDetails(state, evicted));
    };
    prune();
    const timer = window.setInterval(prune, 10000);
    return () => window.clearInterval(timer);
  }, [conversationId, runtimesRef, setWorkspaceState]);
}
