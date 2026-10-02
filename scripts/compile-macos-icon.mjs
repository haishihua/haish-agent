import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIconToolchain } from './check-macos-icon.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const catalogIconName = 'Haish';

// Xcode 26.1+ changed legacy rendition selection. Compile just the icon with
// 26.0.1, without generating a new-design bitmap fallback inside Assets.car.
// The rest of the application can use the build host's current Xcode.
export function iconCompilerEnvironment(env = process.env) {
  return { ...env, ...(env.HAISH_ICON_DEVELOPER_DIR ? { DEVELOPER_DIR: env.HAISH_ICON_DEVELOPER_DIR } : {}) };
}

export function iconCompilerArgs(output) {
  return ['actool', path.join(root, 'build/Haish.icon'),
    '--compile', output, '--app-icon', catalogIconName,
    '--enable-on-demand-resources', 'NO', '--development-region', 'en',
    '--target-device', 'mac', '--platform', 'macosx',
    '--enable-icon-stack-fallback-generation=disabled', '--include-all-app-icons',
    '--minimum-deployment-target', '12.0',
    '--output-partial-info-plist', path.join(output, 'icon-info.plist')];
}

export function compileModernIcon(run = spawnSync) {
  checkIconToolchain(run);
  const output = mkdtempSync(path.join(tmpdir(), 'haish-hybrid-icon-'));
  try {
    const result = run('xcrun', iconCompilerArgs(output), {
      encoding: 'utf8', env: iconCompilerEnvironment(),
    });
    if (result.status !== 0) throw new Error(`Hybrid icon compilation failed: ${result.stderr || result.stdout || result.error || 'actool unavailable'}`);
    const catalog = path.join(output, 'Assets.car');
    if (!statSync(catalog).size) throw new Error('Hybrid icon compiler produced an empty Assets.car');
    return readFileSync(catalog);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}
