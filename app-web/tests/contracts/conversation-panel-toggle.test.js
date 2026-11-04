import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const panelSource = fs.readFileSync(
  new URL('../../src/features/conversations/components/ConversationsPanel.jsx', import.meta.url),
  'utf8',
);
const panelsCss = fs.readFileSync(new URL('../../styles/panels.css', import.meta.url), 'utf8');

// 设计稿把折叠/展开从表头那枚小图标换成了贴在面板右缘、竖直居中的舌片把手；
// 设计稿里印在把手旁边的 "Collapse" / "Expand" 不常驻，改走统一 tooltip
// （跟项目悬停提示同一只 PortalTooltip）。这几条锁住这次改法。
const chevronPath = (name) => {
  const match = panelSource.match(new RegExp(`const ${name} = '([^']+)';`));
  assert.ok(match, `${name} must exist`);
  return match[1];
};
// 一条 "M x y x y ..." 的第二个坐标对就是拐点（apex）。
const apexX = (path) => Number(path.match(/-?\d+(?:\.\d+)?/g)[2]);

test('折叠把手搬出表头，挂在面板自己的右缘上', () => {
  // 上一版是表头里的一枚 .conversation-head-action（class 里带 conversation-panel-toggle）。
  assert.doesNotMatch(panelSource, /conversation-panel-toggle/);
  assert.doesNotMatch(panelsCss, /conversation-panel-toggle/);
  assert.doesNotMatch(panelSource, /SidebarToggleIcon/);
  assert.doesNotMatch(panelsCss, /sidebar-toggle-icon/);
  // 表头收起时不渲染（窄条里没有第二个入口），把手是 side-panel 的直接子节点。
  assert.match(panelSource, /\{!collapsed \? \(\s*<div className="side-panel-head">/);
  assert.match(panelSource, /\{panelToggle\}\s*<div className="side-panel-body conversations-body"/);
  assert.match(panelSource, /className="conversations-edge-toggle"/);
});

test('把手贴在右缘、竖直居中，右缘跟面板边框齐平', () => {
  const rule = panelsCss.slice(
    panelsCss.indexOf('.conversations-panel .conversations-edge-toggle {'),
    panelsCss.indexOf('.conversations-panel .conversations-edge-toggle:hover'),
  );
  assert.ok(rule, 'the edge handle rule must exist');
  assert.match(rule, /position: absolute;/);
  assert.match(rule, /top: 50%;/);
  assert.match(rule, /right: 0;/);
  assert.match(rule, /transform: translateY\(-50%\);/);
  // 要在面板内容（z-index 1）和表头（8）之上，才不会被会话行盖住。
  assert.match(rule, /z-index: 9;/);
  assert.match(rule, /background: transparent;/);
  assert.match(rule, /width: 20px;[\s\S]*height: 64px;/);
  assert.match(panelSource, /className="conversations-edge-contour-line"/);
  assert.match(panelsCss, /\.conversations-edge-contour-line \{[^}]*stroke: #679ce8;/);
  assert.match(panelsCss, /\.conversations-edge-chevron \{[^}]*width: 10px;[^}]*height: 10px;/);
});

test('chevron 只是一条镜像翻转：展开朝左（合上），收起朝右（拉开）', () => {
  const collapse = chevronPath('EDGE_CHEVRON_COLLAPSE');
  const expand = chevronPath('EDGE_CHEVRON_EXPAND');
  assert.ok(apexX(collapse) < 6, `collapse apex must point left: ${collapse}`);
  assert.ok(apexX(expand) > 6, `expand apex must point right: ${expand}`);
  assert.ok(Math.abs(apexX(collapse) - (12 - apexX(expand))) < 0.001, 'the two chevrons mirror each other');
  assert.match(panelSource, /d=\{collapsed \? EDGE_CHEVRON_EXPAND : EDGE_CHEVRON_COLLAPSE\}/);
  // 细笔触：1.5px、圆头，跟设计稿一致。
  assert.match(panelSource, /strokeWidth="1\.5"/);
  assert.match(panelSource, /strokeLinecap="round"/);
});

test('设计稿的 Collapse / Expand 文案走统一 tooltip，不常驻在把手旁边', () => {
  assert.match(panelSource, /<PortalTooltip text=\{collapsed \? 'Expand' : 'Collapse'\} position="below">/);
  assert.ok(panelSource.includes("import { PortalTooltip } from '../../../shared/ui/PortalTooltip.jsx';"));
  // 把手自己不带文字（只有 svg），提示只走那唯一一条文案。
  const button = panelSource.slice(
    panelSource.indexOf('className="conversations-edge-toggle"'),
    panelSource.indexOf('</PortalTooltip>', panelSource.indexOf('className="conversations-edge-toggle"')),
  );
  assert.doesNotMatch(button, />\s*[A-Za-z]{4,}\s*</, 'the handle must not render a text label');
});

test('收起状态仍是同一条可访问的开关', () => {
  assert.match(panelSource, /aria-expanded=\{!collapsed\}/);
  assert.match(panelSource, /aria-controls=\{panelBodyId\}/);
  assert.match(panelSource, /id=\{panelBodyId\}/);
  // 面板窄到 32px 时唯一入口就是这枚把手：它得一直挂着，不能只在展开态渲染。
  assert.match(panelSource, /aria-label=\{collapsed \? `Expand \$\{panelName\} panel` : `Collapse \$\{panelName\} panel`\}/);
  assert.match(panelSource, /const panelName = workflowTaskMode \? 'task' : 'conversation';/);
});
