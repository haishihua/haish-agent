import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { createScheduledTaskActivity } from './scheduled-task-activity.js';

/**
 * 主进程到本地 runtime 的实时通道：整个进程只有这一条 WebSocket。
 * 这里装的是传输层——连接与断线重连、命令等待/超时、按 request_id 把服务端消息
 * 投递给拿着这个请求的渲染层、断线后用 task.attach 重挂直播流，以及 15 秒一次的
 * 定时任务活动快照。窗口、IPC 注册和 app 生命周期仍然留在 main.ts。
 *
 * 两边共享的状态只存在于本模块，main.ts 一律通过下面导出的读写函数访问，
 * 不要再复制出第二份 socket / 登记表 / 订阅者集合。
 */

// runtime 地址与退出标志属于 app 生命周期与路径解析，仍由 main.ts 持有，
// 这里只读不存一份。
export type RealtimeClientPorts = {
  runtimeBaseUrl: () => Promise<string>;
  isRuntimeStopping: () => boolean;
};

let ports: RealtimeClientPorts = {
  // 未配置就连接比静默地连到错的 runtime 更好排查。
  runtimeBaseUrl: () => Promise.reject(new Error('configureRealtimeClient() must run before the realtime client connects.')),
  isRuntimeStopping: () => false,
};

export function configureRealtimeClient(next: RealtimeClientPorts): void {
  ports = next;
}

function runtimeBaseUrl(): Promise<string> {
  return ports.runtimeBaseUrl();
}

function isRuntimeStopping(): boolean {
  return ports.isRuntimeStopping();
}

export type RealtimeMessage = Record<string, unknown> & { type?: string; request_id?: string };
type CommandWaiter = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};
// 一条直播流的登记：谁在听（webContents），以及服务端分配的 task_id。
// task.start 发出时还没有 task_id，由第一条带 task_id 的服务端消息补上；
// 断线重连后 task.attach 要用它把这条流重新挂上。
type RealtimeTaskOwner = { ownerId: number; taskId: string | null };

let realtimeSocket: WebSocket | null = null;
let realtimeSocketPromise: Promise<WebSocket> | null = null;
let realtimeReconnectTimer: NodeJS.Timeout | null = null;
const realtimeCommandWaiters = new Map<string, CommandWaiter>();
const realtimeTaskOwners = new Map<string, RealtimeTaskOwner>();
const realtimeApprovalSubscribers = new Set<number>();
const realtimeScheduleSubscribers = new Set<number>();
const realtimeSettingsSubscribers = new Set<number>();

const scheduledTaskActivity = createScheduledTaskActivity();
let scheduleActivityTimer: NodeJS.Timeout | null = null;
let scheduleActivityRefreshing = false;

function realtimeSocketUrl(baseUrl: string): string {
  const url = new URL('/api/events/ws', baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function sendToWebContents(id: number, channel: string, payload: unknown): void {
  const target = BrowserWindow.getAllWindows().map((item) => item.webContents).find((item) => item.id === id);
  if (target && !target.isDestroyed()) target.send(channel, payload);
}

function failRealtimeConnection(detail = 'Local runtime connection closed.'): void {
  const error = new Error(detail);
  for (const waiter of realtimeCommandWaiters.values()) {
    clearTimeout(waiter.timer);
    waiter.reject(error);
  }
  realtimeCommandWaiters.clear();
  // 不再为还在跑的任务合成 task.error，也不清空 realtimeTaskOwners：socket 断开
  // 是传输层抖动，任务在服务端会继续跑。重连成功后 reattachRunningTaskStreams
  // 用 task.attach 重新挂上这些流（服务端先补发缓冲再续播），一次抖动不会变成
  // 用户眼里“任务失败了”。真失败只由服务端发来的消息宣布。
}

function rememberRealtimeTaskId(requestId: string, taskId: unknown): void {
  const owner = realtimeTaskOwners.get(requestId);
  if (!owner || owner.taskId) return;
  if (typeof taskId === 'string' && taskId) owner.taskId = taskId;
}

function reattachRunningTaskStreams(socket: WebSocket): void {
  if (!realtimeTaskOwners.size) return;
  const owners = [...realtimeTaskOwners];
  // 先清空再逐条重挂：同一次重连里一个 requestId 只应有一条直播流，重复 attach
  // 会让同一个任务的事件被投递两遍。
  realtimeTaskOwners.clear();
  for (const [requestId, owner] of owners) {
    realtimeTaskOwners.set(requestId, owner);
    // 没见过服务端分配的 task_id 时没有可挂的任务，等它自己跑出来再说。
    if (!owner.taskId) continue;
    try {
      socket.send(JSON.stringify({
        type: 'task.attach',
        request_id: requestId,
        task_id: owner.taskId,
        // 游标只存在渲染层的运行时缓存里；这里让服务端补发它自己的缓冲，
        // 重复的事件由渲染层的事件身份（event_id）去重。
        after_event_id: null,
      }));
    } catch (error) {
      console.warn('[realtime] failed to re-attach task stream', error);
    }
  }
}

export function scheduleRealtimeReconnect(): void {
  // Scheduled execution outlives renderer windows; always reconnect until quit.
  if (isRuntimeStopping() || realtimeReconnectTimer) return;
  realtimeReconnectTimer = setTimeout(() => {
    realtimeReconnectTimer = null;
    ensureRealtimeSocket().catch(() => scheduleRealtimeReconnect());
  }, 1_000);
}

function handleRealtimeMessage(event: MessageEvent): void {
  let message: RealtimeMessage;
  try {
    message = JSON.parse(String(event.data)) as RealtimeMessage;
  } catch {
    return;
  }
  const requestId = String(message.request_id || '');
  if (message.type === 'command.result') {
    const waiter = realtimeCommandWaiters.get(requestId);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    realtimeCommandWaiters.delete(requestId);
    if (message.ok) waiter.resolve((message.result as Record<string, unknown>) || { ok: true });
    else waiter.reject(Object.assign(new Error(String(message.detail || 'Runtime command failed.')), { status: message.status }));
    return;
  }
  if (message.type === 'settings.event' || message.type === 'settings.resync') {
    for (const subscriberId of realtimeSettingsSubscribers) {
      sendToWebContents(subscriberId, 'runtime:settings-event', message);
    }
    return;
  }
  if (message.type === 'schedule.event' || message.schedule_id) {
    scheduledTaskActivity.handle(message);
    for (const subscriberId of realtimeScheduleSubscribers) {
      sendToWebContents(subscriberId, 'runtime:schedule-event', message);
    }
    return;
  }
  if (message.type === 'task.event' || message.type === 'task.error' || message.type === 'task.end') {
    const owner = realtimeTaskOwners.get(requestId);
    if (owner) {
      rememberRealtimeTaskId(requestId, (message.event as Record<string, unknown> | undefined)?.task_id);
      sendToWebContents(owner.ownerId, 'runtime:task-message', message);
    }
    if (message.type === 'task.end') {
      realtimeTaskOwners.delete(requestId);
    }
    return;
  }
  if (message.type === 'approval.event') {
    for (const subscriberId of realtimeApprovalSubscribers) {
      sendToWebContents(subscriberId, 'runtime:approval-event', message.event);
    }
    return;
  }
  // 其余消息（resync_required、以及以后新增的任何控制面消息）只要 request_id
  // 登记过就透传给它的渲染层所有者——不要按 type 白名单过滤，中间层不认识的
  // 消息不该在这里凭空消失。
  const fallbackOwner = realtimeTaskOwners.get(requestId);
  if (!fallbackOwner) return;
  rememberRealtimeTaskId(requestId, message.task_id);
  sendToWebContents(fallbackOwner.ownerId, 'runtime:task-message', message);
}

export async function ensureRealtimeSocket(): Promise<WebSocket> {
  if (realtimeSocket?.readyState === WebSocket.OPEN) return realtimeSocket;
  if (realtimeSocketPromise) return realtimeSocketPromise;
  realtimeSocketPromise = (async () => {
    const baseUrl = await runtimeBaseUrl();
    return new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(realtimeSocketUrl(baseUrl));
      let opened = false;
      socket.addEventListener('open', () => {
        opened = true;
        realtimeSocket = socket;
        // 断线重连：把仍然登记着的任务流重新挂上，服务端先补发缓冲再续播，
        // 已经在跑的任务不会因为一次 socket 抖动而失去直播流。
        reattachRunningTaskStreams(socket);
        for (const subscriberId of realtimeSettingsSubscribers) {
          sendToWebContents(subscriberId, 'runtime:settings-event', { type: 'settings.resync' });
        }
        for (const subscriberId of realtimeScheduleSubscribers) {
          sendToWebContents(subscriberId, 'runtime:schedule-event', { type: 'schedule.resync' });
        }
        resolve(socket);
        if (scheduleActivityTimer) clearInterval(scheduleActivityTimer);
        scheduleActivityTimer = setInterval(() => void refreshScheduleActivity(), 15_000);
        void refreshScheduleActivity();
      });
      socket.addEventListener('message', handleRealtimeMessage);
      socket.addEventListener('error', () => {
        if (!opened) reject(new Error('Could not connect to the local runtime event socket.'));
      });
      socket.addEventListener('close', () => {
        if (realtimeSocket === socket) realtimeSocket = null;
        if (!opened) reject(new Error('Local runtime event socket closed before connecting.'));
        if (scheduleActivityTimer) clearInterval(scheduleActivityTimer);
        scheduleActivityTimer = null;
        // Unlike manual streams, scheduled executions survive socket loss.
        failRealtimeConnection();
        scheduleRealtimeReconnect();
      });
    });
  })().finally(() => {
    realtimeSocketPromise = null;
  });
  return realtimeSocketPromise;
}

async function refreshScheduleActivity(): Promise<void> {
  const socket = realtimeSocket;
  if (isRuntimeStopping() || scheduleActivityRefreshing || socket?.readyState !== WebSocket.OPEN) return;
  scheduleActivityRefreshing = true;
  const snapshot = scheduledTaskActivity.beginSnapshot();
  try {
    const result = await sendRealtimeCommand({ type: 'schedule.activity.snapshot', request_id: randomUUID() }, 10_000);
    if (isRuntimeStopping() || realtimeSocket !== socket) return;
    snapshot.apply(result.run_ids);
  } catch (error) {
    if (!isRuntimeStopping()) console.warn('[realtime] failed to refresh schedule activity', error);
  } finally {
    snapshot.cancel();
    scheduleActivityRefreshing = false;
  }
}

export async function sendRealtimeCommand(command: RealtimeMessage, timeoutMs = 16 * 60_000): Promise<Record<string, unknown>> {
  const requestId = String(command.request_id || '');
  if (!requestId) throw new Error('Realtime command request_id is required.');
  const socket = await ensureRealtimeSocket();
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const timer = setTimeout(() => {
      realtimeCommandWaiters.delete(requestId);
      reject(new Error('Runtime command timed out.'));
    }, timeoutMs);
    realtimeCommandWaiters.set(requestId, { resolve, reject, timer });
    try {
      socket.send(JSON.stringify(command));
    } catch (error) {
      clearTimeout(timer);
      realtimeCommandWaiters.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function refreshApprovalSnapshot(subscriberId: number): Promise<void> {
  const result = await sendRealtimeCommand({
    type: 'approval.snapshot',
    request_id: randomUUID(),
  });
  if (!realtimeApprovalSubscribers.has(subscriberId)) return;
  const state = result.state;
  if (!state || typeof state !== 'object') throw new Error('Runtime returned an invalid approval snapshot.');
  sendToWebContents(subscriberId, 'runtime:approval-event', {
    type: 'approval_snapshot',
    state,
  });
}

// —— 状态读写：main.ts 的 IPC 处理器和退出流程只通过下面这些函数动实时状态 ——

/** 登记一条刚发出的 task.start：task_id 等服务端第一条带 task_id 的消息补上。 */
export function registerTaskStreamOwner(requestId: string, ownerId: number): void {
  realtimeTaskOwners.set(requestId, { ownerId, taskId: null });
}

export function forgetTaskStreamOwner(requestId: string): void {
  realtimeTaskOwners.delete(requestId);
}

export function addSettingsSubscriber(senderId: number): void {
  realtimeSettingsSubscribers.add(senderId);
}

export function hasSettingsSubscriber(senderId: number): boolean {
  return realtimeSettingsSubscribers.has(senderId);
}

export function removeSettingsSubscriber(senderId: number): void {
  realtimeSettingsSubscribers.delete(senderId);
}

export function addApprovalSubscriber(senderId: number): void {
  realtimeApprovalSubscribers.add(senderId);
}

export function removeApprovalSubscriber(senderId: number): void {
  realtimeApprovalSubscribers.delete(senderId);
}

export function addScheduleSubscriber(senderId: number): void {
  realtimeScheduleSubscribers.add(senderId);
}

export function hasScheduleSubscriber(senderId: number): boolean {
  return realtimeScheduleSubscribers.has(senderId);
}

export function removeScheduleSubscriber(senderId: number): void {
  realtimeScheduleSubscribers.delete(senderId);
}

/** 退出前收尾：停掉重连和 15 秒快照、清空登记与定时任务活动、关掉 socket。 */
export function stopRealtimeClient(): void {
  if (realtimeReconnectTimer) clearTimeout(realtimeReconnectTimer);
  realtimeReconnectTimer = null;
  if (scheduleActivityTimer) clearInterval(scheduleActivityTimer);
  scheduleActivityTimer = null;
  scheduledTaskActivity.clear();
  realtimeTaskOwners.clear();
  realtimeSocket?.close();
  realtimeSocket = null;
}
