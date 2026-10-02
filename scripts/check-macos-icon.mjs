#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Fail early rather than silently using a compiler with different legacy renditions.
export function checkIconToolchain(run = spawnSync) {
  const env = { ...process.env, ...(process.env.HAISH_ICON_DEVELOPER_DIR
    ? { DEVELOPER_DIR: process.env.HAISH_ICON_DEVELOPER_DIR } : {}) };
  const result = run('xcrun', ['actool', '--version'], { encoding: 'utf8', env });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const match = output.match(/<key>short-bundle-version<\/key>\s*<string>([\d.]+)<\/string>/);
  // actool's own patch version need not match the enclosing Xcode patch.
  const xcode = run('xcrun', ['xcodebuild', '-version'], { encoding: 'utf8', env });
  if (result.status !== 0 || !match || Number(match[1].split('.')[0]) < 26
      || xcode.status !== 0 || !/^Xcode 26\.0\.1\s*$/m.test(xcode.stdout || '')) {
    throw new Error('Hybrid macOS icons require full Xcode 26.0.1 for icon compilation. Set HAISH_ICON_DEVELOPER_DIR to its Contents/Developer path; Command Line Tools alone are insufficient. Newer actool can replace legacy artwork inside Assets.car.');
  }
  return Number(match[1].split('.')[0]);
}

export function checkIconSource(projectRoot = root) {
  const config = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  if (config.build.mac.icon !== 'build/icon.icns') {
    throw new Error('mac.icon must retain build/icon.icns as the original legacy artwork.');
  }
  const legacy = readFileSync(path.join(projectRoot, config.build.mac.icon));
  if (legacy.subarray(0, 4).toString() !== 'icns' || legacy.length <= 8) {
    throw new Error('Original legacy ICNS is missing or invalid.');
  }
  const source = path.join(projectRoot, 'build/Haish.icon');
  const icon = JSON.parse(readFileSync(path.join(source, 'icon.json'), 'utf8'));
  if (!icon.fill?.solid) throw new Error('The app icon must have a full-bleed background.');
  for (const group of icon.groups) {
    for (const layer of group.layers) {
      const file = path.join(source, 'Assets', layer['image-name']);
      if (!existsSync(file) || !statSync(file).size) throw new Error(`Missing icon layer: ${file}`);
    }
  }
}

// Runs before code signing/DMG creation, so missing assets cannot be shipped.
export function verifyBundleIcons(appPath, run = spawnSync, projectRoot = root) {
  const resources = path.join(appPath, 'Contents', 'Resources');
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const value = (key) => {
    const result = run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Packaged app is missing ${key}`);
    return result.stdout.trim();
  };
  if (value('CFBundleIconName') !== 'Haish') throw new Error('Packaged asset catalog icon name must be Haish.');
  const fallback = value('CFBundleIconFile');
  const icns = readFileSync(path.join(resources, fallback));
  if (icns.subarray(0, 4).toString() !== 'icns' || icns.length <= 8) {
    throw new Error('Packaged app is missing a valid ICNS fallback for older macOS.');
  }
  if (!icns.equals(readFileSync(path.join(projectRoot, 'build/icon.icns')))) {
    throw new Error('Packaged ICNS must be byte-identical to the original legacy icon, not a rendering of the new design.');
  }
  if (!statSync(path.join(resources, 'Assets.car')).size) throw new Error('Packaged icon asset catalog is empty.');
  if (Number(value('LSMinimumSystemVersion').split('.')[0]) >= 26) {
    throw new Error('Icon migration must not raise the app minimum macOS version to 26.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkIconSource();
    const version = checkIconToolchain();
    console.log(`[macos-icon] source OK; actool ${version} supports Icon Composer.`);
  } catch (error) {
    console.error(`[macos-icon] ${error.message}`);
    process.exitCode = 1;
  }
}
