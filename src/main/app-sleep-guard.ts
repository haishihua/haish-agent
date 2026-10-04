// 应用运行期间阻止自动系统休眠，避免空闲时睡眠错过定时任务。
// 使用 prevent-app-suspension：屏幕仍可熄灭、锁屏，不阻止手动睡眠或合盖。
// 只在 app.whenReady 后 start，在真正退出时 stop；任务、窗口和连接状态不参与控制。

export type SleepBlocker = {
  start: () => number;
  stop: (blockerId: number) => boolean;
};

export type AppSleepGuard = {
  start: () => void;
  stop: () => void;
};

export function createAppSleepGuard(blocker: SleepBlocker): AppSleepGuard {
  let blockerId: number | null = null;
  return {
    start() {
      if (blockerId === null) blockerId = blocker.start();
    },
    stop() {
      if (blockerId === null) return;
      blocker.stop(blockerId);
      blockerId = null;
    },
  };
}
