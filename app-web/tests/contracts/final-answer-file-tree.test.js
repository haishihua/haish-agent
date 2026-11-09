import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const row = readFileSync(new URL('../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url), 'utf8');
const rows = readFileSync(new URL('../../src/features/app/model/chat-rows.js', import.meta.url), 'utf8');
const element = readFileSync(new URL('../../src/shared/ui/agent-elements/FileTree.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../src/shared/ui/agent-elements/file-tree.css', import.meta.url), 'utf8');
const chatStyles = readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');

test('the file tree sits after the final answer inside the same bubble', () => {
  assert.match(row, /import \{ FileTree \} from '\.\.\/\.\.\/\.\.\/shared\/ui\/agent-elements\/FileTree\.jsx';/);
  const answerIndex = row.indexOf('<FinalAnswerMarkdown');
  const treeIndex = row.indexOf('<FileTree');
  assert.ok(answerIndex > 0, 'the final answer still renders');
  assert.ok(treeIndex > answerIndex, 'the tree must come after the answer, not before it');
  // 两者都在 message-speech-body 里：树是回答的补充，不是气泡外的独立块。
  const bodyIndex = row.indexOf('message-speech-body');
  assert.ok(bodyIndex < answerIndex && answerIndex < treeIndex);
});

test('a turn that changed no file renders nothing at all', () => {
  assert.match(row, /const changedFiles = isAgent \? message\.changedFiles : null;/);
  assert.match(row, /&& changedFiles\.count > 0/);
  assert.match(row, /&& Array\.isArray\(changedFiles\.nodes\)/);
  assert.match(row, /\{showChangedFiles \? \(/);
  // 元素自身也没有空态：拿到空 nodes 直接不渲染。
  assert.match(element, /const rows = Array\.isArray\(nodes\) \? nodes : \[\];/);
  assert.match(element, /if \(!rows\.length\) return null;/);
});

test('the tree cannot appear while the answer is still streaming', () => {
  const gate = row.match(/const showChangedFiles = Boolean\(([\s\S]*?)\);/)?.[1] || '';
  assert.match(gate, /!message\.streaming/);
});

test('the bubble hands the element rows plus the run totals', () => {
  assert.match(row, /nodes=\{changedFiles\.nodes\}/);
  assert.match(row, /visibleCount=\{changedFiles\.nodes\.length\}/);
  assert.match(row, /totalAdditions=\{changedFiles\.totalAdditions\}/);
  assert.match(row, /totalDeletions=\{changedFiles\.totalDeletions\}/);
  // 行由任务折叠出来，行投影不能自己拼树。
  assert.match(rows, /changedFiles: changedFilesForTask\(task\)/);
});

test('the element keeps the official anatomy: header count, totals, indented rows', () => {
  assert.match(element, /data-slot="file-tree"/);
  assert.match(element, /1 file changed' : `\$\{fileCount\} files changed`/);
  // 官方缩进：0.25rem 起步，每深一层 +0.85rem。
  assert.match(element, /paddingInlineStart: `\$\{0\.25 \+ indent \* 0\.85\}rem`/);
  // 官方行是纯 div（没有 list 语义、不可聚焦）；本文只在目录行里加一层可点的 button。
  assert.doesNotMatch(element, /role="list"/);
  assert.doesNotMatch(element, /role="listitem"/);
  assert.doesNotMatch(element, /tabIndex=/);
  // 头部提供折叠箭头、计数和合计；合计始终画（哪怕是 0）。
  assert.match(element, /<span className="aui-file-tree-added">\+\{additions\}<\/span>/);
  assert.match(element, /<span className="aui-file-tree-removed">−\{deletions\}<\/span>/);
  assert.match(element, /className="aui-file-tree-chevron aui-file-tree-header-chevron"/);
  // 目录行不带增删行数，文件行才有。
  assert.match(element, /className="aui-file-tree-counts"/);
  assert.match(element, /<ChevronDown className="aui-file-tree-chevron" size=\{12\}/);
  // 保留行的缩进和圆角，卡片间距按实际使用调整。
  assert.match(styles, /gap: 8px;/);
  assert.match(styles, /padding: 2px 8px;/);
  assert.match(styles, /border-radius: 16px;/);
  assert.match(styles, /\.aui-file-tree-row \{\n {2}display: flex;\n {2}align-items: center;\n {2}gap: 8px;\n {2}min-width: 0;\n {2}padding: 4px;/);
  assert.match(styles, /\.aui-file-tree-row\.is-file \.aui-file-tree-icon \{\n {2}margin-inline-start: 12px;/);
  assert.match(styles, /\.aui-file-tree-counts \{\n {2}flex: none;\n {2}font-size: 13px;/);
  // 头部没有悬停底色，标题和明细之间保持紧凑。
  assert.match(styles, /gap: 2px;/);
  assert.match(styles, /padding: 3px 6px;/);
  assert.doesNotMatch(styles, /\.aui-file-tree-header:hover\s*\{/);
  assert.match(styles, /\.aui-file-tree\[data-open="false"\] \.aui-file-tree-header-chevron \{\n {2}transform: rotate\(-90deg\);/);
  assert.match(styles, /color: rgb\(143 183 255 \/ 70%\);/);
});

test('the whole tree arrives folded, and every folder folds on its own', () => {
  // 默认收起：折叠状态只由点击切换，不再按文件数决定。
  assert.match(element, /const \[open, setOpen\] = useState\(\(\) => \(defaultOpen === undefined \? false : Boolean\(defaultOpen\)\)\);/);
  assert.ok(!element.includes('COLLAPSE_ABOVE'));
  assert.match(element, /aria-expanded=\{open\}/);
  assert.match(element, /hidden=\{!open\}/);
  assert.match(element, /data-open=\{open \? 'true' : 'false'\}/);
  // 头部整行就是开关（官方这行是静态 div）。
  assert.match(element, /className="aui-file-tree-header"\n {8}aria-expanded=\{open\}/);
  // 目录行自己也是开关：被收起的目录，子行一起 hidden。
  assert.match(element, /const \[collapsedDirs, setCollapsedDirs\] = useState\(\(\) => new Set\(\)\);/);
  assert.match(element, /className="aui-file-tree-folder"\n {10}aria-expanded=\{expanded\}/);
  assert.match(element, /hidden=\{\[\.\.\.collapsedDirs\]\.some\(\(dir\) => node\.path\.startsWith\(`\$\{dir\}\/`\)\)\}/);
  assert.match(styles, /\.aui-file-tree-rows\[hidden\],\n\.aui-file-tree-row\[hidden\] \{\n {2}display: none;/);
  assert.match(styles, /\.aui-file-tree-folder\[aria-expanded="false"\] \.aui-file-tree-chevron \{\n {2}transform: rotate\(-90deg\);/);
  // 收起时只剩头部那一条：头部默认不描底（不预设高亮），只有悬停才亮。
  const headerBlock = styles.match(/\.aui-file-tree-header \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(headerBlock, /background: none;/);
});

test('hovering a row pins a path card to that row', () => {
  // 原生 title 会飘、不能选中，换成自绘的路径卡。
  assert.ok(!element.includes('title={rowLabel'));
  assert.match(element, /onMouseEnter: \(event\) => onTip\(node, event\.currentTarget\)/);
  assert.match(element, /createPortal\(/);
  assert.match(element, /role="tooltip"/);
  assert.match(element, /className="aui-file-tree-tip-path">\{tip\.path\}/);
  // 固定 140ms 才亮、480ms 后才收。
  assert.match(element, /const TIP_SHOW_DELAY = 140;/);
  assert.match(element, /const TIP_HIDE_DELAY = 480;/);
  assert.match(element, /onMouseEnter=\{keepTip\}/);
  // 只有路径：不加复制按钮、不碰剪贴板。
  assert.ok(!element.includes('clipboard'));
  assert.ok(!element.includes('复制路径'));
  assert.doesNotMatch(styles, /\.aui-file-tree-tip-copy/);
  // 卡片是 fixed 定位，页面一滚就收（否则会停在别的文件上）。
  assert.match(element, /const rect = element\.getBoundingClientRect\(\);/);
  assert.match(element, /addEventListener\('scroll', hide, true\)/);
  assert.match(styles, /\.aui-file-tree-tip \{\n {2}position: fixed;/);
  assert.match(element, /element\.closest\('\[data-slot="file-tree"\]'\)/);
  assert.match(element, /rightSpace >= 160 \? 'right' : leftSpace >= 160 \? 'left' : 'outside'/);
  assert.match(element, /useLayoutEffect\(/);
  assert.match(styles, /user-select: text;/);
});

test('the tree takes the width and the font of the answer text', () => {
  // 宽度：width:0 让树不参与气泡的 max-content 计算（长绝对路径不许把气泡撑宽），
  // min-width:100% 再把它拉满正文盒宽——右边缘与 .chat-bubble-text 对齐。
  assert.match(styles, /\.aui-file-tree \{\n {2}box-sizing: border-box;\n(?:.*\n)*? {2}width: 0;\n {2}min-width: 100%;/);
  // 官方 max-w-sm 会把树卡在 384px，跟「宽度 = 正文宽度」冲突，这里刻意不带。
  assert.doesNotMatch(styles, /max-width: 24rem/);
  // 字体：跟正文同一套（.chat-bubble-text 也是 var(--conversation-font)），不再另用等宽字体。
  assert.match(styles, /font-family: var\(--conversation-font/);
  assert.doesNotMatch(styles, /font-family: ui-monospace/);
  assert.match(chatStyles, /\.chat-bubble-text \{\n(?:.*\n)*? {4}font-family: var\(--conversation-font\);/);
  // 正文只有一行时气泡有底线宽度，不至于把树压成一条缝。
  assert.match(chatStyles, /\.chat-message-row\.agent \.chat-bubble:has\(\[data-slot="file-tree"\]\) \{\n {4}min-width: min\(100%, 22rem\);/);
});

test('motion is scoped and disabled when the reader asks for less of it', () => {
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{/);
  assert.match(styles, /\.aui-file-tree-row \{\n {2}display: flex;/);
  // 深色主题：增绿减红用官方 emerald-400 / red-400，跟参考元素同一个绿红。
  assert.match(styles, /\.aui-file-tree-added \{\n {2}color: #34d399;/);
  assert.match(styles, /\.aui-file-tree-removed \{\n {2}color: #f87171;/);
});
