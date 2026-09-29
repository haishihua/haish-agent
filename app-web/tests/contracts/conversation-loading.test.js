import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Regression: 会话刚打开时，时间线先用工作区快照搭出来（只有标题和状态），正文要等会话详情 +
// 任务运行记录。这一窗口最早是逐行渲染的（用户气泡都显示了，助手那一轮各自空着），后来改成
// 每一轮助手气泡各转一个圈（`Loading answer…`）——用户要的是「会话详情正中间 loading 一个，
// loading 完再展示用户和 assistant 消息」。现在正文没到是会话级的一次加载：整段会话在消息区
// 正中间用一颗共享 Loader 占位（判据见 features/chat/model/conversation-loading.js），正文到了
// 行才一次性铺开。
//
// 几何断言（占位真的落在正中、加载期间一行都没有）在同名浏览器夹具里按实测锁住
// （`tests/fixtures/chat-conversation-loading.*`），这里只锁源码形状。
const appShell = readFileSync(new URL('../../src/features/app/AppShell.jsx', import.meta.url), 'utf8');
const chatPanel = readFileSync(new URL('../../src/features/chat/components/ChatPanel.jsx', import.meta.url), 'utf8');
const messageRow = readFileSync(new URL('../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url), 'utf8');
const chatStyles = readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');
const fixtureHtml = readFileSync(new URL('../fixtures/chat-conversation-loading.html', import.meta.url), 'utf8');
const fixtureModule = readFileSync(new URL('../fixtures/chat-conversation-loading.jsx', import.meta.url), 'utf8');

test('the conversation-level loading flag comes from one predicate', () => {
  assert.match(
    appShell,
    /import \{ conversationContentLoading \} from '\.\.\/chat\/model\/conversation-loading\.js';/,
  );
  assert.match(appShell, /const conversationLoading = conversationContentLoading\(\{/);
  assert.match(appShell, /^\s+shellSeeded,$/m);
  assert.match(appShell, /^\s+rowCount: chatMessages\.length,$/m);
  assert.match(appShell, /^\s+draft: Boolean\(draftConversationRef\.current\),$/m);
  assert.match(appShell, /^\s+error: conversationError,$/m);
  assert.match(appShell, /loading=\{conversationLoading\}/, '面板要拿到这个判据');
});

test('the placeholder is conversation-level, not per assistant bubble', () => {
  // 行里不再带「这一轮缺正文」的标志，气泡也不各自转圈。
  assert.doesNotMatch(appShell, /answerPending/);
  assert.doesNotMatch(messageRow, /answerPending/);
  assert.doesNotMatch(messageRow, /chat-bubble-answer-pending/);
  assert.doesNotMatch(chatStyles, /chat-bubble-answer-pending/, '逐行占位的样式已经删掉');
});

test('the panel renders one centered loader instead of the rows while loading', () => {
  assert.match(chatPanel, /^ {2}loading = false,$/m, 'flag 只能从外面进来，面板自己判断不了');
  assert.equal(chatPanel.match(/className="chat-conversation-loading"/g)?.length, 1, 'Loader 只有一处');
  assert.match(
    chatPanel,
    /loading \? \(\n\s+<div className="chat-conversation-loading" role="status">\n\s+<LoadingState label="Loading conversation…" \/>\n\s+<\/div>\n\s+\) : messages\.length === 0 \? \(/,
    '加载分支要替掉空态与行组',
  );
  assert.match(
    chatPanel,
    /import \{ LoadingState \} from '\.\.\/\.\.\/\.\.\/shared\/ui\/agent-elements\/LoadingState\.jsx';/,
  );
  // 动画只有一份实现：面板复用共享 Loader，不自己搭点阵。
  assert.doesNotMatch(chatPanel, /aui-loader/);
  // 加载期间「↑ 回到底部」和两条分页提示都不该抢镜。
  assert.match(chatPanel, /\{!loading && messages\.length > 0 && \(earlierTaskRuntimesPending/);
  assert.match(chatPanel, /\{!loading && hasEarlierRows \? \(/);
  assert.match(chatPanel, /\{!loading && messages\.length > 0 \? \(\n\s+<ScrollToBottomButton/);
  // 列表里没有可读的行：滚动触发的补页 / 分页在这一窗口不启动。
  assert.match(chatPanel, /if \(loading\) return;/);
});

test('the placeholder is centered in the message column without a fixed box', () => {
  const rule = chatStyles.match(/\.chat-conversation-loading\s*\{([^}]*)\}/);
  assert.ok(rule, '占位需要一个样式规则');
  assert.match(rule[1], /margin:\s*auto/, 'auto 外边距把剩余空间分到两侧，占位才落在正中间');
  assert.doesNotMatch(
    rule[1],
    /(?:width|height|display|opacity|animation):/,
    'Loader 的形状 / 节奏由共享样式负责',
  );
});

test('the browser fixture renders the real panel against the real stylesheet', () => {
  assert.match(fixtureHtml, /src="\.\/chat-conversation-loading\.jsx"/, 'fixture HTML must load its module');
  assert.match(
    fixtureModule,
    /import \{ ChatPanel \} from '\.\.\/\.\.\/src\/features\/chat\/components\/ChatPanel\.jsx'/,
    '面板本身要被测，不是重搭一份标记',
  );
  assert.match(fixtureModule, /import '\.\.\/\.\.\/styles\/chat\.css'/, '居中几何需要真实样式表');
  assert.match(fixtureModule, /\[data-slot="generation-loader"\]/, '量的是共享 Loader 本体');
});
