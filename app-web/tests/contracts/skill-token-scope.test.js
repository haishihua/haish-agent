import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { appShellSource as readAppShellSource } from '../helpers/shell-source.js';

const read = (path) => fs.readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const composer = read('features/chat/components/ChatComposer.jsx');
const input = read('features/chat/components/LexicalComposerInput.jsx');
const shell = readAppShellSource();

test('the selected skill belongs to one conversation, not to the composer draft scope', () => {
  // draft 的 composer scope 是按项目固定的（未发文本要留住），所以换到同一项目里的另一张
  // 新会话时 scope 不变；skill token 若跟着 scope 走就会残留，用户既删不掉也发不出消息。
  assert.match(composer, /const skillScopeId = conversationId \|\| scopeId;/);
  assert.match(composer, /skillByConversationRef\.current\.get\(skillScopeId\) \|\| ''/);
  // 选择必须盖上当前会话的戳，换会话立刻失效，而不是等 effect 追平。
  assert.match(composer, /const setSelectedSkillName = React\.useCallback\(\(name\) => \{/);
  assert.match(composer, /if \(name\) skillByConversationRef\.current\.set\(scope, name\);/);
  assert.match(composer, /else skillByConversationRef\.current\.delete\(scope\);/);
});

test('switching conversations caches the skill per conversation and restores it on return', () => {
  assert.match(composer, /import \{ BoundedCache \} from '\.\.\/\.\.\/\.\.\/shared\/lib\/bounded-cache\.js';/);
  assert.match(composer, /new BoundedCache\(50\)/);
  // 切回来要恢复，所以换会话的 effect 只丢掉临时的菜单/待发状态，不能清掉选择。
  assert.match(composer, /\/\/ Switching conversations restores that conversation's own skill choice;/);
  const fromSwitch = composer.slice(composer.indexOf('// Switching conversations restores'));
  const switchEffect = fromSwitch.slice(0, fromSwitch.indexOf('}, [skillScopeId'));
  assert.doesNotMatch(switchEffect, /setSelectedSkillName\(''\)/, 'switching away must not discard the cached choice');
  assert.match(switchEffect, /selectedSkillNameRef\.current = selectedSkillName;/);
  assert.match(composer, /\}, \[skillScopeId, selectedSkillName\]\);/);
  // 发送完成仍然要真正清掉（否则切走再回来会诈尸）。
  const cleared = composer.slice(composer.indexOf('const clearComposerAfterSend'));
  assert.match(cleared.slice(0, cleared.indexOf('async function submit')), /setSelectedSkillName\(''\);/);
});

test('a bare skill token never swallows Enter without feedback', () => {
  assert.match(composer, /if \(selectedSkill\) setPathNotice\('Type a message after the skill, then press Enter\.'\);/);
  // 提示仍然走原有的 pathNotice 通道，输入或换会话会自动清掉。
  assert.match(composer, /React\.useEffect\(\(\) => setPathNotice\(''\), \[scopeId, draft\]\);/);
});

test('Backspace removes a skill token even when the upper state lost track of it', () => {
  assert.match(input, /hasSkillToken\(\) \{/);
  assert.match(input, /present = Boolean\(\$nodesOfType\(SkillTokenNode\)\[0\]\);/);
  assert.match(input, /hasSkillToken: \(\) => apiRef\.current\?\.hasSkillToken\(\) \?\? false,/);
  assert.match(composer, /&& \(selectedSkill \|\| selectedCommand \|\| inputRef\.current\?\.hasSkillToken\?\.\(\)\)/);
});

test('the composer scope follows the conversation actually on screen', () => {
  // 只有当前显示的会话就是这张 draft 时，composer 才用 draft 的稳定 scope。
  const scoped = shell.match(/composerScopeId=\{draftConversationRef\.current\?\.id === conversationId \? draftConversationRef\.current\.composerScopeId : conversationId\}/g) || [];
  const workflow = shell.match(/scopeId=\{draftConversationRef\.current\?\.id === conversationId \? draftConversationRef\.current\.composerScopeId : conversationId\}/g) || [];
  assert.equal(scoped.length, 1, 'chat composer scope is gated on the draft being current');
  assert.equal(workflow.length, 1, 'workflow composer scope is gated on the draft being current');
  assert.doesNotMatch(shell, /composerScopeId=\{draftConversationRef\.current\?\.composerScopeId \|\| conversationId\}/);
});
