import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ChatMessageRow } from '../../src/features/chat/components/ChatMessageRow.jsx';
import { changedFilesForTask } from '../../src/core/changed-files.js';
import { compactStreamEvents } from '../../src/core/stream-events.js';
import { runtimeEventToLog } from '../../src/core/runtime-events.js';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles.css';

// 五个真实形状的 agent 回答，专门盯住这一版的三件事：
//   1. 整棵树默认收起，点开才铺明细；目录自己还能逐层收放；
//   2. 树的宽度/字体跟正文一致，长绝对路径不把气泡撑宽；
//   3. 行悬停亮出跟住这行的路径卡，可选中、可复制，移开留一段时间再收。
// 页面加载后自动跑一遍断言（window.__fileTreeChecks()），结果写进 #result / #checks。
const edited = (callId, path, additions, deletions) => ({
  type: 'tool_call_completed',
  call_id: callId,
  tool_name: 'edit_file',
  tool_response: {
    status: 'ok',
    result_state: 'resolved',
    subject: { path },
    data: { added_lines: additions, removed_lines: deletions, checkpoint_id: `cp-${callId}` },
  },
});
const read = (callId, path) => ({
  type: 'tool_call_completed',
  call_id: callId,
  tool_name: 'read_file',
  tool_response: { status: 'ok', result_state: 'resolved', subject: { path } },
});

const WORKSPACE = '/Users/zhanruitao/front-end-project/haish-agent';
const LONG_ANSWER = '选中态的金色已换成冷蓝色 `#8fb7ff`：\n\n- **Agent 选择器**：选中行文字 + 右侧对勾都改成蓝色。\n- **Provider / Model 菜单**：选中行、对勾同步改成蓝色。\n\n测试全过，lint 无警告。';

// 10 个文件，全在工作区外（绝对路径）——线上把目录名撑成 /Users/... 的那种形状。
const TEN_FILES = [
  ['c1', `${WORKSPACE}/app-web/src/features/chat/changed-files.js`, 173, 1],
  ['c2', `${WORKSPACE}/app-web/src/shared/ui/agent-elements/FileTree.jsx`, 75, 0],
  ['c3', `${WORKSPACE}/app-web/src/shared/ui/agent-elements/file-tree.css`, 125, 0],
  ['c4', `${WORKSPACE}/app-web/src/features/app/model/chat-rows.js`, 4, 0],
  ['c5', `${WORKSPACE}/app-web/src/features/chat/components/ChatMessageRow.jsx`, 24, 3],
  ['c6', `${WORKSPACE}/app-web/tests/features/chat/changed-files-tree.test.js`, 200, 1],
  ['c7', `${WORKSPACE}/app-web/tests/contracts/final-answer-file-tree.test.js`, 61, 1],
  ['c8', `${WORKSPACE}/app-web/tests/fixtures/file-tree-visual.jsx`, 165, 18],
  ['c9', `${WORKSPACE}/app-web/tests/fixtures/file-tree-visual.html`, 12, 2],
  ['c10', `${WORKSPACE}/app-web/tests/README.md`, 1, 0],
];

// app-web/styles 下三个文件 → 一条可折叠的目录行；另外两个目录各只有一个文件 → 路径并进文件行。
const FIVE_FILES = [
  ['f1', 'app-web/styles/modals.css', 8, 3],
  ['f2', 'app-web/styles/delegation.css', 7, 2],
  ['f3', 'app-web/styles/chat.css', 2, 2],
  ['f4', 'app-web/tests/contracts/picker-selection-color.test.js', 27, 0],
  ['f5', '/tmp/haish-style-review/summary.json', 4, 0],
];

const TURN_MANY = {
  taskId: 'fixture-many',
  title: '文件树接进最终回答',
  status: 'done',
  answerText: LONG_ANSWER,
  eventLog: compactStreamEvents(TEN_FILES.map(([callId, path, added, removed]) => edited(callId, path, added, removed)).map(runtimeEventToLog)),
};

const TURN_FEW = {
  taskId: 'fixture-few',
  title: '选中态的金色换成冷蓝',
  status: 'done',
  answerText: LONG_ANSWER,
  eventLog: compactStreamEvents(FIVE_FILES.map(([callId, path, added, removed]) => edited(callId, path, added, removed)).map(runtimeEventToLog)),
};

const TURN_SHORT = {
  taskId: 'fixture-short',
  title: '一句话回答 + 两个文件',
  status: 'done',
  answerText: '已改好。',
  eventLog: compactStreamEvents([
    edited('s1', 'app-web/styles/chat.css', 3, 1),
    edited('s2', 'app-web/styles/markdown.css', 2, 0),
  ].map(runtimeEventToLog)),
};

// 同样的回答、但没有改任何文件：用来证明树没有把气泡撑宽（两者宽度必须一致）。
const TURN_LONG_NO_TREE = {
  taskId: 'fixture-long-no-tree',
  title: '同一段回答，没改文件',
  status: 'done',
  answerText: LONG_ANSWER,
  eventLog: compactStreamEvents([read('n1', 'app-web/styles/chat.css')].map(runtimeEventToLog)),
};

const TURN_READ_ONLY = {
  taskId: 'fixture-read-only',
  title: '这版样式为什么不用蓝色',
  status: 'done',
  answerText: '因为选中色当时跟金色强调色走，现在已统一到冷蓝。',
  eventLog: compactStreamEvents([
    read('r1', 'app-web/styles/chat.css'),
    read('r2', 'app-web/styles/delegation.css'),
  ].map(runtimeEventToLog)),
};

function rowFrom(task) {
  return {
    id: `${task.taskId}-agent`,
    taskId: task.taskId,
    conversationId: 'fixture-conversation',
    role: 'agent',
    agentName: 'Task Assistant',
    text: task.answerText,
    progressLines: [],
    traceTimeline: [],
    traceHydrated: true,
    changedFiles: changedFilesForTask(task),
    status: task.status,
    streaming: false,
    createdAt: Date.now() - 60_000,
    completedAt: Date.now(),
  };
}

function Fixture() {
  return (
    <AppTooltipProvider>
      <div className="chat-panel" style={{ padding: 24, width: 760, background: '#0a0d15' }}>
        <ChatMessageRow message={rowFrom(TURN_MANY)} />
        <ChatMessageRow message={rowFrom(TURN_FEW)} />
        <ChatMessageRow message={rowFrom(TURN_SHORT)} />
        <ChatMessageRow message={rowFrom(TURN_LONG_NO_TREE)} />
        <ChatMessageRow message={rowFrom(TURN_READ_ONLY)} />
      </div>
    </AppTooltipProvider>
  );
}

// 断言跑在同步提交之后：createRoot().render() 是并发调度，直接查 DOM 会拿到空的。
flushSync(() => createRoot(document.getElementById('root')).render(<Fixture />));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const widthOf = (element) => (element ? element.getBoundingClientRect().width : 0);
const tipPath = () => document.querySelector('.aui-file-tree-tip .aui-file-tree-tip-path')?.textContent || '';
// React 的 onMouseEnter 由 mouseover/mouseout 合成，用 bubbled mouseover 才能触发。
const hover = (element) => element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
const unhover = (element) => element.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));

async function fileTreeChecks() {
  const checks = [];
  const push = (label, ok) => checks.push(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  const bubbles = [...document.querySelectorAll('.chat-message-row.agent')];
  push('五轮 agent 气泡都渲染了', bubbles.length === 5);
  if (bubbles.length !== 5) return checks;
  const [many, few, short, longNoTree, readOnly] = bubbles;
  const trees = bubbles.map((bubble) => bubble.querySelector('[data-slot="file-tree"]'));

  push('只读文件的那一轮不渲染文件树', readOnly.querySelectorAll('[data-slot="file-tree"]').length === 0);
  push('其余三轮各一张树', Boolean(trees[0]) && Boolean(trees[1]) && Boolean(trees[2]));

  // 1) 默认收起：只剩头部一条，行全部 hidden。
  const [manyTree, fewTree] = trees;
  push('收起是默认状态（10 文件）', manyTree.dataset.open === 'false' && manyTree.querySelector('.aui-file-tree-rows').hidden);
  push('收起是默认状态（5 文件）', fewTree.dataset.open === 'false');
  push('收起后的卡片高度紧凑（不超过 36px）', manyTree.getBoundingClientRect().height <= 36);
  push('头部统计 10 files changed +840 −26', manyTree.querySelector('.aui-file-tree-summary').textContent === '10 files changed'
    && (manyTree.querySelector('.aui-file-tree-totals').textContent || '').replace(/\s/g, '') === '+840−26');
  push('头部默认不描底（不预设高亮）', getComputedStyle(manyTree.querySelector('.aui-file-tree-header')).backgroundColor === 'rgba(0, 0, 0, 0)');
  // 箭头指示整棵树的展开状态。
  const headerChevron = manyTree.querySelector('.aui-file-tree-header-chevron');
  push('头部有折叠箭头，收起时朝右', Boolean(headerChevron) && getComputedStyle(headerChevron).transform !== 'none');
  push('头部计数和合计字号保持不变', getComputedStyle(manyTree.querySelector('.aui-file-tree-summary')).fontSize === '13.5px'
    && getComputedStyle(manyTree.querySelector('.aui-file-tree-totals')).fontSize === '13px');
  push('收起时没有任何行露出来', [...manyTree.querySelectorAll('.aui-file-tree-row')].every((row) => row.hidden === false ? row.getBoundingClientRect().height === 0 : true));
  push('没有悬停时不渲染路径卡', document.querySelector('.aui-file-tree-tip') === null);

  // 2) 点开两棵树。
  manyTree.querySelector('.aui-file-tree-header').click();
  fewTree.querySelector('.aui-file-tree-header').click();
  await wait(80);
  push('点开 10 文件：aria-expanded=true', manyTree.querySelector('.aui-file-tree-header').getAttribute('aria-expanded') === 'true');
  await wait(200);
  push('展开后箭头朝下', getComputedStyle(headerChevron).transform === 'none');

  // 3) 宽度 / 字体跟正文一致。
  const fewAnswer = few.querySelector('.chat-bubble-text');
  push('树的宽度 = 正文宽度', widthOf(fewTree) === widthOf(fewAnswer));
  push('树在回答正文之后', Boolean(fewAnswer.compareDocumentPosition(fewTree) & Node.DOCUMENT_POSITION_FOLLOWING));
  const controlBubble = longNoTree.querySelector('.chat-bubble');
  push('树没有把气泡撑宽（与无树的那轮同宽）', Math.abs(widthOf(few.querySelector('.chat-bubble')) - widthOf(controlBubble)) < 0.5);
  const fewName = fewTree.querySelector('.aui-file-tree-name');
  push('文件名字体 = 正文字体', getComputedStyle(fewName).fontFamily === getComputedStyle(fewAnswer).fontFamily);
  push('文件名不再是等宽字体', !/mono/i.test(getComputedStyle(fewName).fontFamily));
  const shortTree = trees[2];
  push('一句话回答时树的宽度 = 正文宽度', widthOf(shortTree) === widthOf(short.querySelector('.chat-bubble-text')));
  push('一句话回答时气泡有底线宽度（≥ 352px）', widthOf(short.querySelector('.chat-bubble')) >= 351.5);

  // 4) 树形结构：每个目录一条目录行，文件缩进一层（即使该目录只有一个文件）。
  const fewRows = [...fewTree.querySelectorAll('.aui-file-tree-row')];
  push('目录/文件交替成树形', fewRows.map((row) => `${row.classList.contains('is-folder') ? 'D' : 'F'}:${row.querySelector('.aui-file-tree-name').textContent}`).join('|') === [
    'D:app-web/styles', 'F:modals.css', 'F:delegation.css', 'F:chat.css',
    'D:app-web/tests/contracts', 'F:picker-selection-color.test.js',
    'D:/tmp/haish-style-review', 'F:summary.json',
  ].join('|'));
  push('目录行不缩进（0.25rem = 4px）', getComputedStyle(fewRows[0]).paddingInlineStart === '4px');
  push('文件行缩进一层（0.25 + 0.85 = 1.1rem = 17.6px）', getComputedStyle(fewRows[1]).paddingInlineStart === '17.6px');
  push('单文件目录也有自己的目录行', fewRows[4].querySelector('.aui-file-tree-name').textContent === 'app-web/tests/contracts'
    && getComputedStyle(fewRows[5]).paddingInlineStart === '17.6px');
  // 官方 13px 行文字 / 增删跟正文同号、文件图标 ms-3 落在目录图标下面。
  push('行文字 13px、增删 13px', getComputedStyle(fewRows[1]).fontSize === '13px'
    && getComputedStyle(fewRows[1].querySelector('.aui-file-tree-counts')).fontSize === '13px'
    && getComputedStyle(fewRows[1].querySelector('.aui-file-tree-name')).fontSize === '13px');
  push('文件图标比目录图标多缩进 12px（ms-3）', getComputedStyle(fewRows[1].querySelector('.aui-file-tree-icon')).marginInlineStart === '12px');
  // 高亮内嵌，标题和卡片都保持紧凑。
  const fewHeader = fewTree.querySelector('.aui-file-tree-header').getBoundingClientRect();
  const fewCard = fewTree.getBoundingClientRect();
  const rowsRect = fewTree.querySelector('.aui-file-tree-rows').getBoundingClientRect();
  push('头部布局内嵌且高度紧凑', fewHeader.left - fewCard.left >= 8 && fewCard.right - fewHeader.right >= 8 && fewHeader.height <= 30);
  push('头部和明细间距不超过 3px', rowsRect.top - fewHeader.bottom >= 0 && rowsRect.top - fewHeader.bottom <= 3);
  push('文件图标保持冷蓝色', getComputedStyle(fewRows[1].querySelector('.aui-file-tree-icon')).color === 'rgba(143, 183, 255, 0.7)');

  // 5) 目录自己也能收放：app-web/styles 一条目录行 + 三个文件。
  const folderRow = [...fewTree.querySelectorAll('.aui-file-tree-row.is-folder')].find((row) => row.textContent.includes('app-web/styles'));
  const folderToggle = folderRow?.querySelector('.aui-file-tree-folder');
  push('目录行是带 aria-expanded 的开关', Boolean(folderToggle) && folderToggle.getAttribute('aria-expanded') === 'true');
  const folderFiles = () => [...fewTree.querySelectorAll('.aui-file-tree-row.is-file')]
    .filter((row) => row.dataset.path.startsWith(`${folderRow.dataset.path}/`));
  push('目录下三个文件都在', folderFiles().length === 3);
  folderToggle.click();
  await wait(60);
  push('收起目录后子行全隐藏', Boolean(folderToggle.getAttribute('aria-expanded') === 'false') && folderFiles().every((row) => row.hidden));
  folderToggle.click();
  await wait(60);
  push('再点一下目录重新展开', folderToggle.getAttribute('aria-expanded') === 'true' && folderFiles().every((row) => !row.hidden));

  // 5) 悬停：路径卡贴住这一行、内容是完整路径、移开后留一段时间再收。
  const targetRow = [...manyTree.querySelectorAll('.aui-file-tree-row.is-file')][1];
  const targetRect = targetRow.getBoundingClientRect();
  hover(targetRow);
  await wait(60);
  push('悬停 60ms 内不弹卡（防抖）', document.querySelector('.aui-file-tree-tip') === null);
  await wait(160);
  const tip = document.querySelector('.aui-file-tree-tip');
  push('悬停后弹出路径卡', Boolean(tip));
  const tipRect = tip?.getBoundingClientRect();
  push('卡里是完整绝对路径', tipPath() === targetRow.dataset.path && tipPath().startsWith('/Users/'));
  const treeRect = manyTree.getBoundingClientRect();
  push('路径卡在文件树侧边，不遮挡明细', Boolean(tipRect) && tipRect.left >= treeRect.right + 7 && Math.abs(tipRect.top - targetRect.top) <= 1);
  push('卡里只有路径，没有复制按钮', Boolean(tip) && !tip.querySelector('button'));
  push('路径卡不超出视口', Boolean(tipRect) && tipRect.left >= 0 && tipRect.right <= innerWidth && tipRect.top >= 0 && tipRect.bottom <= innerHeight);
  unhover(targetRow);
  await wait(200);
  push('移开 200ms 内卡片还在（给移进卡片留时间）', document.body.contains(tip));
  await wait(500);
  push('移开约 700ms 后卡片收起', !document.body.contains(tip));

  return checks;
}

window.__fileTreeChecks = fileTreeChecks;

// 后台标签页不跑 rAF，用 setTimeout 一样能推进。断言里出错也要把结果写出来，否则页面会卡在
// “Running checks…”。
let checks = [];
try {
  checks = await fileTreeChecks();
} catch (error) {
  checks = [`FAIL 断言抛错：${error && error.message ? error.message : error}`];
}
const list = document.getElementById('checks');
const result = document.getElementById('result');
const failed = checks.filter((line) => line.startsWith('FAIL'));
if (list) list.textContent = checks.join('\n');
if (result) {
  result.textContent = failed.length ? `FAIL — ${failed.length} of ${checks.length}` : `PASS — ${checks.length} file tree checks`;
  result.dataset.result = failed.length ? 'fail' : 'pass';
}
