import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = {};

const { buildChatTimeline } = await import('../../src/features/chat/model/chat-timeline.js');

const chatPanelSource = fs.readFileSync(
  new URL('../../src/features/chat/components/ChatPanel.jsx', import.meta.url),
  'utf8',
);
const deploySource = fs.readFileSync(
  new URL('../../src/features/tasks/hooks/createDeployHandlers.js', import.meta.url),
  'utf8',
);

test('runtime input accepts image-only payloads without a queued toast', () => {
  assert.doesNotMatch(chatPanelSource, /if \(!file \|\| running\) return/);
  assert.match(chatPanelSource, /onSend\?\.\(submittedText, null, sendModelId, reasoningEffort, readyImages/);
  assert.match(chatPanelSource, /running && hasComposerPayload/);
  assert.match(deploySource, /queueTaskInput\(runningTaskId, text, request\.imageAttachments, request\.displayText\)/);
  assert.doesNotMatch(deploySource, /Instruction queued\./);
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
