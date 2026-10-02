import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { inflateSync } from 'node:zlib';
import { checkIconSource, checkIconToolchain, verifyBundleIcons } from '../../../scripts/check-macos-icon.mjs';
import afterPack from '../../../scripts/verify-macos-icon-after-pack.mjs';
import { compileModernIcon, iconCompilerArgs, iconCompilerEnvironment } from '../../../scripts/compile-macos-icon.mjs';

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

test('original legacy ICNS is the release input; modern artwork remains separate', () => {
  assert.equal(pkg.build.mac.icon, 'build/icon.icns');
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
  const workflow = read('.github/workflows/release-macos.yml');
  assert.match(workflow, /HAISH_ICON_DEVELOPER_DIR: \/Applications\/Xcode_26\.0\.1\.app\/Contents\/Developer/);
  assert.match(workflow, /DEVELOPER_DIR="\$HAISH_ICON_DEVELOPER_DIR" xcrun actool --version/);
});

test('hybrid icon toolchain pins 26.0.1 and rejects newer fallback-generation behavior', () => {
  const version = (n) => (_cmd, argv) => ({ status: 0, stdout: argv[0] === 'xcodebuild'
    ? `Xcode ${n}\nBuild version test` : '<key>short-bundle-version</key>\n<string>26.0</string>' });
  assert.equal(checkIconToolchain(version('26.0.1')), 26);
  assert.throws(() => checkIconToolchain(version('26.1')), /26.0.1/);
  assert.throws(() => checkIconToolchain(version('27.0')), /26.0.1/);
  assert.throws(() => checkIconToolchain(version('25.0')), /Xcode 26/);
  assert.throws(() => checkIconToolchain(() => ({ status: 1, stderr: 'actool unavailable' })), /Command Line Tools/);
});

function withBundle(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haish-icon-test-'));
  const resources = path.join(dir, 'Contents/Resources');
  fs.mkdirSync(resources, { recursive: true });
  fs.writeFileSync(path.join(resources, 'Assets.car'), 'catalog-fixture');
  fs.writeFileSync(path.join(resources, 'icon.icns'), fs.readFileSync(new URL('build/icon.icns', root)));
  const keys = { CFBundleIconName: 'Haish', CFBundleIconFile: 'icon.icns', LSMinimumSystemVersion: '12.0' };
  const run = (_command, args) => ({ status: keys[args[1]] ? 0 : 1, stdout: keys[args[1]] });
  try { fn(dir, resources, keys, run); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('bundle check requires both representations and the matching plist keys', () => {
  withBundle((dir, resources, keys, run) => {
    assert.doesNotThrow(() => verifyBundleIcons(dir, run));
    keys.CFBundleIconName = 'Wrong';
    assert.throws(() => verifyBundleIcons(dir, run), /name must be Haish/);
    keys.CFBundleIconName = 'Haish';
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

test('a valid but regenerated new-design ICNS cannot pass as the original icon', () => {
  withBundle((dir, resources, _keys, run) => {
    const file = path.join(resources, 'icon.icns');
    const bytes = fs.readFileSync(file);
    bytes[bytes.length - 1] ^= 1;
    fs.writeFileSync(file, bytes);
    assert.throws(() => verifyBundleIcons(dir, run), /byte-identical/);
  });
});

test('modern compiler disables bitmap fallback and cleans its output on success/failure', () => {
  const args = iconCompilerArgs('/tmp/output');
  assert.ok(args.includes('--enable-icon-stack-fallback-generation=disabled'));
  assert.equal(args[args.indexOf('--minimum-deployment-target') + 1], '12.0');
  assert.equal(args[args.indexOf('--app-icon') + 1], 'Haish');
  assert.equal(iconCompilerEnvironment({ HAISH_ICON_DEVELOPER_DIR: '/pinned', DEVELOPER_DIR: '/default' }).DEVELOPER_DIR, '/pinned');
  let output;
  const run = (_command, argv) => {
    if (argv[0] === 'xcodebuild') return { status: 0, stdout: 'Xcode 26.0.1\nBuild version test' };
    if (argv.includes('--version')) return { status: 0, stdout: '<key>short-bundle-version</key><string>26.0</string>' };
    output = argv[argv.indexOf('--compile') + 1];
    fs.writeFileSync(path.join(output, 'Assets.car'), 'modern-catalog');
    return { status: 0 };
  };
  assert.equal(compileModernIcon(run).toString(), 'modern-catalog');
  assert.equal(fs.existsSync(output), false);
  assert.throws(() => compileModernIcon((cmd, argv) => {
    if (argv.includes('--version') || argv[0] === 'xcodebuild') return run(cmd, argv);
    output = argv[argv.indexOf('--compile') + 1];
    return { status: 1, stderr: 'compile-error' };
  }), /compile-error/);
  assert.equal(fs.existsSync(output), false);
});

test('afterPack writes only the modern catalog, preserves original ICNS and configures plist', { skip: process.platform !== 'darwin' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haish-pack-test-'));
  const app = path.join(dir, 'Haish.app');
  const resources = path.join(app, 'Contents/Resources');
  fs.mkdirSync(resources, { recursive: true });
  const legacy = fs.readFileSync(new URL('build/icon.icns', root));
  fs.writeFileSync(path.join(resources, 'icon.icns'), legacy);
  fs.writeFileSync(path.join(app, 'Contents/Info.plist'), `<?xml version="1.0"?><plist version="1.0"><dict>
    <key>CFBundleIconFile</key><string>icon.icns</string>
    <key>LSMinimumSystemVersion</key><string>12.0</string></dict></plist>`);
  try {
    await afterPack({ electronPlatformName: 'darwin', appOutDir: dir, packager: { appInfo: { productFilename: 'Haish' } } }, () => Buffer.from('modern-catalog-fixture'));
    assert.ok(fs.readFileSync(path.join(resources, 'icon.icns')).equals(legacy));
    assert.equal(fs.readFileSync(path.join(resources, 'Assets.car')).toString(), 'modern-catalog-fixture');
    assert.doesNotThrow(() => verifyBundleIcons(app));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('afterPack does not impose Mac icon requirements on other platforms', async () => {
  await assert.doesNotReject(() => afterPack({ electronPlatformName: 'linux' }));
});
