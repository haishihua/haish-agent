// 任务运行期间拦住系统休眠。
//
// 干活的进程是本地 Python 运行时：机器一进系统休眠，运行时被整机挂起、上游模型
// 流断开，无人值守的长任务就会半途而废。这里用 powerSaveBlocker 的
// prevent-app-suspension——只拦系统休眠这一件事，屏幕照常熄灭、锁屏照常发生，
// 也不挡用户手动睡眠。
//
// 状态只看「有几条任务流在跑」：0 → 1 起断言，1 → 0 放断言；重复 sync 同一状态
// 什么都不做。调用方在任务流增删处各 sync 一次即可。

export type SleepBlocker = {
  start: () => number;
  stop: (blockerId: number) => boolean;
};

export type TaskSleepGuard = {
  sync: (activeTaskStreams: number) => void;
};

export function createTaskSleepGuard(blocker: SleepBlocker): TaskSleepGuard {
  let blockerId: number | null = null;
  return {
    sync(activeTaskStreams) {
      if (activeTaskStreams > 0) {
        if (blockerId === null) blockerId = blocker.start();
        return;
      }
      if (blockerId === null) return;
      blocker.stop(blockerId);
      blockerId = null;
    },
  };
}
