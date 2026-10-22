// 服务端背压丢了事件时会发 resync_required（{"type":"resync_required", "task_id":…,
// "reason":"backpressure"}）：这是控制面提示，不是“任务失败”，不能把它当一个事件
// 丢掉、更不能弹错误给用户。这里按游标把这条任务补一次：
// - 本地还没有这条任务的拷贝 → 走普通恢复路径整条水合（restoreLatestTaskRuntime）；
// - 本地已经有拷贝（多数情况是正在直播的那一条）→ 只把漏掉的事件按 event_id 补进
//   现有日志。正在直播时恢复路径的守卫会拒绝覆盖当前活跃任务，而且整份替换会盖掉
//   本地正在写的内容，所以直播中的补事件走增量摄取。
//
// 补齐逻辑本身一个字都不改，只是把依赖从工厂闭包改成显式传入。
export const RESYNC_REQUIRED_TYPE = 'resync_required';

export function createBackpressureRecovery({
  getRuntime,
  getTaskById,
  restoreLatestTaskRuntime,
  fetchTaskRuntimeDetail,
  batchRuntimeMutations,
  acceptRuntimeEvent,
  applyRuntimeEvent,
}) {
  const resyncTaskRuntimeAfterBackpressure = (message, ownerConvId, { flushPending = null } = {}) => {
    const taskId = String(message?.task_id || '');
    const targetConvId = message?.conversation_id || ownerConvId || null;
    if (!taskId || !targetConvId) return Promise.resolve(null);
    const runtime = getRuntime(targetConvId);
    if (!runtime) return Promise.resolve(null);
    const isCurrentRuntime = () => getRuntime(targetConvId) === runtime;
    const refill = async () => {
      if (!getTaskById(taskId, targetConvId)) {
        return restoreLatestTaskRuntime(taskId, {
          targetConversationId: targetConvId,
          isCurrentActivation: isCurrentRuntime,
        });
      }
      const detail = await fetchTaskRuntimeDetail(taskId, targetConvId);
      const events = Array.isArray(detail?.events) ? detail.events : [];
      if (!events.length || !isCurrentRuntime()) return null;
      // 先把已经收到但还在批次队列里的直播事件落下去，再把漏掉的那几条接在后面：
      // 直播管线是按 32ms 批次应用事件的，不先 flush 会把补回来的文本插到前面去。
      flushPending?.();
      return batchRuntimeMutations(targetConvId, () => {
        for (const event of events) {
          // 已经到过的事件（直播收到过 / 上一次补过）按 event_id 跳过，不重复计两次。
          if (!acceptRuntimeEvent(event, targetConvId)) continue;
          applyRuntimeEvent(event, targetConvId);
        }
      });
    };
    // 补事件失败只是“这一次没补上”：任务在服务端继续跑，留给轮询/下一次重连继续补，
    // 绝对不能变成时间线上的失败或错误弹窗。
    return Promise.resolve().then(refill).catch((error) => {
      console.warn('[runtime] resync after backpressure failed', error);
      return null;
    });
  };
  return resyncTaskRuntimeAfterBackpressure;
}
