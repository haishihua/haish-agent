import test from 'node:test';
import assert from 'node:assert/strict';

const { conversationContentLoading } = await import('../../../src/features/chat/model/conversation-loading.js');

// 会话刚打开：这份时间线是工作区快照搭的（只有标题和状态），正文要等会话详情 + 任务运行
// 记录。这一窗口整段会话在正中间占位一次，而不是每一轮助手气泡各转一个圈。
const snapshot = (overrides = {}) => ({
  shellSeeded: true,
  rowCount: 4,
  draft: false,
  error: '',
  ...overrides,
});

test('a snapshot-only conversation with turns loads as one block', () => {
  assert.equal(conversationContentLoading(snapshot()), true);
  assert.equal(conversationContentLoading(snapshot({ rowCount: 1 })), true);
});

test('a hydrated conversation never shows the placeholder', () => {
  assert.equal(
    conversationContentLoading(snapshot({ shellSeeded: false })),
    false,
    '运行记录已经到位的会话自己会渲染正文，不需要整块占位',
  );
});

test('a conversation without turns keeps its empty state', () => {
  // 服务端刚建出来、还没说话的会话就是这一条：没有正文可等，别拿加载动画盖住空态。
  assert.equal(conversationContentLoading(snapshot({ rowCount: 0 })), false);
});

test('a local draft has no server detail to fetch', () => {
  assert.equal(conversationContentLoading(snapshot({ draft: true })), false);
});

test('a failed detail fetch leaves the error surface in charge', () => {
  assert.equal(
    conversationContentLoading(snapshot({ error: 'conversation load failed: 500' })),
    false,
    '拉详情失败时错误提示负责这块区域，不能再转一颗永远停不下来的 Loader',
  );
});

test('missing input never renders a placeholder', () => {
  assert.equal(conversationContentLoading(), false);
  assert.equal(conversationContentLoading({}), false);
});
