import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panelSource = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatPanel.jsx', import.meta.url),
  'utf8',
);
const markdownSource = fs.readFileSync(
  new URL('../../src/shared/ui/Markdown.jsx', import.meta.url),
  'utf8',
);
const deferredSource = fs.readFileSync(
  new URL('../../src/shared/ui/deferred-code-block.jsx', import.meta.url),
  'utf8',
);
const chatCss = fs.readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');

function cssBlock(source, selector) {
  const start = source.indexOf(selector);
  assert.ok(start >= 0, `missing rule: ${selector}`);
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source.slice(open, close + 1);
}

test('the message list renders a window of rows, not the whole conversation', () => {
  // 346 行的会话切换时曾经把全部正文一次性挂上去（≈1s 解析 + 几百次代码高亮），
  // 而屏幕上只看得到最后一屏。窗口把这段成本改成按页支付。
  assert.match(panelSource, /const \[rowWindow, setRowWindow\] = React\.useState\(CHAT_ROW_WINDOW_INITIAL\);/);
  assert.match(panelSource, /const windowedRows = React\.useMemo\(\n\s*\(\) => \(searchActive \? listRows : windowRows\(listRows, rowWindow\)\),/);
  assert.match(panelSource, /const hasEarlierRows = !searchActive && windowedRows\.length < listRows\.length;/);
  // 全量 messages 仍然是批注与「最后一轮才能重试/编辑」的判据：窗口只动渲染。
  assert.match(panelSource, /createAnnotationMessageSelector\(\)/);
  assert.match(panelSource, /row\.taskId === group\.lastTaskId/);
});

test('scrolling to the top pages rows in and keeps the reading position', () => {
  assert.match(panelSource, /if \(hasEarlierRows && shouldGrowRowWindow\(element\.scrollTop, CHAT_ROW_WINDOW_TRIGGER_PX\)\) growEarlierRows\(\);/);
  // 一次滚动会连发好几个事件（上一页还没提交）：只放一页在路上，不然一次就补掉好几页。
  assert.match(panelSource, /const target = pendingGrowthRef\.current \|\| growRowWindow\(rowWindow, listRows\.length\);\n\s*if \(target <= rowWindow\) return;\n\s*pendingGrowthRef\.current = target;\n\s*captureRowAnchor\(\);\n\s*setRowWindow\(target\);/);
  assert.match(panelSource, /React\.useLayoutEffect\(\(\) => \{\n\s*pendingGrowthRef\.current = 0;\n\s*\}, \[rowWindow\]\);/);
  // 补页把行插在上面：锚点行按原来的屏幕位置放回去；贴着底部时不记锚点（自动跟随负责）。
  assert.match(panelSource, /element\.scrollHeight - element\.scrollTop - element\.clientHeight <= 4\) return;/);
  assert.match(panelSource, /\.find\(\(row\) => row\.getClientRects\(\)\.length && row\.getBoundingClientRect\(\)\.bottom > viewportTop \+ 1\);/);
  assert.match(panelSource, /element\.scrollTop \+= \(anchor\.node\.getBoundingClientRect\(\)\.top - viewportTop\) - anchor\.offset;/);
  // 窗口比视口还矮时继续补，否则列表滚不动、永远触发不了补页。
  assert.match(panelSource, /element\.scrollHeight <= element\.clientHeight \+ CHAT_ROW_WINDOW_TRIGGER_PX\) growEarlierRows\(\);/);
  // 键盘用户也有入口。
  assert.match(panelSource, /className="chat-earlier-rows" role="status"/);
  assert.match(panelSource, /<button type="button" onClick=\{growEarlierRows\}>Load earlier messages<\/button>/);
});

test('leaving a conversation keeps its rendered rows alive for the trip back', () => {
  // 切回来不该重新解析窗口里的正文：离开的那组带着 hidden 留在原地，同一个组件、
  // 同一个 key，React 复用 fiber 与 DOM。
  assert.match(panelSource, /if \(leavingGroup && leavingGroup\.conversationId !== conversationId\) \{/);
  assert.match(panelSource, /rememberRowWindow\(rowWindowMemoryRef\.current, leavingGroup\.conversationId, leavingGroup\.count\);/);
  assert.match(panelSource, /setKeptGroup\(leavingGroup\);\n\s*setRowWindow\(recallRowWindow\(rowWindowMemoryRef\.current, conversationId\)\);/);
  assert.match(panelSource, /const ChatRowGroup = React\.memo\(function ChatRowGroup\(\{ group, hidden = false \}\) \{/);
  assert.match(panelSource, /\{keptGroup \? <ChatRowGroup key=\{keptGroup\.conversationId\} group=\{keptGroup\} hidden \/> : null\}/);
  assert.match(panelSource, /\) : messages\.length === 0 \? \(/);
  assert.match(panelSource, /\) : <ChatRowGroup key=\{liveGroup\.conversationId\} group=\{liveGroup\} \/>\}/);
  // 留在原地的那组必须真的不参与布局，也不进「在会话里查找」的正文扫描，也不给
  // 执行记录分页当「可见的待补行」。
  assert.match(panelSource, /hidden=\{hidden\} aria-hidden=\{hidden \? 'true' : undefined\}/);
  assert.match(panelSource, /if \(!row\.getClientRects\(\)\.length\) return false;/);
  assert.match(chatCss, /\.chat-row-group\[hidden\] \{\n\s*display: none;/);
  const groupRule = cssBlock(chatCss, '.chat-row-group {');
  assert.match(groupRule, /display: flex;/);
  assert.match(groupRule, /flex-direction: column;/);
  // 和列表本身的间距一致，否则窗口化会顺手改掉整页的行距。
  assert.match(groupRule, /gap: 15px;/);
});

test('code blocks only ask for highlighting when they reach the viewport', () => {
  // streamdown 的代码块 body 在 useEffect 里调 highlight()，和可见性无关：497 个块
  // 会在挂载那一帧全部跑一遍 shiki 分词。门加在 `pre` 这一层，块级代码先占位。
  assert.match(markdownSource, /const MARKDOWN_COMPONENTS = \{ pre: MarkdownBlockCode \};/);
  assert.match(markdownSource, /components=\{MARKDOWN_COMPONENTS\}/);
  assert.match(deferredSource, /export function MarkdownBlockCode\(\{ children \}\) \{/);
  assert.match(deferredSource, /React\.cloneElement\(children, \{ 'data-block': 'true' \}\)/);
  assert.match(deferredSource, /const observer = new IntersectionObserver\(\(entries\) => \{/);
  assert.match(deferredSource, /rootMargin: `\$\{revealMargin\}px 0px \$\{revealMargin\}px 0px`/);
  assert.match(deferredSource, /observer\.disconnect\(\);\n\s*setRevealed\(true\);/);
  // 没等到视口就渲染等高占位（同一个容器/头 + 纯文本正文），并留出可断言的标记。
  assert.match(deferredSource, /data-deferred-code=""/);
  assert.match(deferredSource, /data-deferred-code-body=""/);
  assert.match(deferredSource, /if \(revealed\) return children;/);
  // 行内代码、没有原文的块原样走，不被这一层碰到。
  assert.match(deferredSource, /if \(!React\.isValidElement\(children\)\) return children;/);
  assert.match(deferredSource, /if \(!code\) return block;/);
});

test('a comment on a turn outside the window pages that turn in before jumping', () => {
  // 批注引用的是正文里的某一段：窗口化之后那段可能在窗口外，MessageAnnotations 只
  // 看 DOM，跳转前必须先把窗口一次补到盖住目标行（找不到就照旧）。
  assert.match(panelSource, /rowWindowCovering, shouldGrowRowWindow, windowRows \} from '\.\.\/model\/chat-row-window\.js';/);
  assert.match(panelSource, /const needed = index >= 0 \? rowWindowCovering\(index, listRows\.length\) : 0;/);
  assert.match(panelSource, /if \(needed > rowWindow\) \{\n\s*pendingAnnotationRef\.current = \(\) => action\(item\);\n\s*setRowWindow\(needed\);/);
  assert.match(panelSource, /const pending = pendingAnnotationRef\.current;\n\s*if \(!pending\) return;\n\s*pendingAnnotationRef\.current = null;\n\s*pending\(\);/);
  assert.match(panelSource, /const jumpToAnnotation = React\.useCallback\(\(item\) => runAnnotationAction\(item, \(target\) => annotationUiRef\.current\?\.jump\(target\)\), \[runAnnotationAction\]\);/);
  assert.match(panelSource, /const editAnnotation = React\.useCallback\(\(item\) => runAnnotationAction\(item, \(target\) => annotationUiRef\.current\?\.edit\(target\)\), \[runAnnotationAction\]\);/);
});

test('the new window affordance follows the house interaction rules', () => {
  const hoverRule = chatCss.slice(chatCss.indexOf('.chat-earlier-rows button {'), chatCss.indexOf('.chat-row-group {'));
  assert.ok(hoverRule.length > 0, 'the earlier-rows affordance styles must exist');
  assert.match(hoverRule, /@media \(hover: hover\) and \(pointer: fine\) \{/);
  assert.match(hoverRule, /\.chat-earlier-rows button:active \{/);
  assert.match(hoverRule, /\.chat-earlier-rows button:focus-visible \{\n\s*box-shadow:/);
  assert.match(hoverRule, /@media \(prefers-reduced-motion: reduce\) \{/);
  assert.doesNotMatch(hoverRule, /transition: all/);
  assert.doesNotMatch(hoverRule, /var\(--gold\)/);
});
