import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

import {
  OPTICAL_LOGO_SIZE,
  PROVIDER_LOGO_INK,
  providerLogoSize,
} from '../../../src/features/settings/model/provider-logo-metrics.js';

const root = path.resolve(import.meta.dirname, '../../../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('every served provider mark is normalised to one optical size', () => {
  for (const [key, ink] of Object.entries(PROVIDER_LOGO_INK)) {
    const size = providerLogoSize(key);
    assert.ok(size >= 18, `${key} should remain visible`);
    // 24px 的框里，墨迹随框等比放大后必须落到同一个光学尺寸（允许取整误差）。
    assert.ok(
      Math.abs((ink / 24) * size - OPTICAL_LOGO_SIZE * (key === 'xai' ? 0.75 : 1)) <= 0.6,
      `${key}: ink ${ink}/24 * ${size}px should reach ${OPTICAL_LOGO_SIZE}`,
    );
    // 放大不能越出 32px 的媒体格，否则会压到标题文字。
    assert.ok(size <= 32, `${key} grows past the 32px media slot`);
  }
});

test('unknown providers keep their native size', () => {
  assert.equal(providerLogoSize('not-a-provider'), null);
  assert.equal(providerLogoSize(''), null);
  assert.equal(providerLogoSize(undefined), null);
});

test('both logo renderers size the mark through its box, not a transform', () => {
  // 列表的媒体格是 overflow:hidden，transform 放大的部分会被裁掉，看起来等于没改。
  const legacy = read('app-web/src/features/settings/components/settings-ui.jsx');
  assert.match(legacy, /const size = providerLogoSize\(scaleKey, opticalSize\)/);
  assert.match(legacy, /width: size, height: size/);
  assert.doesNotMatch(legacy, /settings-logo-scale/);

  const primitives = read('app-web/src/features/settings/components/SettingsPrimitives.jsx');
  assert.match(primitives, /const size = providerLogoSize\(provider, opticalSize\)/);
  assert.match(primitives, /<Logo style=\{sized\} \/>/);
  assert.match(primitives, /<img src=\{brand\} alt="" style=\{sized\} \/>/);
  assert.match(primitives, /<LegacyProviderIcon provider=\{provider\} opticalSize=\{opticalSize\} \/>/);
  assert.equal(providerLogoSize('xai'), 18);
  assert.equal(providerLogoSize('xai', 16), 13);
  assert.doesNotMatch(primitives, /settings-logo-scale/);

  const css = read('app-web/styles/app-shell.css');
  assert.doesNotMatch(css, /settings-logo-scale/);
});
