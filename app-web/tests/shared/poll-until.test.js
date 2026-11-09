import test from 'node:test';
import assert from 'node:assert/strict';
import { pollUntil } from '../../src/shared/lib/poll-until.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

test("check 返回 'done' 就结束轮询，不再多睡一个间隔", async () => {
  let checks = 0;
  await pollUntil({
    deadline: Date.now() + 1000,
    timeoutMessage: 'timeout',
    check: () => { checks += 1; return 'done'; },
  });
  assert.equal(checks, 1);
});

test('先检查再判超时：预算为 0 时也要跑完最后一拍才抛超时', async () => {
  let checks = 0;
  await assert.rejects(pollUntil({
    deadline: Date.now(),
    timeoutMessage: 'bounded by deadline',
    check: () => { checks += 1; return 'continue'; },
  }), (thrown) => thrown instanceof Error && thrown.message === 'bounded by deadline');
  // 判定顺序反过来的话这里会是 0。
  assert.equal(checks, 1);
});

test('休眠取 min(50, 剩余)：前几拍隔 50ms，最后一拍只等到 deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let checks = 0;
  const outcome = pollUntil({
    deadline: Date.now() + 70,
    timeoutMessage: 'timeout',
    check: () => { checks += 1; return 'continue'; },
  }).then(() => 'resolved', (error) => error.message);
  await settle();
  assert.equal(checks, 1);
  t.mock.timers.tick(49);
  await settle();
  assert.equal(checks, 1, '间隔未到不会提前再检查一次');
  t.mock.timers.tick(1);
  await settle();
  assert.equal(checks, 2, '第一拍睡满 50ms');
  t.mock.timers.tick(19);
  await settle();
  assert.equal(checks, 2, '剩余只有 20ms，不该再等满 50ms');
  t.mock.timers.tick(1);
  assert.equal(await outcome, 'timeout');
  assert.equal(checks, 3);
});

test('check 抛出的错误原样冒泡，不会被换掉或再轮询', async () => {
  const failure = new Error('save failed: offline');
  let checks = 0;
  await assert.rejects(pollUntil({
    deadline: Date.now() + 1000,
    timeoutMessage: 'timeout',
    check: () => { checks += 1; throw failure; },
  }), (thrown) => thrown === failure);
  assert.equal(checks, 1);
});
