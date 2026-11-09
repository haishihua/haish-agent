// 「等某个本地状态落定」的忙等循环此前在 attempt-run-config 和 useConversationRunConfig
// 里各抄了一份：同样的 deadline、同样的 min(50, 剩余) 间隔、同样的一句超时文案。
// 这里只留下这三件真正相同的事；判断「什么算落定、什么算失败、要不要中止」完全留给
// 调用方的 check，两边的业务语义因此不必被塞进同一组参数里。
const INTERVAL_MS = 50;

/**
 * 反复调用 check 直到它返回 'done'；越过 deadline 还没落定就抛带 timeoutMessage 的错。
 *
 * check 返回 'done' 表示落定，返回别的值表示这一拍还没落定、继续轮询；想失败就直接抛错，
 * 错误原样冒泡给调用方，这里既不吞也不包装。
 *
 * 顺序是先检查、后判超时：到点的那一拍仍会跑完最后一次判定，所以恰好赶在截止前落定的
 * 状态依然会被当成成功。休眠取 min(50, 剩余)，最后一拍只等到 deadline，不会再多睡一整个间隔。
 */
export async function pollUntil({ deadline, timeoutMessage, check }) {
  while (true) {
    if (check() === 'done') return;
    if (Date.now() >= deadline) throw new Error(timeoutMessage);
    await new Promise((resolve) => setTimeout(resolve, Math.min(INTERVAL_MS, deadline - Date.now())));
  }
}
