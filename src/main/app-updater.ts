import { app, BrowserWindow } from 'electron';
import { spawn, spawnSync } from 'node:child_process';
import electronUpdater from 'electron-updater';
import type { ProgressInfo, UpdateInfo } from 'electron-updater';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AppUpdateState, AppUpdateStatus } from '../shared/haish-api.js';

const { autoUpdater } = electronUpdater;

let currentState: AppUpdateState = createIdleState();
let initialized = false;

/**
 * Electron reports `app.isPackaged === true` when the runtime binary is renamed
 * (e.g. Electron.app → Haish.app for a custom dock icon). That still lives under
 * `node_modules/electron/dist` and is not a real release install.
 */
function isRealPackagedBuild(): boolean {
  if (!app.isPackaged) return false;
  if (process.env.HAISH_DEV_MODE === '1') return false;

  // Renaming Electron.app → Haish.app for a custom dock icon still leaves the
  // binary under node_modules/electron/dist. That is not a release install.
  const execPath = app.getPath('exe');
  const normalized = execPath.split(path.sep).join('/');
  if (normalized.includes('/node_modules/electron/')) {
    return false;
  }

  return true;
}

function createIdleState(partial: Partial<AppUpdateState> = {}): AppUpdateState {
  return {
    status: 'idle',
    currentVersion: app.getVersion(),
    availableVersion: undefined,
    progressPercent: undefined,
    message: undefined,
    canInstall: false,
    isPackaged: isRealPackagedBuild(),
    ...partial,
  };
}

function setState(partial: Partial<AppUpdateState> & { status?: AppUpdateStatus }): AppUpdateState {
  currentState = {
    ...currentState,
    currentVersion: app.getVersion(),
    isPackaged: isRealPackagedBuild(),
    ...partial,
  };
  broadcastState();
  return currentState;
}

function broadcastState(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('app-update:state', currentState);
  }
}

function describeError(error: unknown): string {
  const raw = error instanceof Error && error.message
    ? error.message
    : String(error || 'Unknown update error');

  if (/app-update\.yml/i.test(raw) || /ENOENT/i.test(raw)) {
    return 'Only in installed builds';
  }
  if (/401|403|Bad credentials|Not Found/i.test(raw)) {
    return 'Update feed unavailable';
  }
  if (/net::|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(raw)) {
    return 'Network error';
  }
  // Keep short; long absolute paths belong in logs, not the UI.
  return raw.length > 80 ? `${raw.slice(0, 77)}…` : raw;
}

function unsupportedState(): AppUpdateState {
  return setState({
    status: 'unsupported',
    message: 'Only in installed builds',
    canInstall: false,
  });
}

export function getAppUpdateState(): AppUpdateState {
  return currentState;
}

export function setupAppUpdater(): void {
  if (initialized) return;
  initialized = true;

  currentState = createIdleState();

  if (!isRealPackagedBuild()) {
    unsupportedState();
    return;
  }

  // Manual control from the user menu: check → download → install.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  // Private GitHub Releases need a token on the client if the repo is private.
  // Prefer env injection for internal builds; do not hardcode secrets.
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) {
    autoUpdater.requestHeaders = {
      ...(autoUpdater.requestHeaders || {}),
      Authorization: `token ${token}`,
    };
  }

  autoUpdater.on('checking-for-update', () => {
    setState({
      status: 'checking',
      message: 'Checking…',
      progressPercent: undefined,
      canInstall: false,
    });
  });

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    setState({
      status: 'available',
      availableVersion: info.version,
      message: `Update v${info.version} available`,
      progressPercent: undefined,
      canInstall: false,
    });
  });

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    setState({
      status: 'not-available',
      availableVersion: info.version,
      message: `Up to date · v${app.getVersion()}`,
      progressPercent: undefined,
      canInstall: false,
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setState({
      status: 'downloading',
      progressPercent: Math.max(0, Math.min(100, progress.percent || 0)),
      message: `Downloading… ${Math.floor(progress.percent || 0)}%`,
      canInstall: false,
    });
  });

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    setState({
      status: 'downloaded',
      availableVersion: info.version,
      progressPercent: 100,
      message: `v${info.version} ready · restart to install`,
      canInstall: true,
    });
  });

  autoUpdater.on('error', (error: Error) => {
    setState({
      status: 'error',
      message: describeError(error),
      progressPercent: undefined,
      canInstall: false,
    });
  });
}

export async function checkForAppUpdates(): Promise<AppUpdateState> {
  if (!isRealPackagedBuild()) {
    return unsupportedState();
  }

  try {
    setState({
      status: 'checking',
      message: 'Checking…',
      progressPercent: undefined,
      canInstall: false,
    });
    const result = await autoUpdater.checkForUpdates();
    if (!result) {
      return setState({
        status: 'error',
        message: 'No update result',
        canInstall: false,
      });
    }
    // Event handlers already updated state; return latest snapshot.
    return currentState;
  } catch (error) {
    return setState({
      status: 'error',
      message: describeError(error),
      canInstall: false,
    });
  }
}

export async function downloadAppUpdate(): Promise<AppUpdateState> {
  if (!isRealPackagedBuild()) {
    return unsupportedState();
  }

  if (currentState.status === 'downloading') {
    return currentState;
  }

  // Already downloaded — let the install path take over.
  if (currentState.status === 'downloaded' && currentState.canInstall) {
    return currentState;
  }

  if (currentState.status !== 'available' && currentState.status !== 'error') {
    return setState({
      status: 'error',
      message: 'Check for updates first',
      canInstall: false,
    });
  }

  try {
    setState({
      status: 'downloading',
      progressPercent: 0,
      message: 'Downloading… 0%',
      canInstall: false,
    });
    await autoUpdater.downloadUpdate();
    return currentState;
  } catch (error) {
    return setState({
      status: 'error',
      message: describeError(error),
      canInstall: false,
    });
  }
}

/**
 * One-shot path used by the user menu:
 * check → download (if newer) → quitAndInstall.
 * Same-version releases are intentionally ignored by electron-updater.
 */
export async function applyLatestAppUpdate(): Promise<AppUpdateState> {
  if (!isRealPackagedBuild()) {
    return unsupportedState();
  }

  if (currentState.status === 'downloading') {
    return currentState;
  }

  // Resume install if a previous click already finished downloading.
  if (currentState.status === 'downloaded' && currentState.canInstall) {
    return installAppUpdate();
  }

  const checked = await checkForAppUpdates();
  if (checked.status === 'not-available' || checked.status === 'unsupported' || checked.status === 'error') {
    return checked;
  }

  if (checked.status === 'downloaded' && checked.canInstall) {
    return installAppUpdate();
  }

  if (checked.status !== 'available') {
    return checked;
  }

  const downloaded = await downloadAppUpdate();
  if (downloaded.status === 'downloaded' && downloaded.canInstall) {
    return installAppUpdate();
  }
  return downloaded;
}

// ---------------------------------------------------------------------------
// Manual install path for adhoc-signed / unsigned builds.
//
// electron-updater on macOS delegates to Squirrel.Mac, which verifies the
// code signature of the downloaded update zip against the running app.  When
// the app is only adhoc-signed (our default release path) Squirrel rejects the
// update with "Code signature … is invalid" and cancels the task — exactly
// the "Update failed / Task was cancelled" the user sees.
//
// Instead of relying on quitAndInstall → Squirrel.Mac, we extract the already
// downloaded zip ourselves, swap the .app bundle, and relaunch.  This bypasses
// the signature check entirely.  Once the app is properly code-signed and
// notarised, switch back to autoUpdater.quitAndInstall().
// ---------------------------------------------------------------------------

function getAppBundlePath(): string {
  // app.getPath('exe') on macOS → /Applications/Haish.app/Contents/MacOS/Haish
  const execPath = app.getPath('exe');
  return path.dirname(path.dirname(path.dirname(execPath)));
}

function getUpdaterPendingDir(): string {
  // electron-updater stores downloads in baseCachePath/updaterCacheDirName/pending.
  // baseCachePath on macOS = ~/Library/Caches; updaterCacheDirName comes from
  // app-update.yml ("haish-agent-updater").
  return path.join(os.homedir(), 'Library', 'Caches', 'haish-agent-updater', 'pending');
}

function findDownloadedUpdateZip(): string | null {
  const pendingDir = getUpdaterPendingDir();
  // Prefer update-info.json which records the exact cached filename.
  try {
    const infoPath = path.join(pendingDir, 'update-info.json');
    if (fs.existsSync(infoPath)) {
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8')) as { fileName?: string };
      if (info && typeof info.fileName === 'string') {
        const candidate = path.join(pendingDir, info.fileName);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  } catch {
    /* fall through to scan */
  }
  // Fallback: scan pending dir for a Haish-*.zip.
  try {
    const entries = fs.readdirSync(pendingDir);
    const zip = entries.find((f) => /^Haish-.*\.zip$/i.test(f));
    if (zip) return path.join(pendingDir, zip);
  } catch {
    /* pending dir missing */
  }
  return null;
}

function isProperlyCodeSigned(): boolean {
  // codesign --verify returns exit 0 only for a valid (non-adhoc) signature.
  try {
    const result = spawnSync('codesign', ['--verify', '--deep', '--strict', getAppBundlePath()], {
      encoding: 'utf-8',
      timeout: 8000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Spawn a detached shell script that waits for the app to quit, unzips the
 * downloaded update, replaces the .app bundle, and relaunches.  The script
 * self-deletes when done.
 */
function manualInstallAndRelaunch(): void {
  const zipPath = findDownloadedUpdateZip();
  if (!zipPath) {
    setState({
      status: 'error',
      message: 'Update file not found',
      canInstall: false,
    });
    return;
  }

  const appPath = getAppBundlePath();
  const parentDir = path.dirname(appPath);
  const appName = path.basename(appPath);
  const tmpDir = path.join(os.tmpdir(), `haish-update-${Date.now()}`);

  // Use ditto (preserves macOS permissions / extended attributes) instead of unzip.
  // Backup-then-replace so a failed move doesn't leave the user with no app.
  const script = [
    '#!/bin/bash',
    'set -e',
    `ZIP=${JSON.stringify(zipPath)}`,
    `APP_PARENT=${JSON.stringify(parentDir)}`,
    `APP_NAME=${JSON.stringify(appName)}`,
    `TMP=${JSON.stringify(tmpDir)}`,
    'LOG=/tmp/haish-update-error.log',
    'exec >"$LOG" 2>&1',
    '',
    '# Wait for the current app process to fully exit',
    'sleep 2',
    '',
    '# Extract the update (ditto preserves permissions & xattrs)',
    'rm -rf "$TMP"',
    'mkdir -p "$TMP"',
    'ditto -x -k "$ZIP" "$TMP"',
    '',
    '# Verify extraction produced the expected .app bundle',
    'if [ ! -d "$TMP/$APP_NAME" ]; then',
    '  echo "Extracted bundle not found at $TMP/$APP_NAME"',
    '  exit 1',
    'fi',
    '',
    '# Backup old app, move new app, remove backup',
    'rm -rf "$APP_PARENT/$APP_NAME.bak"',
    'mv "$APP_PARENT/$APP_NAME" "$APP_PARENT/$APP_NAME.bak"',
    'mv "$TMP/$APP_NAME" "$APP_PARENT/$APP_NAME" || mv "$APP_PARENT/$APP_NAME.bak" "$APP_PARENT/$APP_NAME"',
    'rm -rf "$APP_PARENT/$APP_NAME.bak"',
    '',
    '# Relaunch the updated app',
    'open "$APP_PARENT/$APP_NAME"',
    '',
    '# Cleanup',
    'rm -rf "$TMP"',
    'rm -f "$0"',
  ].join('\n');

  const scriptPath = path.join(os.tmpdir(), `haish-install-${Date.now()}.sh`);
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  // Detached spawn so the script survives after the app quits.
  const child = spawn('bash', [scriptPath], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  app.quit();
}

export function installAppUpdate(): AppUpdateState {
  if (!currentState.canInstall) {
    return currentState;
  }
  setState({
    status: 'downloaded',
    message: currentState.availableVersion
      ? `Installing v${currentState.availableVersion}…`
      : 'Installing update…',
    canInstall: true,
    progressPercent: 100,
  });

  setImmediate(() => {
    if (isProperlyCodeSigned()) {
      // Native Squirrel.Mac path — works when the app is properly signed.
      autoUpdater.quitAndInstall(false, true);
    } else {
      // Adhoc / unsigned builds: Squirrel.Mac rejects the update with a
      // code-signature error, so install manually.
      manualInstallAndRelaunch();
    }
  });
  return currentState;
}
