import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { providerLogoSize } from '../../../src/shared/lib/provider-logo-metrics.js';

const picker = readFileSync(new URL('../../../src/features/chat/components/ModelPickers.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../../styles/delegation.css', import.meta.url), 'utf8');

test('provider rows reuse the Settings brand mark at a picker-sized optical box', () => {
  assert.match(picker, /import \{ ProviderBrandMark \} from '\.\.\/\.\.\/\.\.\/shared\/ui\/ProviderIcon\.jsx';/);
  assert.match(picker, /<ProviderBrandMark provider=\{option\.provider\} name=\{[^}]+\} opticalSize=\{16\} \/>/);
  // 当前 Provider 入口和列表每一行都带头像，不只是子菜单标题。
  assert.equal(picker.match(/<ProviderGlyph option=\{/g)?.length, 2);
  assert.equal(providerLogoSize('openai', 16), 16);
  assert.equal(providerLogoSize('gemini', 16), 20);
  assert.equal(providerLogoSize('xai', 16), 13);
  assert.match(css, /\.chat-composer \.model-picker-option-glyph \.settings-brand,\s*\n\.chat-composer \.model-picker-option-glyph \.settings-provider-icon \{[^}]*border: 0;/);
});

test('model rows infer the vendor mark and fall back to one neutral icon', () => {
  assert.match(picker, /import \{ providerBrandForModel \} from '\.\.\/\.\.\/\.\.\/shared\/lib\/provider-brand\.js';/);
  assert.match(picker, /const brand = providerBrandForModel\(modelId\);/);
  assert.match(picker, /<AppIcon name="box" size=\{15\} className="model-picker-option-glyph-fallback" \/>/);
  // 当前模型入口（思考级别面板）和列表每一行都带图标。
  assert.equal(picker.match(/<ModelGlyph modelId=\{/g)?.length, 3);
});

test('the provider list is height-capped and scrolls like the model list', () => {
  assert.match(
    css,
    /\.chat-composer \.model-picker-flyout-provider \{\s*width: 240px;\s*min-width: 240px;\s*max-height: 360px;\s*overflow: hidden;/,
  );
  assert.match(
    css,
    /\.chat-composer \.model-picker-flyout-provider \.model-picker-list \{\s*max-height: 300px;\s*overflow-y: auto;/,
  );
});

test('the agent, provider and model lists hide their scrollbar until hovered', () => {
  assert.match(
    css,
    /\.chat-composer \.model-picker-flyout-model \.model-picker-list::-webkit-scrollbar,\s*\n\.chat-composer \.model-picker-flyout-provider \.model-picker-list::-webkit-scrollbar,\s*\n\.agent-picker-list::-webkit-scrollbar \{\s*\n\s*width: 6px;/,
  );
  assert.match(
    css,
    /\.chat-composer \.model-picker-flyout-model \.model-picker-list::-webkit-scrollbar-thumb,\s*\n\.chat-composer \.model-picker-flyout-provider \.model-picker-list::-webkit-scrollbar-thumb,\s*\n\.agent-picker-list::-webkit-scrollbar-thumb \{\s*\n\s*background: transparent;/,
  );
  assert.match(
    css,
    /\.chat-composer \.model-picker-flyout-model \.model-picker-list:hover::-webkit-scrollbar-thumb,\s*\n\.chat-composer \.model-picker-flyout-provider \.model-picker-list:hover::-webkit-scrollbar-thumb,\s*\n\.agent-picker-list:hover::-webkit-scrollbar-thumb \{\s*\n\s*background: rgba\(176, 206, 255, 0\.22\);/,
  );
});
