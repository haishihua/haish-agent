import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');

test('trigger tooltip shows the selected model id and thinking value', () => {
  assert.ok(source.includes("const runConfigLabel = `${value || 'No model'} · ${currentReasoning?.label || 'Unspecified'}`;"));
  assert.match(source, /const reasoningOptions = suppliedReasoningOptions;/);
  assert.doesNotMatch(source, /id: null, label: 'Unspecified'/);
  assert.doesNotMatch(source, /DEFAULT_REASONING_EFFORT/);
  assert.match(source, /<PortalTooltip text=\{open \? '' : runConfigLabel\}/);
  assert.ok(source.includes('aria-label={`Run configuration, ${runConfigLabel}`}'));
  assert.doesNotMatch(source, /Thinking ·/);
});

test('provider and model selection do not dismiss the settings menu', () => {
  for (const callback of ['onProviderChange', 'onChange']) {
    const handler = source.split('\n').find((line) => line.includes('onClick=') && line.includes(`${callback}`));
    assert.ok(handler, `${callback} selection handler exists`);
    assert.match(handler, /if \(disabled \|\| readOnly(?: \|\| loading)?\) return/);
    assert.doesNotMatch(handler, /setOpen|setMenuOpen|setActiveSubmenu/);
  }
});

test('the open menu is dismissed only by an explicit action, never by the pointer leaving', () => {
  // 子菜单开在面板右侧：它一收起，光标就落在面板外，浏览器立刻在根节点上派发 mouseleave。
  // 旧的 mouseenter/mouseleave + 180ms 计时器因此会把用户正在选的主面板关掉——
  // 实际现象就是「选完 agent 面板直接消失」。关闭只留显式动作。
  assert.doesNotMatch(source, /leaveTimer/);
  assert.doesNotMatch(source, /onMouseLeave/);
  assert.match(source, /if \(rootRef\.current && !rootRef\.current\.contains\(event\.target\)\)/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /aria-expanded=\{open\}/);
});
