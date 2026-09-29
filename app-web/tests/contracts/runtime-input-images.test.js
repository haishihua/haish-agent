import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = {};

const { buildChatTimeline } = await import('../../src/features/chat/model/chat-timeline.js');

const chatPanelSource = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatPanel.jsx', import.meta.url),
  'utf8',
);
const composerSource = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatComposer.jsx', import.meta.url),
  'utf8',
);
const deploySource = fs.readFileSync(
  new URL('../../src/features/tasks/hooks/createDeployHandlers.js', import.meta.url),
  'utf8',
);

test('runtime input accepts image-only payloads without a queued toast', () => {
  assert.doesNotMatch(composerSource, /if \(!file \|\| running\) return/);
  assert.match(composerSource, /onSend\?\.\(submittedText, null, sendModelId, reasoningEffort, readyImages/);
  assert.match(composerSource, /running && allowRuntimeInput && hasComposerPayload/);
  // 聊天详情只负责摆消息：输入框自己的状态和发送判定不能又抄一份。
  assert.doesNotMatch(chatPanelSource, /readyImages|hasComposerPayload|sendBeamActive/);
  assert.match(deploySource, /queueTaskInput\([\s\S]*?runningTaskId,[\s\S]*?request\.text,[\s\S]*?request\.imageAttachments,[\s\S]*?request\.displayText/);
  assert.match(deploySource, /uploadImagesBestEffort\(request\.imageAttachments, activeId\)/);
  assert.doesNotMatch(deploySource, /Instruction queued\./);
});

test('an accepted steering send consumes the composer image drafts', () => {
  // 纠偏发送把输入框里的图片带进运行中的任务（readyImages → queueTaskInput）。发送被接受
  // 之后图片必须跟正文一起离开输入框：旧代码里 running 分支只调 clearComposerAfterSend，
  // 而这个出口只清正文，图片草稿留在 store 里继续渲染 → 截图里「图片还在输入框留了一份」。
  assert.match(
    composerSource,
    /const clearComposerAfterSend = \(\) => \{\n\s+setComposerImages\(\[\]\);/,
    '清空出口的第一件事就是丢掉图片草稿',
  );
  // 两条发送路径共用这一个出口，谁都不许再自己清一遍图片。
  assert.equal((composerSource.match(/setComposerImages\(\[\]\)/g) || []).length, 1, '图片草稿的清空只有一份实现');
  assert.match(composerSource, /if \(accepted !== false\) clearComposerAfterSend\(\);/);
  assert.match(composerSource, /clearComposerAfterSend\(\);\n\s+onClearFile\?\.\(\);/);
  // 清空只丢 store 里的条目：刚发出的那条消息的缩略图还要用同一个 blob URL，不能 revoke。
  const clearStart = composerSource.indexOf('const clearComposerAfterSend');
  assert.ok(clearStart > 0, 'clearComposerAfterSend 还在');
  assert.doesNotMatch(composerSource.slice(clearStart, clearStart + 400), /revokeObjectURL/);
});

test('the steering image fixture drives the real composer', () => {
  const fixtureHtml = fs.readFileSync(new URL('../fixtures/composer-steering-image.html', import.meta.url), 'utf8');
  const fixtureModule = fs.readFileSync(new URL('../fixtures/composer-steering-image.jsx', import.meta.url), 'utf8');
  assert.match(fixtureHtml, /src="\.\/composer-steering-image\.jsx"/);
  assert.match(
    fixtureModule,
    /import \{ ChatComposer \} from '\.\.\/\.\.\/src\/features\/chat\/components\/ChatComposer\.jsx'/,
  );
  assert.match(fixtureModule, /import '\.\.\/\.\.\/styles\/chat\.css'/);
  // 纠偏按钮 + chip 选择器：夹具量的是真实渲染出来的输入框。
  assert.match(fixtureModule, /submitButton\('Add instruction'\)/);
  assert.match(fixtureModule, /querySelectorAll\('\.chat-composer-image-chip'\)/);
});

test('runtime input images remain visible when the applied event replaces the queued state', () => {
  const timeline = buildChatTimeline({
    conversationId: 'conversation-1',
    eventLog: [
      {
        type: 'task_input_queued',
        inputId: 'input-1',
        message: '',
        imageAttachments: [{ image_id: 'image-1', path: '/tmp/image.png', mime: 'image/png' }],
      },
      {
        type: 'task_input_applied',
        inputs: [{
          input_id: 'input-1',
          message: '',
          image_attachments: [{ image_id: 'image-1', path: '/tmp/image.png', mime: 'image/png' }],
        }],
      },
    ],
  }, 'running');

  const [input] = timeline.items.filter((item) => item.kind === 'user_input');
  assert.equal(input.status, 'applied');
  assert.equal(input.images.length, 1);
  assert.match(input.images[0].previewUrl, /\/api\/conversations\/conversation-1\/messages\/images\/preview/);
});
