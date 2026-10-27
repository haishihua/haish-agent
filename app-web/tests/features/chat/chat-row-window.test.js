import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_ROW_WINDOW_INITIAL,
  CHAT_ROW_WINDOW_MEMORY,
  CHAT_ROW_WINDOW_PAGE,
  CHAT_ROW_WINDOW_TRIGGER_PX,
  clampRowWindow,
  growRowWindow,
  recallRowWindow,
  rememberRowWindow,
  rowWindowCovering,
  shouldGrowRowWindow,
  visiblePendingTaskIdsIn,
  windowRows,
} from '../../../src/features/chat/model/chat-row-window.js';

const rows = (total) => Array.from({ length: total }, (_, index) => ({ id: `row-${index}` }));

test('the first paint keeps the newest rows and drops the rest', () => {
  const all = rows(346);
  const first = windowRows(all, CHAT_ROW_WINDOW_INITIAL);
  assert.equal(first.length, CHAT_ROW_WINDOW_INITIAL);
  // 最新的那条必须在窗口里：窗口是「最近 N 行」，不是「最前面 N 行」。
  assert.equal(first.at(-1), all.at(-1));
  assert.equal(first[0], all[346 - CHAT_ROW_WINDOW_INITIAL]);
});

test('a window that already covers everything hands back the same array', () => {
  const all = rows(10);
  assert.equal(windowRows(all, CHAT_ROW_WINDOW_INITIAL), all);
  assert.equal(windowRows(all, Number.POSITIVE_INFINITY), all);
});

test('jumping to a row outside the window covers exactly that row', () => {
  // 窗口只盖尾部，所以「盖住第 index 行」= 从尾往前数到它（60 行里第 7 行 → 53）。
  assert.equal(rowWindowCovering(7, 60), 53);
  assert.equal(rowWindowCovering(59, 60), 1);
  assert.equal(rowWindowCovering(0, 346), 346);
  assert.equal(rowWindowCovering(200, 346), 146);
  // 目标不存在/拿不到行号时不自作主张：回到全量，而不是缩成空窗口。
  assert.equal(rowWindowCovering(-1, 346), 346);
  assert.equal(rowWindowCovering(Number.NaN, 346), 346);
  assert.equal(rowWindowCovering(0, 0), 0);
  assert.equal(rowWindowCovering(3, rows(60)), 57);
  // 盖住的窗口一定包含目标行：这是批注/搜索跳转的前提。
  for (const index of [0, 1, 23, 24, 345]) {
    const covered = windowRows(rows(346), rowWindowCovering(index, 346));
    assert.ok(covered.some((row) => row.id === `row-${index}`), `window must cover row ${index}`);
  }
});

test('scrolling up grows the window one page at a time and stops at the top', () => {
  assert.equal(growRowWindow(CHAT_ROW_WINDOW_INITIAL, 346), CHAT_ROW_WINDOW_INITIAL + CHAT_ROW_WINDOW_PAGE);
  // 一页一页补：不是一次跳到全量，也不是卡在最后一行不动。
  assert.equal(growRowWindow(300, 346), 324);
  assert.equal(growRowWindow(324, 346), 346);
  assert.equal(growRowWindow(346, 346), 346);
  const grown = windowRows(rows(346), growRowWindow(CHAT_ROW_WINDOW_INITIAL, 346));
  assert.equal(grown.length, CHAT_ROW_WINDOW_INITIAL + CHAT_ROW_WINDOW_PAGE);
});

test('broken counts never leak into the window maths', () => {
  assert.equal(clampRowWindow(-5, 10), 0);
  assert.equal(clampRowWindow(4.7, 10), 4);
  assert.equal(clampRowWindow(80, 10), 10);
  assert.equal(clampRowWindow(Number.NaN, 10), 10);
  assert.equal(clampRowWindow(Number.POSITIVE_INFINITY, 10), 10);
  assert.equal(windowRows(rows(10), Number.NaN).length, 10);
  assert.equal(growRowWindow(Number.NaN, 10), 10);
});

test('the grow trigger fires before the list hits the wall', () => {
  assert.equal(shouldGrowRowWindow(0), true);
  assert.equal(shouldGrowRowWindow(CHAT_ROW_WINDOW_TRIGGER_PX), true);
  assert.equal(shouldGrowRowWindow(CHAT_ROW_WINDOW_TRIGGER_PX + 1), false);
  assert.equal(shouldGrowRowWindow(Number.NaN), false);
  assert.equal(shouldGrowRowWindow(0, 12), true);
  assert.equal(shouldGrowRowWindow(13, 12), false);
});

test('the window position survives a conversation switch, bounded by memory slots', () => {
  const memory = new Map();
  rememberRowWindow(memory, 'conversation-a', 72);
  assert.equal(recallRowWindow(memory, 'conversation-a'), 72);
  // 没记过的会话（或坏值）回到首屏窗口，而不是空窗口。
  assert.equal(recallRowWindow(memory, 'conversation-b'), CHAT_ROW_WINDOW_INITIAL);
  assert.equal(recallRowWindow(memory, ''), CHAT_ROW_WINDOW_INITIAL);
  rememberRowWindow(memory, 'conversation-a', Number.NaN);
  assert.equal(recallRowWindow(memory, 'conversation-a'), CHAT_ROW_WINDOW_INITIAL);
  for (let index = 0; index < CHAT_ROW_WINDOW_MEMORY + 3; index += 1) {
    rememberRowWindow(memory, `conversation-${index}`, CHAT_ROW_WINDOW_INITIAL * (index + 1));
  }
  assert.equal(memory.size, CHAT_ROW_WINDOW_MEMORY);
  // 最近用过的在，最早的被挤掉。
  assert.equal(recallRowWindow(memory, `conversation-${CHAT_ROW_WINDOW_MEMORY + 2}`), CHAT_ROW_WINDOW_INITIAL * (CHAT_ROW_WINDOW_MEMORY + 3));
  assert.equal(recallRowWindow(memory, 'conversation-0'), CHAT_ROW_WINDOW_INITIAL);
  assert.equal(recallRowWindow(null, 'conversation-a'), CHAT_ROW_WINDOW_INITIAL);
});

// 回拉的对象是「视口里那几行还没补水的任务」：探测器要把「可见/预读区/已 hydration」
// 和「隐藏的上一会话行组」分清楚，否则又会变成整条队列扫一遍。
const fakeContainer = (rows) => ({
  querySelectorAll: () => rows.map((row) => ({
    dataset: { messageId: row.messageId },
    getClientRects: () => (row.hidden ? [] : [{}]),
    getBoundingClientRect: () => ({ top: row.top, bottom: row.top + row.height }),
  })),
});
const viewport = { top: 100, bottom: 500 };
const taskIdByRowId = new Map([
  ['m-above', 'task-above'], ['m-visible', 'task-visible'], ['m-lookahead', 'task-lookahead'],
  ['m-below', 'task-below'], ['m-hidden', 'task-hidden'], ['m-no-task', ''],
]);

test('only the pending rows at the viewport are requested, top to bottom', () => {
  const container = fakeContainer([
    { messageId: 'm-above', top: -200, height: 80 },
    { messageId: 'm-visible', top: 120, height: 80 },
    { messageId: 'm-lookahead', top: 520, height: 80 },
    { messageId: 'm-below', top: 900, height: 80 },
    { messageId: 'm-hidden', top: 120, height: 80, hidden: true },
    { messageId: 'm-no-task', top: 200, height: 80 },
  ]);
  assert.deepEqual(visiblePendingTaskIdsIn(container, viewport, taskIdByRowId, 160),
    ['task-visible', 'task-lookahead']);
  // 没有预读区时，只有真的在视口里的那行。
  assert.deepEqual(visiblePendingTaskIdsIn(container, viewport, taskIdByRowId, 0), ['task-visible']);
});

test('the pending-row probe survives missing rows and missing lookups', () => {
  assert.deepEqual(visiblePendingTaskIdsIn(null, viewport, taskIdByRowId), []);
  assert.deepEqual(visiblePendingTaskIdsIn(fakeContainer([]), viewport, taskIdByRowId), []);
  assert.deepEqual(visiblePendingTaskIdsIn(fakeContainer([{ messageId: 'm-visible', top: 120, height: 80 }]), viewport, null), []);
  // 重复任务（同一任务的多个行）只请求一次。
  const duplicate = fakeContainer([
    { messageId: 'm-visible', top: 120, height: 80 },
    { messageId: 'm-visible', top: 200, height: 80 },
  ]);
  assert.deepEqual(visiblePendingTaskIdsIn(duplicate, viewport, taskIdByRowId), ['task-visible']);
});
