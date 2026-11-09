import { pollUntil } from './poll-until.js';

// 三条等待路径要给用户同一句超时提示，文案只在这里定义一次：改一处，全都会跟上。
export const CONVERSATION_CONFIG_TIMEOUT_MESSAGE = 'Timed out waiting for conversation configuration. Your changes have not been sent. Please try again.';

// Bound the whole configuration preflight, including sidebar loads and saves.
// Cancelling an action must not cancel a shared configuration save; only stop
// waiting for it. Settlement handlers also consume any late request rejection.
export function waitForAttemptConfigOperation(operation, { timeoutMs = 30_000, signal,
  timeoutMessage = CONVERSATION_CONFIG_TIMEOUT_MESSAGE } = {}) {
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (callback, value) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, new Error('Retry was stopped. Your changes have not been sent.'));
    Promise.resolve(operation).then(value => finish(resolve, value), error => finish(reject, error));
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish(reject, new Error(timeoutMessage)), timeoutMs);
  });
}

// A retry owns its conversation's configuration session, not the visible composer.
// Model catalog refresh is picker metadata; a concrete, valid saved route is the
// execution authority even when that picker unmounts during navigation.
export async function waitForAttemptRunConfig(session, { timeoutMs = 30_000, signal } = {}) {
  const deadline = Date.now() + timeoutMs;
  let saving = null;
  let failure = null;
  let settled;
  const follow = (operation) => {
    saving = operation;
    operation.then((saved) => {
      session.saved = saved;
      saving = null;
    }, (error) => { failure = error; saving = null; });
  };
  // 这里只共用轮询节奏和超时文案；什么算落定、什么算失败，仍由这份 session 的语义决定。
  await pollUntil({
    deadline,
    timeoutMessage: CONVERSATION_CONFIG_TIMEOUT_MESSAGE,
    check: () => {
      if (signal?.aborted) throw new Error('Retry was stopped. Your changes have not been sent.');
      if (failure) throw failure;
      if (session.error) throw new Error(session.error);
      if (!saving && session.operation) {
        follow(session.operation);
      } else if (!saving && session.loaded) {
        const current = session.current;
        // While mounted, wait for restore to reach React. After leaving, the
        // original load's baseline is usable without restoring another composer.
        const config = current.ready ? current.config : !session.attached ? session.baseline : null;
        if (config) {
          const error = current.validate?.(config) || (current.ready ? current.saveBlockedReason : '');
          if (error) throw new Error(error);
          if (JSON.stringify(session.saved) === JSON.stringify(config)) {
            settled = structuredClone(config);
            return 'done';
          }
          if (!session.sync || !session.serverId) {
            settled = structuredClone(config);
            return 'done';
          }
          if (session.attached && current.persist) {
            // Keep the composer's committed snapshot in sync while it is visible.
            follow(current.persist(config));
          } else {
            session.sync.observe(session.scopeId, config);
            follow(session.sync.flush(session.serverId, session.scopeId));
          }
        }
      }
      return 'continue';
    },
  });
  return settled;
}
