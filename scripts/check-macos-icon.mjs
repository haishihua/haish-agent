#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Fail before fetching/building runtimes when the build host lacks Xcode 26.
export function checkIconToolchain(run = spawnSync) {
  const result = run('xcrun', ['actool', '--version'], { encoding: 'utf8' });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const match = output.match(/<key>short-bundle-version<\/key>\s*<string>(\d+)(?:\.[\d.]+)?<\/string>/);
  if (result.status !== 0 || !match || Number(match[1]) < 26) {
    throw new Error('macOS icons require full Xcode 26 or newer (actool >= 26). Select it with xcode-select; Command Line Tools alone are insufficient.');
  }
  return Number(match[1]);
}

export function checkIconSource(projectRoot = root) {
  const config = JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
  if (config.build.mac.icon !== 'build/Haish.icon') {
    throw new Error('mac.icon must use build/Haish.icon for automatic system icon selection.');
  }
  const source = path.join(projectRoot, config.build.mac.icon);
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
export function verifyBundleIcons(appPath, run = spawnSync) {
  const resources = path.join(appPath, 'Contents', 'Resources');
  const plist = path.join(appPath, 'Contents', 'Info.plist');
  const value = (key) => {
    const result = run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`Packaged app is missing ${key}`);
    return result.stdout.trim();
  };
  if (value('CFBundleIconName') !== 'Icon') throw new Error('Packaged asset catalog icon name must be Icon.');
  const fallback = value('CFBundleIconFile');
  const icns = readFileSync(path.join(resources, fallback));
  if (icns.subarray(0, 4).toString() !== 'icns' || icns.length <= 8) {
    throw new Error('Packaged app is missing a valid ICNS fallback for older macOS.');
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
