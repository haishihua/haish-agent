// 侧边栏会话列表密度 + 标题列——真实 ConversationsPanel + panels.css + app.css。
//
// 用户要的：会话标题之间、会话与项目之间、项目与项目之间的留白都窄一点，
// 默认打开页面时能一次看到更多项目（原来 700px 高的侧栏里只装得下两个项目）；
// 项目的 folder 图标小一点、项目标题跟会话标题对齐；会话标题太长不再画「…」，
// 改成末尾渐隐（若隐若现）。
// 这里锁住「行高 → 行距 → 块距 → 一屏装几个项目」这条链：
//   1. 项目行与会话行一样高（32px），会话行间距 = 32px（标题之间的留白就来自行高）；
//   2. 一个项目块（5 行预览 + Show more）的间距、以及「会话 → 下一个项目」的缝；
//   3. 760px 高的窗口（侧栏 704px）里，完整可见的项目行 >= 3 行；
//   4. 项目标题与会话标题共用同一个左缘，图标缩到 15px 退在留白里，且图标与标题
//      之间留 10px 呼吸位（上一版图标是贴着标题的，只剩 3px）；
//   5. 一条真的溢出的长标题：mask 收到 linear-gradient（末尾一层透明），text-overflow = clip；
//   6. 表头那张 Conversation 图标贴到列表里 folder 图标那条左缘（3px），且面板收到
//      app-shell 左栏的新下限 210px 时表头（图标 + 标题 + 两个按钮）仍一行放得下。
// 反向断言（revert）：把改前的 42px 行高 / 9px 内边距 / 6px 外边距 / 30px Show more
// 注回去，一屏里完整可见的项目行必须变少；把 26px 图标按钮和 ellipsis 注回去，
// 项目标题被推离文字列、渐隐消失；把 21px 文字列与居中的图标注回去，
// 图标与标题之间那道缝被吃掉；把 40px 标题留白注回去，静态框右端退回行尾那条空带；
// 把表头旧内边距（11 / 18 / 18）与旧图标尺寸（18 / 22px）注回去，
// 图标离开左缘、两枚 icon 大一号、210px 下溢出——说明这几条是真的在被测。

import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ConversationsPanel } from '../../src/features/conversations/components/ConversationsPanel.jsx';
import { AppTooltipProvider } from '../../src/shared/ui/PortalTooltip.jsx';
import '../../styles/base.css';
import '../../styles/app-shell.css';
import '../../styles/panels.css';

window.__pageErrors = [];
window.addEventListener('error', (event) => window.__pageErrors.push(String(event.message || event.error || event)));
window.addEventListener('unhandledrejection', (event) => window.__pageErrors.push(`unhandledrejection ${String(event.reason)}`));

const PROJECTS = 4;
const CONVERSATIONS = 6;
// 侧栏高度 = 760px 高的窗口减掉顶栏——用户截图里那个「一屏只装得下两个项目」的场景。
const PANEL_HEIGHT = 704;

// 第一条会话故意给一个长标题：渐隐只在真的溢出时出现，短标题不该被碰。
const LONG_TITLE = '分析失败Trace提升Agent能力以及一条很长很长到必须收尾的会话标题';

const conversation = (projectIndex, index) => ({
  id: `p${projectIndex}-conv-${index}`,
  name: projectIndex === 1 && index === 1 ? LONG_TITLE : `会话 ${projectIndex}-${index} 标题`,
  executionMode: 'chat',
  expanded: false,
  pinned: false,
  sortOrder: index,
  tasks: [],
});

const project = (index) => ({
  id: `project-${index}`,
  type: 'custom',
  executionMode: 'chat',
  name: `项目 ${index}`,
  workspacePath: `/tmp/haish-density/project-${index}`,
  workspaceLabel: `project-${index}`,
  removable: true,
  expanded: true,
  pinned: false,
  sortOrder: index,
  conversations: Array.from({ length: CONVERSATIONS }, (_, i) => conversation(index, i + 1)),
});

const WORKSPACE = {
  activeProjectId: 'project-1',
  activeConversationId: 'p1-conv-1',
  projects: Array.from({ length: PROJECTS }, (_, i) => project(i + 1)),
};

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: Boolean(pass), detail: String(detail) });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value) => Math.round(value * 10) / 10;

const projectRows = () => [...document.querySelectorAll('.conversations-body .project-row')];
const projectNode = (index) => [...document.querySelectorAll('.conversations-body .project-node')][index];
const conversationRows = (index) => [...projectNode(index).querySelectorAll('.project-conversations .conversation-row')];
const bodyNode = () => document.querySelector('.conversations-body');
const showMoreNode = (index) => projectNode(index).querySelector('.project-conversations > .conversation-show-more');

const height = (element) => round(element.getBoundingClientRect().height);
const top = (element) => round(element.getBoundingClientRect().top);
const bottom = (element) => round(element.getBoundingClientRect().bottom);

// 标题列：项目名与会话标题（.conversation-name-static 就是文字块本身）。
const titleNodes = () => [...document.querySelectorAll('.conversation-name-static')];
const projectTitleNode = () => projectRows()[0].querySelector('.project-name');
const toggleNode = () => projectRows()[0].querySelector('.project-icon-toggle');
const iconNode = () => toggleNode().querySelector('.ico');
const left = (element) => round(element.getBoundingClientRect().left);
const maskOf = (element) => {
  const style = getComputedStyle(element);
  return `${style.maskImage || ''} ${style.webkitMaskImage || ''}`.trim();
};
const titleColumn = () => ({
  project: left(projectTitleNode()),
  conversation: left(titleNodes()[0]),
});

// 一屏里「整行都在可视区里」的项目行有几个——用户说的就是这一条。
const visibleProjectRows = () => {
  const body = bodyNode().getBoundingClientRect();
  return projectRows().filter((row) => top(row) >= body.top - 0.5 && bottom(row) <= body.bottom + 0.5).length;
};

const snapshot = () => {
  const rows = projectRows();
  const first = conversationRows(0);
  const pitches = first.slice(1).map((row, i) => round(top(row) - top(first[i])));
  return {
    projects: rows.length,
    projectHeight: height(rows[0]),
    conversationHeight: height(first[0]),
    pitches,
    // 会话 → 下一个项目：a 项目最后一行到 b 项目行的缝（中间站着 Show more）
    conversationToProject: round(top(rows[1]) - bottom(first[first.length - 1])),
    // 项目 → 项目：两块之间的整段高度（行高 + 预览行 + Show more + 外边距）
    blockPitch: round(top(rows[1]) - top(rows[0])),
    showMoreHeight: showMoreNode(0) ? height(showMoreNode(0)) : -1,
    visible: visibleProjectRows(),
    bodyHeight: round(bodyNode().getBoundingClientRect().height),
  };
};

const root = createRoot(document.getElementById('root'));

async function runChecks() {
  flushSync(() => {
    root.render(
      <AppTooltipProvider>
        {/* 真实侧栏是 grid 里撑满一整行高度的项；这里用 flex 收住高度，
            否则面板会被内容撑高，一屏能看到几个项目就量不准了。 */}
        <div style={{ display: 'flex', width: 288, height: PANEL_HEIGHT }}>
          <ConversationsPanel
            workspaceState={WORKSPACE}
            onSelectProject={() => {}}
            onToggleProject={() => {}}
            onSelectConversation={() => {}}
            onAddConversation={() => {}}
            onRemoveProject={() => {}}
            onDeleteConversation={() => {}}
            onRenameConversation={() => {}}
            onRenameProject={() => {}}
            onPinConversation={() => {}}
            onPinProject={() => {}}
          />
        </div>
      </AppTooltipProvider>,
    );
  });
  await sleep(250);

  const current = snapshot();
  check(
    'the four projects and their conversation rows rendered',
    current.projects === PROJECTS && conversationRows(0).length === 5,
    `projects=${current.projects} rows=${conversationRows(0).length}`,
  );
  check(
    'the project row is exactly as tall as a conversation row',
    current.projectHeight === 32 && current.conversationHeight === 32,
    `project=${current.projectHeight} conversation=${current.conversationHeight}`,
  );
  check(
    'conversation titles sit 32px apart (the gap between titles is the row itself)',
    current.pitches.length > 0 && current.pitches.every((pitch) => pitch === 32),
    `pitches=${current.pitches.join(',')}`,
  );
  check(
    'a conversation block hands over to the next project within 46px',
    current.conversationToProject > 0 && current.conversationToProject <= 46,
    `conversationToProject=${current.conversationToProject} showMore=${current.showMoreHeight}`,
  );
  check(
    'a whole project block (row + 5 preview rows + Show more) stays within 240px',
    current.blockPitch > 0 && current.blockPitch <= 240,
    `blockPitch=${current.blockPitch}`,
  );
  check(
    'at least three project rows fit whole in a 760px-window sidebar',
    current.visible >= 3,
    `visible=${current.visible} bodyHeight=${current.bodyHeight}`,
  );

  // 项目的 icon 调小 + 项目标题跟会话标题对齐：侧栏只留一条文字竖线。
  const column = titleColumn();
  const glyph = iconNode().getBoundingClientRect();
  check(
    'the project title sits on the same left edge as the conversation titles',
    Math.abs(column.project - column.conversation) <= 0.5,
    `project=${column.project} conversation=${column.conversation}`,
  );
  check(
    'the folder icon shrinks into the left gutter, clear of the text column',
    round(glyph.width) <= 16 && round(glyph.height) <= 16 && round(glyph.right) <= column.conversation - 2,
    `icon=${round(glyph.width)}x${round(glyph.height)} iconRight=${round(glyph.right)} textLeft=${column.conversation}`,
  );
  // icon 与标题之间要留呼吸位（参考图：folder 与名字之间一条明显的缝）——
  // 文字列 = 图标缩进 3px + folder 15px + 这道缝 10px。
  check(
    'the folder icon keeps a breathing gap before the project title',
    round(column.conversation - glyph.right) >= 9 && round(column.conversation - glyph.right) <= 12,
    `gap=${round(column.conversation - glyph.right)} iconRight=${round(glyph.right)} textLeft=${column.conversation}`,
  );

  // 表头（Conversation 那一行）：图标要跟列表里的 folder 图标共用同一条左缘，
  // 而且面板收到 app-shell 左栏的新下限（210px）时表头仍然一行放得下——
  // 表头左/右内边距、组间距、图标底板与两个按钮（34 → 30px）一起收窄，
  // 就是为这次「面板整体往左缩」腾的宽度。
  const head = document.querySelector('.conversations-panel .side-panel-head');
  const brandIcon = head.querySelector('.conversation-brand-icon').getBoundingClientRect();
  check(
    'the conversation icon starts on the same left edge as the folder icons',
    Math.abs(brandIcon.left - glyph.left) <= 0.5,
    `brandIcon=${round(brandIcon.left)} folderIcon=${round(glyph.left)}`,
  );
  const wrapper = document.getElementById('root').firstElementChild;
  const titleTextBox = head.querySelector('.title > span:last-child');
  const titleWidthBefore = round(titleTextBox.getBoundingClientRect().width);
  wrapper.style.width = '210px';
  await sleep(120);
  const actionWidths = [...head.querySelectorAll('.conversation-head-action')].map((button) => round(button.getBoundingClientRect().width));
  const titleWidthAfter = round(titleTextBox.getBoundingClientRect().width);
  check(
    'a 210px-wide sidebar (the new floor) still fits the whole header in one row',
    head.scrollWidth <= head.clientWidth
      && Math.abs(titleWidthAfter - titleWidthBefore) < 0.5
      && actionWidths.length === 2
      && actionWidths.every((width) => width === 30),
    `panel=${round(document.querySelector('.conversations-panel').getBoundingClientRect().width)} overflow=${head.scrollWidth - head.clientWidth} title=${titleWidthAfter} buttons=${actionWidths.join(',')}`,
  );
  wrapper.style.width = '288px';
  await sleep(60);

  // 行尾留白：标题静态框（.conversation-name-static）右端到行右缘只剩 31px
  // （= 行内边距 11px + 标题留白 20px）——行尾常驻的转圈（最左到 26px）与终态
  // 圆点（27px）都落在这条线的右边，长标题因此比改前（51px）多显示 20px。
  const firstRow = conversationRows(0)[0];
  const rowRight = round(firstRow.getBoundingClientRect().right);
  const staticRight = round(firstRow.querySelector('.conversation-name-static').getBoundingClientRect().right);
  const tail = round(rowRight - staticRight);
  check(
    'the conversation title box ends 31px before the row edge (the old 40px reserve is gone)',
    tail >= 29 && tail <= 33,
    `tail=${tail} rowRight=${rowRight} titleRight=${staticRight}`,
  );

  // 表头两枚 icon 一起减重：folder-plus 18 → 15px、折叠图标 22 → 18px（墨迹 ≈15px），
  // 跟列表行 15px 的 folder 同一条视觉重量；两个按钮的命中区（30px）不动。
  const headFolderGlyph = head.querySelector('.conversation-head-action .ico-folder-plus-circle').getBoundingClientRect();
  const headToggleIcon = head.querySelector('.sidebar-toggle-icon').getBoundingClientRect();
  check(
    'the two header icons shrink one step (Add project 18 → 15px, collapse 22 → 18px)',
    round(headFolderGlyph.width) === 15 && round(headFolderGlyph.height) === 15
      && round(headToggleIcon.width) === 18 && round(headToggleIcon.height) === 18,
    `folder=${round(headFolderGlyph.width)}x${round(headFolderGlyph.height)} toggle=${round(headToggleIcon.width)}x${round(headToggleIcon.height)}`,
  );

  // 标题太长：末尾渐隐（mask 最后一段是全透明的黑），不再画「…」。
  const longTitle = titleNodes()[0];
  const longMask = maskOf(longTitle);
  check(
    'an overflowing title fades out at the tail instead of an ellipsis',
    longTitle.scrollWidth > longTitle.clientWidth + 1
      && /linear-gradient/.test(longMask)
      && /rgba\(0, 0, 0, 0\)/.test(longMask)
      && getComputedStyle(longTitle).textOverflow === 'clip',
    `overflow=${longTitle.scrollWidth - longTitle.clientWidth}px mask=${longMask} textOverflow=${getComputedStyle(longTitle).textOverflow}`,
  );
  check(
    'the project title wears the same fade instead of an ellipsis',
    /linear-gradient/.test(maskOf(projectTitleNode()))
      && getComputedStyle(projectTitleNode()).textOverflow === 'clip',
    `mask=${maskOf(projectTitleNode())} textOverflow=${getComputedStyle(projectTitleNode()).textOverflow}`,
  );
  check(
    'a short title keeps its full text (the fade only bites on overflow)',
    titleNodes()[1].scrollWidth <= titleNodes()[1].clientWidth + 1,
    `overflow=${titleNodes()[1].scrollWidth - titleNodes()[1].clientWidth}px`,
  );

  check('no page error was raised while rendering the sidebar', window.__pageErrors.length === 0, window.__pageErrors.join(' | '));
  return { results, current };
}

// revert：改前的行高/内边距/外边距/Show more 高度注回去，一屏可见的项目行应变少。
async function revertChecks() {
  const style = document.createElement('style');
  style.textContent = `
    .project-row, .conversation-row { min-height: 42px !important; padding: 9px 11px !important; }
    .project-row { padding-block: 9px !important; }
    .project-node { margin-bottom: 6px !important; }
    .conversation-show-more { min-height: 30px !important; }
    .conversations-body { padding: 10px 0 14px !important; }
  `;
  document.head.appendChild(style);
  await sleep(200);
  const reverted = snapshot();
  return [
    { name: 'revert: the old 42px rows push project blocks apart again', pass: reverted.blockPitch >= 286, detail: `blockPitch=${reverted.blockPitch}` },
    { name: 'revert: that sidebar then shows no more than two projects', pass: reverted.visible <= 2, detail: `visible=${reverted.visible}` },
  ];
}

const report = (list) => {
  const output = document.getElementById('checks');
  const failed = list.filter((entry) => !entry.pass);
  output.textContent = `${failed.length ? 'FAIL' : 'PASS'}  ${list.length - failed.length}/${list.length}\n`
    + list.map((entry) => `${entry.pass ? 'ok  ' : 'FAIL'} ${entry.name}${entry.detail ? ` [${entry.detail}]` : ''}`).join('\n');
  output.dataset.result = failed.length ? 'FAIL' : 'PASS';
  return { failed: failed.length, total: list.length, results: list };
};

// revert：改前的「26px 按钮 + 18px 图标 + ellipsis + 40px 标题留白」注回去，项目标题
// 应被推离文字列、渐隐 mask 应消失、静态框右端退回行尾那条空带（这三条反向断言
// 证明上面量的是真的生效中的规则）。
async function revertTitleChecks() {
  const style = document.createElement('style');
  style.textContent = `
    .project-row { padding-left: 11px !important; }
    .project-icon-toggle { position: static !important; width: 26px !important; height: 26px !important; transform: none !important; }
    .project-icon-toggle .ico-folder, .project-icon-toggle .ico-folder-open { width: 18px !important; height: 18px !important; }
    .project-name, .conversation-name-static { -webkit-mask-image: none !important; mask-image: none !important; text-overflow: ellipsis !important; }
    .conversation-name { padding-right: 40px !important; }
  `;
  document.head.appendChild(style);
  await sleep(200);
  const reverted = titleColumn();
  const longTitle = titleNodes()[0];
  const revertedFirstRow = conversationRows(0)[0];
  const revertedTail = round(
    revertedFirstRow.getBoundingClientRect().right
    - revertedFirstRow.querySelector('.conversation-name-static').getBoundingClientRect().right,
  );
  return [
    {
      name: 'revert: the 26px icon button pushes the project title off the text column',
      // 文字列搬到 28px 后，注回旧布局时项目标题离这条竖线约 17px（以前是 24px）。
      pass: reverted.project - reverted.conversation >= 16,
      detail: `project=${reverted.project} conversation=${reverted.conversation}`,
    },
    {
      name: 'revert: the titles go back to an ellipsis with no fade mask',
      // maskOf 把 mask-image 与 -webkit-mask-image 拼在一起，两边都是 none 时是 "none none"。
      pass: /^none( none)?$/.test(maskOf(longTitle)) && getComputedStyle(longTitle).textOverflow === 'ellipsis',
      detail: `mask=${maskOf(longTitle)} textOverflow=${getComputedStyle(longTitle).textOverflow}`,
    },
    {
      name: 'revert: the old 40px tail reserve pulls the title box back to the empty band',
      // 20 → 40px 后，静态框右端离行右缘回到 51px（= 行内边距 11 + 留白 40）。
      pass: revertedTail >= 45,
      detail: `tail=${revertedTail}`,
    },
  ];
}

// revert：把上一版「21px 文字列 + 图标在自家按钮里居中」注回去，图标与标题之间的
// 那道缝应被吃掉（只剩 3px），而两列对齐本身不受影响。
async function revertGapChecks() {
  const style = document.createElement('style');
  style.textContent = `
    .conversations-body { --sidebar-text-indent: 21px !important; }
    .project-row { padding-left: 21px !important; }
    .project-icon-toggle { width: 21px !important; justify-content: center !important; padding-left: 0 !important; }
    .project-conversations { padding-left: 10px !important; }
  `;
  document.head.appendChild(style);
  await sleep(200);
  const column = titleColumn();
  const glyph = iconNode().getBoundingClientRect();
  return [
    {
      name: 'revert: the old 21px column squeezes the icon against the title',
      pass: round(column.conversation - glyph.right) <= 5,
      detail: `gap=${round(column.conversation - glyph.right)}`,
    },
    {
      name: 'revert: that narrower column still keeps the two title columns aligned',
      pass: Math.abs(column.project - column.conversation) <= 0.5,
      detail: `project=${column.project} conversation=${column.conversation}`,
    },
  ];
}

// revert：把表头的旧值（左内边距 11px / 右内边距 18px / 组间距 18px）与旧图标尺寸
// （folder-plus 18px、折叠图标 22px）注回去，Conversation 图标应离开列表那条左缘、
// 两枚 icon 大一号，且 210px 面板下应放不下（溢出）——证明这几条都是当前规则在撑着。
async function revertHeadChecks() {
  const style = document.createElement('style');
  style.textContent = `
    .conversations-panel .side-panel-head { padding-left: 11px !important; padding-right: 18px !important; gap: 18px !important; }
    .conversation-head-action .ico-folder-plus-circle { width: 18px !important; height: 18px !important; }
    .sidebar-toggle-icon { width: 22px !important; height: 22px !important; }
  `;
  document.head.appendChild(style);
  const wrapper = document.getElementById('root').firstElementChild;
  wrapper.style.width = '210px';
  await sleep(200);
  const head = document.querySelector('.conversations-panel .side-panel-head');
  const brandIcon = head.querySelector('.conversation-brand-icon').getBoundingClientRect();
  const glyph = iconNode().getBoundingClientRect();
  const overflow = head.scrollWidth - head.clientWidth;
  const revertedFolder = head.querySelector('.conversation-head-action .ico-folder-plus-circle').getBoundingClientRect();
  const revertedToggle = head.querySelector('.sidebar-toggle-icon').getBoundingClientRect();
  wrapper.style.width = '288px';
  return [
    {
      name: 'revert: the old 11px header inset pushes the conversation icon off the folder icon line',
      pass: brandIcon.left - glyph.left >= 6,
      detail: `brandIcon=${round(brandIcon.left)} folderIcon=${round(glyph.left)}`,
    },
    {
      name: 'revert: with the old header insets a 210px sidebar overflows',
      pass: overflow > 0,
      detail: `overflow=${overflow}`,
    },
    {
      name: 'revert: the old 18px / 22px header icons come back a size bigger',
      pass: round(revertedFolder.width) === 18 && round(revertedToggle.width) === 22,
      detail: `folder=${round(revertedFolder.width)} toggle=${round(revertedToggle.width)}`,
    },
  ];
}

window.__sidebarDensityChecks = async () => report((await runChecks()).results);
window.__sidebarDensityRevertChecks = async () => report(await revertChecks());
window.__sidebarTitleRevertChecks = async () => report(await revertTitleChecks());
window.__sidebarGapRevertChecks = async () => report(await revertGapChecks());
window.__sidebarHeadRevertChecks = async () => report(await revertHeadChecks());
window.__sidebarDensitySnapshot = () => JSON.stringify(snapshot());
window.__sidebarDensityAutoRun = () => {
  runChecks()
    .then(({ results: list }) => report(list))
    .catch((error) => {
      report([{ name: 'fixture crashed', pass: false, detail: String(error?.stack || error) }]);
    });
};

window.__sidebarDensityAutoRun();
