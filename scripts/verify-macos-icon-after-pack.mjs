import path from 'node:path';
import { verifyBundleIcons } from './check-macos-icon.mjs';

export default async function verifyMacOSIcon(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  verifyBundleIcons(appPath);
  console.log('[macos-icon] verified asset catalog, ICNS fallback, and older macOS deployment target.');
}
