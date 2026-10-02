import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { compileModernIcon, catalogIconName } from './compile-macos-icon.mjs';
import { verifyBundleIcons } from './check-macos-icon.mjs';

export default async function verifyMacOSIcon(context, compile = compileModernIcon, run = spawnSync) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  // electron-builder copies the original ICNS. Add only the modern catalog;
  // never replace legacy artwork with the compiler's rendered fallback.
  writeFileSync(path.join(appPath, 'Contents/Resources/Assets.car'), compile());
  const result = run('/usr/libexec/PlistBuddy', [
    '-c', `Add :CFBundleIconName string ${catalogIconName}`,
    path.join(appPath, 'Contents/Info.plist'),
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Cannot configure hybrid icon: ${result.stderr || result.error}`);
  verifyBundleIcons(appPath);
  console.log('[macos-icon] verified modern catalog, original legacy ICNS, and older macOS deployment target.');
}
