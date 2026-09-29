// 全量重发（编辑 / 重跑）的「收工时机」，和输入框发送共用一套：请求一被服务端接下
// 就算发出去了。
//
// 时间线上那一行的编辑框靠它决定什么时候收工。原来调用方要等 executeQuest 整段流跑完
// （SSE 结束）才拿到结果，于是按下 Send 之后编辑框一直顶在「Sending…」上，而这一轮早就
// 在下面以运行态渲染出来了——看起来就是编辑框留在原地不动、错位在新消息上面。
//
// 三种结局分得很清楚：
//   · 启动前被拦下（校验失败）→ 原样 reject，编辑框留在原地、行内显示原因，草稿不丢；
//   · 被接下 → 立刻 resolve(true)，编辑框立刻收工、这一轮立刻以运行态渲染；
//   · 接下之后的失败 → resolve(true) 并交给 onLateError（任务行与错误提示负责）。
export function createQuestAck() {
  let accepted = false;
  let markAccepted = () => {};
  const acceptedOnce = new Promise((resolve) => { markAccepted = resolve; });
  return {
    // 交给 executeQuest 的 streamRequest.onAccepted。
    accept() {
      if (accepted) return;
      accepted = true;
      markAccepted(true);
    },
    // 收工信号（editing surface 直接等它）。
    follow(run, onLateError) {
      return new Promise((resolve, reject) => {
        acceptedOnce.then(() => resolve(true));
        run.then(
          () => { if (!accepted) resolve(true); },
          (error) => {
            if (!accepted) { reject(error); return; }
            onLateError?.(error);
            resolve(true);
          },
        );
      });
    },
  };
}
