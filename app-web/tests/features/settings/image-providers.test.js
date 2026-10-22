import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildToolView } from '../../../src/features/chat/model/tool-view.js';
import {
  applyLlmSettingsPayloadToDraft,
  createImageProviderDraft,
  mergeLlmSettingsDraft,
  normalizeImageDraft,
  setImageProviderEnabled,
} from '../../../src/features/settings/model/llm-settings.js';

// The image tool is rendered by its own card, so the view has to carry both the
// flag and the artifact path the preview endpoint resolves.
test('image_generate builds a process view with the generated artifact path', () => {
  const view = buildToolView({
    toolName: 'image_generate',
    status: 'completed',
    toolInput: { prompt: 'a red panda in a teacup' },
    toolResponse: {
      status: 'ok',
      summary: 'Image generated',
      artifacts: { images: [{ type: 'image', mimeType: 'image/png', path: '/tmp/tasks/a/images/gen-1.png' }] },
    },
  });
  assert.equal(view.mode, 'process');
  assert.equal(view.isImageGen, true);
  assert.equal(view.generatedImagePath, '/tmp/tasks/a/images/gen-1.png');
  assert.equal(view.task, 'a red panda in a teacup');
});

test('a failed image generation keeps the error and exposes no path', () => {
  const view = buildToolView({
    toolName: 'image_generate',
    status: 'failed',
    toolInput: { prompt: 'x' },
    toolResponse: { status: 'error', summary: 'Image provider rejected the request', error: { message: 'moderation_blocked' } },
  });
  assert.equal(view.mode, 'process');
  assert.equal(view.failed, true);
  assert.equal(view.generatedImagePath, '');
  assert.match(view.error, /moderation_blocked|rejected/);
});

test('the image list keeps at most one enabled provider', () => {
  const draft = normalizeImageDraft({
    providers: [
      { id: 'image-1', provider: 'openai', model: 'gpt-image-1', enabled: true },
      { id: 'image-2', provider: 'custom', model: 'router-image', enabled: true },
    ],
  });
  assert.deepEqual(draft.providers.map((entry) => entry.enabled), [true, false]);
  assert.deepEqual(draft.providers.map((entry) => entry.id), ['image-1', 'image-2']);
  assert.equal('mode' in draft, false, 'image providers have no mode field');
});

test('enabling an image provider releases the other one', () => {
  const draft = normalizeImageDraft({
    providers: [
      { id: 'image-1', provider: 'openai', enabled: true },
      { id: 'image-2', provider: 'custom', enabled: false },
    ],
  });
  const next = setImageProviderEnabled(draft, 'image-2', true);
  assert.deepEqual(next.providers.map((entry) => entry.enabled), [false, true]);
});

test('a new image provider starts disabled and defaults to openai', () => {
  const draft = createImageProviderDraft();
  assert.equal(draft.enabled, false);
  assert.equal(draft.provider, 'openai');
  assert.equal(draft.auth_mode, 'api_key');
  assert.match(draft.id, /^image-/);
});

// Settings round-trips must preserve the section, otherwise a saved image
// provider disappears the next time the panel loads.
test('saved image providers survive the payload round-trip', () => {
  const payload = {
    chat: { id: 'chat', provider: 'openai', model: 'gpt-5' },
    image: {
      enabled: true,
      providers: [{ id: 'image-1', enabled: true, provider: 'custom', name: 'router', model: 'img-1', base_url: 'https://x/v1' }],
    },
  };
  const draft = applyLlmSettingsPayloadToDraft({}, payload);
  assert.equal(draft.image.providers.length, 1);
  assert.equal(draft.image.providers[0].id, 'image-1');
  assert.equal(draft.image.providers[0].enabled, true);
  assert.equal(draft.image.providers[0].model, 'img-1');

  const merged = mergeLlmSettingsDraft(
    { ...draft, image: { providers: [...draft.image.providers, { ...createImageProviderDraft(), model: 'draft-only' }] } },
    draft,
    draft,
  );
  assert.deepEqual(merged.image.providers.map((entry) => entry.model), ['img-1', 'draft-only']);
});

// 列表行已经有开关，编辑面板再放一个是同一件事两处入口；vision 与 image 同规矩。
test('the image editor leaves the enable switch to the list row', () => {
  const source = readFileSync(
    new URL('../../../src/features/settings/components/LlmConfigEditor.jsx', import.meta.url),
    'utf8',
  );
  assert.ok(!source.includes('Enable image provider'), 'image 编辑面板不再自带启用开关');
  assert.ok(!source.includes('Enable vision provider'), 'vision 编辑面板不再自带启用开关');
  assert.ok(!source.includes('onToggleVisionProvider'), '编辑面板不再透传启用开关回调');
});
