import assert from 'node:assert/strict';
import test from 'node:test';

import { describeMessageDay, withDaySeparators } from '../../../src/features/chat/model/day-separators.js';

// 全部用本地时间构造：断言不依赖 CI 的时区，跨零点判据也走本地日历日。
const at = (year, month, day, hour = 12, minute = 0) => new Date(year, month - 1, day, hour, minute).getTime();
const NOW = at(2026, 9, 18, 10, 0);
const message = (id, createdAt) => ({ id, role: 'user', createdAt, text: id });

const dayRows = (rows) => rows.filter((row) => row.kind === 'day').map((row) => row.label);

test('day labels name today, yesterday and older days without inventing dates', () => {
  assert.deepEqual(describeMessageDay(at(2026, 9, 18, 8, 5), NOW), { key: '2026-09-18', label: 'Today' });
  assert.deepEqual(describeMessageDay(at(2026, 9, 17, 23, 58), NOW), { key: '2026-09-17', label: 'Yesterday' });
  // 同年不写年份，跨年才补——和元素里 month:'short' / day:'numeric' 的写法同族。
  assert.deepEqual(describeMessageDay(at(2026, 9, 16), NOW), { key: '2026-09-16', label: 'Sep 16' });
  assert.deepEqual(describeMessageDay(at(2026, 1, 3), NOW), { key: '2026-01-03', label: 'Jan 3' });
  assert.deepEqual(describeMessageDay(at(2025, 12, 31), NOW), { key: '2025-12-31', label: 'Dec 31, 2025' });
  // 跨年的「昨天」仍然是 Yesterday。
  assert.deepEqual(describeMessageDay(at(2025, 12, 31, 20, 0), at(2026, 1, 1, 9, 0)), { key: '2025-12-31', label: 'Yesterday' });
  // Date 对象也认。
  assert.deepEqual(describeMessageDay(new Date(at(2026, 9, 18, 12, 0)), NOW).label, 'Today');
});

test('junk timestamps produce no day at all instead of a made-up one', () => {
  assert.equal(describeMessageDay(undefined, NOW), null);
  assert.equal(describeMessageDay(null, NOW), null);
  assert.equal(describeMessageDay(0, NOW), null);
  assert.equal(describeMessageDay('', NOW), null);
  assert.equal(describeMessageDay('not a time', NOW), null);
  assert.equal(describeMessageDay(NaN, NOW), null);
});

test('a header appears only when the day changes, and the first row always gets one', () => {
  const rows = withDaySeparators([
    message('a', at(2026, 9, 18, 9, 0)),
    message('b', at(2026, 9, 18, 9, 30)),
    message('c', at(2026, 9, 17, 22, 0)),
    message('d', at(2026, 9, 17, 22, 40)),
    message('e', at(2026, 9, 16, 8, 0)),
  ], NOW);

  assert.deepEqual(dayRows(rows), ['Today', 'Yesterday', 'Sep 16']);
  // 头永远在它那一天的第一条消息前面，消息顺序原样保留。
  assert.deepEqual(rows.map((row) => row.kind === 'day' ? `[${row.label}]` : row.id),
    ['[Today]', 'a', 'b', '[Yesterday]', 'c', 'd', '[Sep 16]', 'e']);
});

test('a header appears the moment the local day - not the UTC day - changes', () => {
  const rows = withDaySeparators([
    message('late', at(2026, 9, 18, 23, 59)),
    message('early', at(2026, 9, 19, 0, 1)),
  ], NOW);
  assert.deepEqual(dayRows(rows), ['Today', 'Sep 19']);
});

test('out-of-order timestamps repeat a header instead of merging into the group above', () => {
  const rows = withDaySeparators([
    message('today-1', at(2026, 9, 18, 9, 0)),
    message('yesterday-1', at(2026, 9, 17, 9, 0)),
    message('today-2', at(2026, 9, 18, 10, 30)),
  ], NOW);
  assert.deepEqual(dayRows(rows), ['Today', 'Yesterday', 'Today']);
  assert.equal(rows.filter((row) => row.kind === 'day').length, 3);
});

test('messages without a usable timestamp stay in place without splitting the day group', () => {
  const rows = withDaySeparators([
    message('a', at(2026, 9, 18, 9, 0)),
    message('no-time', undefined),
    message('c', at(2026, 9, 18, 9, 45)),
    message('later', at(2026, 9, 19, 9, 0)),
  ], NOW);
  assert.deepEqual(dayRows(rows), ['Today', 'Sep 19']);
  assert.deepEqual(rows.map((row) => row.kind === 'day' ? `[${row.label}]` : row.id),
    ['[Today]', 'a', 'no-time', 'c', '[Sep 19]', 'later']);
  // 第一行就没时间戳时不插头（不猜它是哪一天）。
  assert.deepEqual(withDaySeparators([message('no-time', undefined)], NOW), [{ id: 'no-time', role: 'user', createdAt: undefined, text: 'no-time' }]);
});

test('the walker keeps the message objects themselves and tolerates a missing list', () => {
  const first = message('a', at(2026, 9, 18, 9, 0));
  const second = message('b', at(2026, 9, 18, 9, 30));
  const rows = withDaySeparators([first, second], NOW);
  // React.memo 靠对象身份复用时序：这里只加头，不改写消息（历史消息不因插头重渲染）。
  assert.equal(rows[1], first);
  assert.equal(rows[2], second);
  assert.deepEqual(withDaySeparators(null, NOW), []);
  assert.deepEqual(withDaySeparators(undefined, NOW), []);
});
