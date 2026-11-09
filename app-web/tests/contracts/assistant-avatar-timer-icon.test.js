import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { assistantAgentIdForTask } from '../../src/features/chat/model/assistant-name.js';

const row = readFileSync(new URL('../../src/features/chat/components/ChatMessageRow.jsx', import.meta.url), 'utf8');
const timeline = readFileSync(new URL('../../src/features/chat/components/ChatTimelineNodes.jsx', import.meta.url), 'utf8');
const chatCss = readFileSync(new URL('../../styles/chat.css', import.meta.url), 'utf8');

test('the assistant bubble wears the executing agent avatar', () => {
  assert.match(row, /import \{ AgentAvatar \} from '\.\.\/\.\.\/\.\.\/shared\/ui\/AgentAvatar\.jsx';/);
  assert.match(row, /<AgentAvatar agentId=\{message\.agentId \|\| ''\} size="meta" \/>/);
  // 旧的企鹅 mask 图标不能留在助手气泡里。
  assert.doesNotMatch(row, /ico-assistant-avatar/);
  // Settings 的头像几何只作用在设置页，聊天必须自带尺寸与底色。
  assert.match(chatCss, /\.chat-speaker-avatar \.agent-avatar-frame \{[^}]*width: 28px;[^}]*background: #f4ecdd;/s);
  assert.match(chatCss, /\.chat-speaker-avatar \.agent-avatar-frame > img \{[^}]*object-fit: contain;[^}]*image-rendering: auto;/s);
});

test('the avatar follows the same agent record as the bubble name', () => {
  // 任务记录 → 这一轮的 agent id → 会话记录，和名字的取值顺序一致。
  assert.equal(assistantAgentIdForTask({ profileId: 'custom.code' }, { agentId: 'preset.general' }), 'custom.code');
  assert.equal(assistantAgentIdForTask({ requestedAgentId: 'custom.code' }, { agentId: 'preset.general' }), 'custom.code');
  assert.equal(assistantAgentIdForTask({}, { agentId: 'preset.general' }), 'preset.general');
  assert.equal(assistantAgentIdForTask({}, {}), '');

  const rows = readFileSync(new URL('../../src/features/app/model/chat-rows.js', import.meta.url), 'utf8');
  assert.match(rows, /const agentId = agentIdFor\(task\);/);
  assert.match(rows, /cachedRows\.agentId === agentId/);
  assert.match(rows, /role: 'agent',\s*agentName,\s*agentId,/);
});

test('the elapsed pill uses a timer icon instead of the disclosure chevron', () => {
  assert.match(timeline, /import \{ Bot, LoaderCircle, Sparkles, Timer \} from 'lucide-react';/);
  assert.doesNotMatch(timeline, /<ChatTimelineChevron open=\{expanded\} \/>/);
  assert.match(timeline, /<Timer className="chat-timeline-time-icon" size=\{13\} strokeWidth=\{2\.2\} aria-hidden="true" \/>/);
  // 定时任务用的是 Clock3，这里不能复用同一只图标。
  assert.doesNotMatch(timeline, /Clock3/);
  assert.match(chatCss, /\.chat-timeline-time-icon \{[^}]*color: #f4f7ff;/s);
});
