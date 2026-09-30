import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { inflateSync } from 'node:zlib';
import { checkIconSource, checkIconToolchain, verifyBundleIcons } from '../../../scripts/check-macos-icon.mjs';
import afterPack from '../../../scripts/verify-macos-icon-after-pack.mjs';

const root = new URL('../../../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const pkg = JSON.parse(read('package.json'));
const icon = JSON.parse(read('build/Haish.icon/icon.json'));

// Decode RGBA scanlines without requiring native Electron or an image dependency.
function pngPixels(file) {
  const bytes = fs.readFileSync(new URL(file, root));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  assert.equal(bytes[24], 8);
  assert.equal(bytes[25], 6);
  assert.equal(bytes[28], 0);
  const idat = [];
  for (let offset = 8; offset < bytes.length;) {
    const size = bytes.readUInt32BE(offset);
    if (bytes.subarray(offset + 4, offset + 8).toString() === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += size + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
    return da <= db && da <= dc ? a : db <= dc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const a = x >= 4 ? pixels[at - 4] : 0;
      const b = y ? pixels[at - stride] : 0;
      const c = y && x >= 4 ? pixels[at - stride - 4] : 0;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      pixels[at] = (raw[y * (stride + 1) + x + 1] + predictor) & 255;
    }
  }
  return { width, height, alpha: (x, y) => pixels[(y * width + x) * 4 + 3] };
}

test('one Icon Composer source replaces the release ICNS input', () => {
  assert.equal(pkg.build.mac.icon, 'build/Haish.icon');
  assert.doesNotThrow(() => checkIconSource());
  assert.equal(icon.supportedPlatforms, undefined);
  assert.equal(icon['supported-platforms'].squares, 'shared');
  assert.ok(icon.fill.solid.endsWith(',1.00000'));
  assert.equal(icon.groups[0].layers[0]['image-name'], 'penguin.png');
});

test('foreground is 1024px RGBA without the old card; background comes from Composer', () => {
  const image = pngPixels('build/Haish.icon/Assets/penguin.png');
  assert.equal(image.width, 1024);
  assert.equal(image.height, 1024);
  for (const [x, y] of [[0, 0], [1023, 0], [0, 1023], [1023, 1023], [128, 256], [896, 256]]) {
    assert.equal(image.alpha(x, y), 0);
  }
  assert.equal(image.alpha(512, 512), 255);
  assert.equal(image.alpha(512, 1023), 255);
  // Preserve the illustration instead of turning its painted texture into glass.
  assert.equal(icon.groups[0].layers[0].glass, false);
});

test('only unpackaged macOS calls dock.setIcon; packaged icon is system-selected', () => {
  const source = read('src/main/main.ts').match(/function applyDockIcon\(\): void \{([\s\S]*?)\n\}/)[1];
  for (const [platform, packaged, expected] of [['darwin', true, 0], ['darwin', false, 1], ['linux', false, 0]]) {
    const calls = [];
    vm.runInNewContext(`function applyDockIcon() {${source}}; applyDockIcon();`, {
      process: { platform },
      app: { isPackaged: packaged, dock: { setIcon: (value) => calls.push(value) } },
      appIconPngPath: () => 'dev-logo.png',
    });
    assert.equal(calls.length, expected);
  }
});

test('all Mac packaging commands fail early if the icon toolchain is unavailable', () => {
  for (const script of ['pack:mac', 'dist:mac', 'dist:mac:release']) {
    assert.ok(pkg.scripts[script].startsWith('npm run check:mac-icon &&'));
  }
  const release = read('scripts/release-mac.mjs');
  assert.ok(release.indexOf("run('node', ['scripts/check-macos-icon.mjs'])") < release.indexOf("runCapture('gh'"));
  assert.equal(pkg.build.afterPack, 'scripts/verify-macos-icon-after-pack.mjs');
});

test('toolchain accepts Xcode 26+ and rejects older/absent actool', () => {
  const version = (n) => () => ({ status: 0, stdout: `<key>short-bundle-version</key>\n<string>${n}</string>` });
  assert.equal(checkIconToolchain(version('26.1')), 26);
  assert.equal(checkIconToolchain(version('27.0')), 27);
  assert.throws(() => checkIconToolchain(version('25.0')), /Xcode 26/);
  assert.throws(() => checkIconToolchain(() => ({ status: 1, stderr: 'actool unavailable' })), /Command Line Tools/);
});

function withBundle(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haish-icon-test-'));
  const resources = path.join(dir, 'Contents/Resources');
  fs.mkdirSync(resources, { recursive: true });
  fs.writeFileSync(path.join(resources, 'Assets.car'), 'catalog-fixture');
  fs.writeFileSync(path.join(resources, 'icon.icns'), Buffer.from('icns\x00\x00\x00\x0cTEST'));
  const keys = { CFBundleIconName: 'Icon', CFBundleIconFile: 'icon.icns', LSMinimumSystemVersion: '12.0' };
  const run = (_command, args) => ({ status: keys[args[1]] ? 0 : 1, stdout: keys[args[1]] });
  try { fn(dir, resources, keys, run); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('bundle check requires both representations and the matching plist keys', () => {
  withBundle((dir, resources, keys, run) => {
    assert.doesNotThrow(() => verifyBundleIcons(dir, run));
    keys.CFBundleIconName = 'Wrong';
    assert.throws(() => verifyBundleIcons(dir, run), /name must be Icon/);
    keys.CFBundleIconName = 'Icon';
    fs.unlinkSync(path.join(resources, 'Assets.car'));
    assert.throws(() => verifyBundleIcons(dir, run));
  });
});

test('bundle check rejects empty/broken ICNS fallback and raised minimum OS', () => {
  withBundle((dir, resources, keys, run) => {
    keys.LSMinimumSystemVersion = '26.0';
    assert.throws(() => verifyBundleIcons(dir, run), /must not raise/);
    keys.LSMinimumSystemVersion = '12.0';
    fs.writeFileSync(path.join(resources, 'icon.icns'), 'invalid');
    assert.throws(() => verifyBundleIcons(dir, run), /valid ICNS fallback/);
  });
});

test('afterPack does not impose Mac icon requirements on other platforms', async () => {
  await assert.doesNotReject(() => afterPack({ electronPlatformName: 'linux' }));
});
