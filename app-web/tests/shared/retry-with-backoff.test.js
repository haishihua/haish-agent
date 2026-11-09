import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retryWithBackoff,
  SECTION_LOAD_RETRY,
  STARTUP_LOAD_RETRY,
} from '../../src/shared/lib/retry-with-backoff.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

// 用假的 schedule 抓住排队中的重试：既能断言次数/间隔，也能模拟卸载时的取消。
function harness(options, { failures = 0 } = {}) {
  const timers = [];
  const attempts = [];
  const exhausted = [];
  const stop = retryWithBackoff(async (attempt) => {
    attempts.push(attempt);
    if (attempt < failures) throw new Error(`attempt ${attempt} failed`);
  }, {
    ...options,
    onExhausted: (error) => exhausted.push(error.message),
    schedule: (callback, ms) => {
      timers.push({ callback, ms, cancelled: false });
      return timers.length;
    },
    cancel: (handle) => { timers[handle - 1].cancelled = true; },
  });
  const pending = () => timers.filter((timer) => !timer.cancelled && !timer.fired);
  const fire = () => {
    const timer = pending()[0];
    timer.fired = true;
    timer.callback();
  };
  const runOut = async () => {
    await settle();
    while (pending().length) {
      fire();
      await settle();
    }
  };
  return { stop, timers, attempts, exhausted, pending, fire, runOut };
}

test('启动期档：失败 9 次才放弃，间隔 400/800/1200/1600 后封顶 2000', async () => {
  assert.deepEqual(STARTUP_LOAD_RETRY.attempts, 8);
  const h = harness(STARTUP_LOAD_RETRY, { failures: 9 });
  await h.runOut();
  assert.deepEqual(h.attempts, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(h.timers.map((timer) => timer.ms), [400, 800, 1200, 1600, 2000, 2000, 2000, 2000]);
  assert.deepEqual(h.exhausted, ['attempt 8 failed']);
});

test('分区档：失败 5 次才放弃，间隔 400/800/1200/1600 不封顶', async () => {
  assert.deepEqual(SECTION_LOAD_RETRY.attempts, 4);
  const h = harness(SECTION_LOAD_RETRY, { failures: 5 });
  await h.runOut();
  assert.deepEqual(h.attempts, [0, 1, 2, 3, 4]);
  assert.deepEqual(h.timers.map((timer) => timer.ms), [400, 800, 1200, 1600]);
  assert.deepEqual(h.exhausted, ['attempt 4 failed']);
});

test('一次成功就不再排队，也不报告放弃', async () => {
  const h = harness(STARTUP_LOAD_RETRY);
  await h.runOut();
  assert.deepEqual(h.attempts, [0]);
  assert.deepEqual(h.timers, []);
  assert.deepEqual(h.exhausted, []);
});

test('中途成功只等前面失败的那几次，错误不落到调用方', async () => {
  const h = harness(SECTION_LOAD_RETRY, { failures: 2 });
  await h.runOut();
  assert.deepEqual(h.attempts, [0, 1, 2]);
  assert.deepEqual(h.timers.map((timer) => timer.ms), [400, 800]);
  assert.deepEqual(h.exhausted, []);
});

test('stop 取消排队中的重试，卸载后不再自己回来', async () => {
  const h = harness(STARTUP_LOAD_RETRY, { failures: 9 });
  await settle();
  assert.equal(h.pending().length, 1);
  h.stop();
  assert.equal(h.timers[0].cancelled, true);
  assert.equal(h.pending().length, 0);
  // 即便被取消的回调仍被触发（例如定时器已经进队列），任务也不该再跑。
  h.timers[0].callback();
  await settle();
  assert.deepEqual(h.attempts, [0]);
  assert.deepEqual(h.exhausted, []);
});
