import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  AGENT_AVATARS,
  AGENT_AVATAR_CATEGORIES,
  DEFAULT_AGENT_AVATAR_ID,
  agentAvatarById,
  agentAvatarIdFor,
  agentAvatarImageSrc,
  agentAvatarsInCategory,
} from '../../../src/features/agents/model/agent-avatars.js';

const avatarDir = new URL('../../../assets/ui/agent-avatars/', import.meta.url);
const files = readdirSync(avatarDir)
  .filter((name) => name.endsWith('.svg'))
  .sort();
const listIcon = readFileSync(
  new URL('../../../src/features/settings/components/settings-ui.jsx', import.meta.url),
  'utf8',
);
const editor = readFileSync(
  new URL('../../../src/features/settings/components/AgentConfigEditor.jsx', import.meta.url),
  'utf8',
);
const picker = readFileSync(
  new URL('../../../src/features/settings/components/AgentAvatarPicker.jsx', import.meta.url),
  'utf8',
);
const avatar = readFileSync(
  new URL('../../../src/features/agents/components/AgentAvatar.jsx', import.meta.url),
  'utf8',
);
const css = readFileSync(new URL('../../../src/features/settings/settings.css', import.meta.url), 'utf8');
const viteConfig = readFileSync(new URL('../../../../vite.app-web.config.ts', import.meta.url), 'utf8');

test('the avatar sheet ships exactly one vector file per catalog entry', () => {
  assert.equal(files.length, 54);
  assert.equal(AGENT_AVATARS.length, 54);
  assert.deepEqual(
    files,
    AGENT_AVATARS.map((item) => `${item.id}.svg`),
  );
  // 编号连续，别在重新切图时悄悄少一张。
  assert.equal(AGENT_AVATARS[0].id, 'penguin-01');
  assert.equal(AGENT_AVATARS.at(-1).id, 'penguin-56');
});

test('an agent without a stored avatar falls back to the first sheet entry', () => {
  assert.equal(DEFAULT_AGENT_AVATAR_ID, 'penguin-01');
  assert.equal(agentAvatarIdFor('preset.general', {}), 'penguin-01');
  assert.equal(agentAvatarIdFor('preset.general', { 'preset.general': 'penguin-42' }), 'penguin-42');
  // 存档里留着不认识的 id 时不要渲染破图。
  assert.equal(agentAvatarIdFor('preset.general', { 'preset.general': 'penguin-999' }), 'penguin-01');
  assert.equal(agentAvatarImageSrc('penguin-07'), 'assets/ui/agent-avatars/penguin-07.svg?v=7');
  assert.equal(agentAvatarImageSrc('nonsense'), 'assets/ui/agent-avatars/penguin-01.svg?v=7');
});

test('picker categories are the five tabs and only filter the catalog', () => {
  assert.deepEqual(
    AGENT_AVATAR_CATEGORIES.map((item) => item.label),
    ['All', 'Work', 'Sports', 'Life', 'Other'],
  );
  assert.equal(agentAvatarsInCategory('all').length, 54);
  for (const category of AGENT_AVATAR_CATEGORIES.filter((item) => item.id !== 'all')) {
    const items = agentAvatarsInCategory(category.id);
    assert.ok(items.length > 0, `${category.id} must not be empty`);
    assert.ok(items.every((item) => item.category === category.id));
  }
  assert.equal(
    AGENT_AVATAR_CATEGORIES.slice(1).reduce((total, category) => total + agentAvatarsInCategory(category.id).length, 0),
    54,
  );
  assert.equal(agentAvatarById('penguin-14').label, 'Keyboard');
  assert.equal(agentAvatarById('penguin-22').label, 'Basketball');
});

test('the agent list, editor hero and picker all render the avatar', () => {
  // 列表行：线性图标换成头像。
  assert.match(
    listIcon,
    /export function AgentListIcon\(\{ item \}\) \{\n\s{2}return <AgentAvatar agentId=\{item\?\.id\} size="list" \/>;/,
  );
  // 详情页：预设和自定义 agent 都有头像 + 改头像入口。
  assert.equal(editor.match(/size="hero"/g)?.length, 2);
  assert.equal(editor.match(/<AgentAvatarPicker/g)?.length, 2);
  // 弹窗只有素材库，不提供自定义上传。
  assert.match(picker, /agent-avatar-grid/);
  assert.doesNotMatch(picker, /type="file"/);
  assert.doesNotMatch(picker, /Upload/);
  // 头像框和弹窗格子必须是两套类名：共用一套时 padding/aspect-ratio 会互相污染，
  // 结果是列表里只剩一条企鹅影子、弹窗里整列被拉成竖条。
  assert.match(avatar, /className="agent-avatar-frame"/);
  assert.match(picker, /className={`agent-avatar-option\$\{selected \? ' is-selected' : ''\}`}/);
  assert.doesNotMatch(css, /agent-avatar-tile/);
  assert.equal(css.match(/\.agent-avatar-frame \{ display: flex;/g)?.length, 1);
  assert.match(css, /\.agent-avatar-grid \{[^}]*align-content: start;/);
  // 一行六列：格子约 84px，四列的大格子看起来太笨重。
  assert.match(css, /\.agent-avatar-grid \{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/);
  // body 全局 image-rendering: pixelated，头像图必须自己回到 auto，否则整张图最近邻缩放。
  assert.match(css, /\.agent-avatar-frame > img \{[^}]*image-rendering: auto;/);
  assert.match(css, /\.agent-avatar-option > img \{[^}]*image-rendering: auto;/);
  // 头像按 URL 引用，构建时需要把整个素材目录拷进 dist。
  assert.match(viteConfig, /'ui\/agent-avatars',/);
});
