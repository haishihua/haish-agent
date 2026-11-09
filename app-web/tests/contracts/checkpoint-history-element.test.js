import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const element = fs.readFileSync(
  new URL('../../src/shared/ui/agent-elements/CheckpointHistory.jsx', import.meta.url),
  'utf8',
);
const styles = fs.readFileSync(
  new URL('../../src/shared/ui/agent-elements/checkpoint-history.css', import.meta.url),
  'utf8',
);
const timeline = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
  'utf8',
);
const toolView = fs.readFileSync(
  new URL('../../src/features/chat/model/tool-view.js', import.meta.url),
  'utf8',
);
const checkpointView = fs.readFileSync(
  new URL('../../src/features/chat/model/tool-view/checkpoint.js', import.meta.url),
  'utf8',
);

test('checkpoint history vendors the assistant-ui element as scoped markup', () => {
  assert.match(element, /assistant-ui CheckpointHistory（MIT/);
  assert.match(element, /data-slot="checkpoint-history"/);
  assert.match(element, /import '\.\/checkpoint-history\.css';/);
  // 仓库没有 tailwind：官方 cn(...) + paper/mono 的工具类不能带进来。
  assert.doesNotMatch(element, /cn\(/);
  assert.doesNotMatch(element, /className="[^"]*\b(?:rounded-xl|bg-foreground|text-muted-foreground)\b/);
});

test('checkpoint history stays read-only', () => {
  // 桌面端没有 checkpoint IPC：回滚只能由 agent 调 rollback_workspace（走审批），
  // 所以这一版故意不画 Restore 按钮，也不接 onRestore。
  assert.doesNotMatch(element, /<button/);
  assert.doesNotMatch(element, /onRestore/);
  // 也不留原生 title 提示（FileTree 的路径卡就因为飘移被换掉过）。
  assert.doesNotMatch(element, /title=/);
});

test('checkpoint rows keep the official dot / current / ahead states', () => {
  assert.match(styles, /\.aui-checkpoint-row\.is-current \{\n {2}background: rgb\(255 255 255 \/ 5%\);/);
  assert.match(styles, /\.aui-checkpoint-row\.is-ahead \{\n {2}opacity: 0\.4;/);
  assert.match(styles, /\.aui-checkpoint-row\.is-current \.aui-checkpoint-dot \{\n {2}background: rgb\(96 165 250\);/);
  assert.match(styles, /\.aui-checkpoint-row\.is-ahead \.aui-checkpoint-dot \{\n {2}border: 1px solid rgb\(218 221 239 \/ 25%\);/);
  // 标签单行省略、时间列等宽数字。
  assert.match(styles, /\.aui-checkpoint-label \{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;[\s\S]*?\n\}/);
  assert.match(styles, /max-width: 24rem;/);
  assert.match(styles, /\.aui-checkpoint-main \{[^}]*flex-direction: column;/);
  assert.doesNotMatch(styles, /--tw-/);
});

test('only list_checkpoints switches the tool card to the checkpoint list', () => {
  assert.match(toolView, /name === 'list_checkpoints'/);
  assert.match(toolView, /return buildCheckpointToolView\(item\)/);
  assert.match(timeline, /import \{ CheckpointHistory \} from '\.\.\/\.\.\/\.\.\/shared\/ui\/agent-elements\/CheckpointHistory\.jsx';/);
  assert.match(timeline, /if \(view\.mode === 'checkpoints'\) \{/);
  assert.match(timeline, /<CheckpointHistory/);
  // 卡片的可展开性由 body / 行数据决定，否则空态与失败文本点不开。
  assert.match(timeline, /\(Array\.isArray\(view\.checkpoints\) && view\.checkpoints\.length > 0\) \|\|/);
});

test('the checkpoint model layer stays free of components and hooks', () => {
  assert.doesNotMatch(checkpointView, /from 'react'/);
  assert.doesNotMatch(checkpointView, /components\//);
  assert.match(checkpointView, /from '\.\/shared\.js'|from '\.\.\/\.\.\/\.\.\/\.\.\/core\/tool-view-shared\.js'/);
});
