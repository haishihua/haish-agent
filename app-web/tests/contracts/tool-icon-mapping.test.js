import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TOOL_ICON_CLASSES } from '../../src/core/tool-names.js';
import { resolveToolIconClass } from '../../src/features/chat/components/nodes/shared.js';

const baseStyles = fs.readFileSync(new URL('../../styles/base.css', import.meta.url), 'utf8');
const iconDeclared = (className) => new RegExp(`\\.${className}\\s*\\{`).test(baseStyles);

test('ask_user gets a dedicated icon instead of the mcp magic wand', () => {
  // ask_user is a platform control tool (backend tool_group=external), so without
  // an explicit rule it fell through to CATEGORY_ICON_CLASS.mcp (magic-wand.png).
  assert.equal(resolveToolIconClass('ask_user', 'ico-mcp'), 'ico-ask-user');
  // The dedicated class must exist and must not reuse the mcp/skill artwork.
  const rule = baseStyles.match(/\.ico-ask-user\s*\{([^}]+)\}/);
  assert.ok(rule, '.ico-ask-user must be declared in base.css');
  assert.match(rule[1], /url\("\.\.\/assets\/ui\/icons\/comment-alt-dots\.png"\)/);
  assert.ok(fs.existsSync(new URL('../../assets/ui/icons/comment-alt-dots.png', import.meta.url)));
  assert.doesNotMatch(rule[1], /magic-wand|skill\.png|tool\.png/);
});

test('image_generate reuses the Settings → Image framed-glyph icon', () => {
  // 生图卡片曾经落回 ico-tool 的通用工具图标；现在与 Settings 里的 Image
  // 分组共用同一枚 lucide `image` 相框。
  assert.equal(resolveToolIconClass('image_generate', 'ico-tool'), 'ico-image-generate');
  const rule = baseStyles.match(/\.ico-image-generate\s*\{([^}]+)\}/);
  assert.ok(rule, '.ico-image-generate must be declared in base.css');
  assert.match(rule[1], /url\("\.\.\/assets\/ui\/icons\/image-generate\.svg"\)/);
  assert.ok(fs.existsSync(new URL('../../assets/ui/icons/image-generate.svg', import.meta.url)));
});

test('every registered tool icon is a real base.css icon class', () => {
  assert.ok(TOOL_ICON_CLASSES.size > 10, 'the tool icon map must stay populated');
  for (const className of new Set(TOOL_ICON_CLASSES.values())) {
    assert.ok(iconDeclared(className), `${className} must be declared in base.css`);
  }
});

test('keyword fallbacks for unregistered names also resolve to real icon classes', () => {
  // 未登记的名字（新 checkpoint / note / memory 工具、旧别名）靠名字里的关键词兜底，
  // 这组图标同样必须在 base.css 里存在。
  const fallbackSamples = [
    'list_checkpoints', 'note_take', 'memory_search', 'weather_lookup',
    'save_file', 'cat_file', 'fetch_url',
  ];
  for (const name of fallbackSamples) {
    const className = resolveToolIconClass(name, '');
    assert.ok(className, `${name} must fall back to a keyword icon`);
    assert.ok(iconDeclared(className), `${className} must be declared in base.css`);
  }
});
