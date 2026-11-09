/**
 * 反复执行同一个「读一次设置」的任务，失败按递增间隔重试，预算用完才认输。
 *
 * 桌面端启动时本地 runtime 可能还没起来，这类失败不是终局；但也不能无限重试：
 * 真失败时要尽快把错误交给调用方去提示。定时器由调用方注入——renderer 里必须走
 * window 的定时器，卸载或新一次读取时才能按 id 取消排队中的那一次重试。
 *
 * task(attempt) 抛错才算失败；onExhausted 只在最后一次也失败时收到该错误。
 * 返回的 stop() 停掉排队中的重试（已经发出去的请求由调用方自己 abort）。
 */
export function retryWithBackoff(task, {
  attempts,
  delay,
  onExhausted,
  schedule = (callback, ms) => setTimeout(callback, ms),
  cancel = (handle) => clearTimeout(handle),
}) {
  let handle = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (handle === null) return;
    cancel(handle);
    handle = null;
  };
  const run = async (attempt) => {
    if (stopped) return;
    try {
      await task(attempt);
    } catch (error) {
      if (stopped) return;
      if (attempt >= attempts) {
        onExhausted?.(error);
        return;
      }
      handle = schedule(() => {
        handle = null;
        void run(attempt + 1);
      }, delay(attempt));
    }
  };
  void run(0);
  return stop;
}

/**
 * 启动期读取整个目录（LLM 供应商列表）：runtime 可能比 renderer 晚几百毫秒起来，
 * 所以重试 8 次、间隔 400/800/1200/1600/2000…（封顶 2s，总预算约 12s）。
 */
export const STARTUP_LOAD_RETRY = {
  attempts: 8,
  delay: (attempt) => Math.min(400 * (attempt + 1), 2000),
};

/**
 * 进入某个设置分区时的重读：用户已经站在页面上等结果，4 次、间隔 400/800/1200/1600
 * （总预算约 4s）足够覆盖一次 runtime 冷启动抖动，再久不如直接提示错误。
 */
export const SECTION_LOAD_RETRY = {
  attempts: 4,
  delay: (attempt) => 400 * (attempt + 1),
};
