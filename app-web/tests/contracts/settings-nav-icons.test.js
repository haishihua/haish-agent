import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SETTINGS_SECTIONS } from '../../src/features/settings/model/settings-navigation.js';

// 设置左栏（Context 分组）里 Embedding 与 Compact 曾经共用 layers（堆叠菱形）——
// 两个条目长得一模一样，扫一眼分不出谁是谁。这里的契约锁住两件事：
//   1. 同一个分组里不许两个条目挂同一个图标（Compact 复刻 Embedding 就是这个 bug）；
//   2. 左栏用到的图标名必须在 AppIcon 的 ICONS 里真实注册（写个没注册的名字会静默退回 box）。
// AppIcon.jsx / settings-ui.jsx 都是 JSX，测试里按源码解析（同 task-context.test.js 的做法）。

const root = new URL('../../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');

const appIconSource = read('src/shared/ui/AppIcon.jsx');
const settingsUiSource = read('src/features/settings/components/settings-ui.jsx');

function sourceBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `missing ${marker}`);
  return source.slice(start, source.indexOf('\n};', start));
}

// ICONS 的键 = 图标名；值是 lucide 组件名（带引号的键写成 'code-2' 这种）。
function registeredIcons() {
  return [...sourceBlock(appIconSource, 'const ICONS = {').matchAll(/^\s*(?:'([^']+)'|([A-Za-z][\w-]*))\s*:/gm)]
    .map((match) => match[1] || match[2]);
}

// SETTINGS_SUBTABS 的子 tab 用的兜底图标表。
function subTabIcons() {
  return [...sourceBlock(settingsUiSource, 'export const SETTINGS_SUBTAB_ICONS = {').matchAll(/:\s*'([^']+)'/g)]
    .map((match) => match[1]);
}

function iconNames(group) {
  return (group?.children || []).map((child) => child.icon).filter(Boolean);
}

// 同一分组里重复出现的图标名（第二个同名起都算冲突）。
function duplicateIconsIn(group) {
  const icons = iconNames(group);
  return icons.filter((icon, index) => icons.indexOf(icon) !== index);
}

test('Automation navigation uses the concise Workflow label', () => {
  const workflow = SETTINGS_SECTIONS.find(section => section.id === 'automation').children.find(child => child.id === 'workflow');
  assert.equal(workflow.label, 'Workflow');
  assert.equal(workflow.icon, 'workflow');
});

const contextGroup = SETTINGS_SECTIONS.find((section) => section.id === 'context');
const compact = contextGroup?.children.find((child) => child.id === 'compact');
const embedding = contextGroup?.children.find((child) => child.id === 'embedding');

test('Context 组每个条目挂自己的图标：Compact 不再复用 Embedding 的 layers', () => {
  assert.ok(compact && embedding, 'Context 组里必须有 Compact 与 Embedding 条目');
  assert.notEqual(compact.icon, embedding.icon);
  for (const section of SETTINGS_SECTIONS) {
    assert.deepEqual(duplicateIconsIn(section), [], `${section.id} 分组里有重复图标`);
  }
  // 反向断言：把 Compact 的图标改回 layers，冲突检测必须报出来——说明这条真的在看这个字段。
  const reverted = SETTINGS_SECTIONS.map((section) => (section.id !== 'context' ? section : {
    ...section,
    children: section.children.map((child) => (child.id === 'compact' ? { ...child, icon: 'layers' } : child)),
  }));
  assert.deepEqual(duplicateIconsIn(reverted.find((section) => section.id === 'context')), ['layers']);
});

test('左栏用到的图标名都在 AppIcon 里注册过，且组件真的 import 了', () => {
  const icons = registeredIcons();
  assert.ok(icons.length > 40, 'ICONS 映射解析失败');
  assert.ok(icons.includes('layers') && icons.includes('shrink'));
  const used = new Set([
    ...SETTINGS_SECTIONS.flatMap((section) => [section.icon, ...iconNames(section)]),
    ...subTabIcons(),
    'configure', // SettingsPage 里 child.icon 与子 tab 表都缺席时的兜底。
  ].filter(Boolean));
  assert.ok(used.has('shrink'), 'Compact 的图标名应当来自设置导航数据');
  for (const name of used) {
    assert.ok(icons.includes(name), `AppIcon 里没有注册 ${name}`);
  }
  // 反向断言：没注册的名字不该通过（写错名字会静默退回 box，契约要挡住这一手）。
  assert.ok(!icons.includes('shrink-context'));
  // 注册了名字还得真的 import 了对应的 lucide 组件，否则构建期才会炸。
  const importBlock = appIconSource.slice(0, appIconSource.indexOf("} from 'lucide-react'"));
  for (const component of [...sourceBlock(appIconSource, 'const ICONS = {').matchAll(/^\s*[\w'-]+:\s*([A-Za-z][\w]*),/gm)].map((match) => match[1])) {
    assert.match(importBlock, new RegExp(`\\b${component}\\b`), `lucide 组件 ${component} 没有 import`);
  }
});
