import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const timelineSource = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url),
  'utf8',
);
const baseStyles = fs.readFileSync(new URL('../../styles/base.css', import.meta.url), 'utf8');

test('ask_user gets a dedicated icon instead of the mcp magic wand', () => {
  // ask_user is a platform control tool (backend tool_group=external), so without
  // an explicit rule it fell through to CATEGORY_ICON_CLASS.mcp (magic-wand.png).
  const resolve = timelineSource.match(/export function resolveToolIconClass[\s\S]*?\n\}/);
  assert.ok(resolve, 'resolveToolIconClass must stay exported for the timeline');
  assert.ok(resolve[0].includes("if (name === 'ask_user') {"));
  assert.ok(resolve[0].includes("return 'ico-ask-user';"));
  // The dedicated class must exist and must not reuse the mcp/skill artwork.
  const rule = baseStyles.match(/\.ico-ask-user\s*\{([^}]+)\}/);
  assert.ok(rule, '.ico-ask-user must be declared in base.css');
  assert.match(rule[1], /url\("\.\.\/assets\/ui\/icons\/comment-alt-dots\.png"\)/);
  assert.ok(fs.existsSync(new URL('../../assets/ui/icons/comment-alt-dots.png', import.meta.url)));
  assert.doesNotMatch(rule[1], /magic-wand|skill\.png|tool\.png/);
});

test('every resolveToolIconClass return value is a real base.css icon class', () => {
  const resolve = timelineSource.match(/export function resolveToolIconClass[\s\S]*?\n\}/)[0];
  const classes = [...resolve.matchAll(/return '(ico-[a-z0-9-]+)';/g)].map((match) => match[1]);
  assert.ok(classes.length > 10, 'the tool icon map must stay populated');
  for (const className of new Set(classes)) {
    assert.match(baseStyles, new RegExp(`\\.${className}\\s*\\{`), `${className} must be declared in base.css`);
  }
});
