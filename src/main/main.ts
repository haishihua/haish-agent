import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, net, protocol, shell } from 'electron';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  DirectoryPickResult,
  FileEntry,
  LocalProject,
  ReadFileResult,
  RemoteDevice,
  RemotePairingState,
  SkillDirectoryPickResult,
} from '../shared/haish-api.js';
import {
  applyLatestAppUpdate,
  checkForAppUpdates,
  downloadAppUpdate,
  getAppUpdateState,
  installAppUpdate,
  isUpdateInstallInProgress,
  setupAppUpdater,
} from './app-updater.js';
import { ensureLocalRuntime, getLocalRuntimeState, stopLocalRuntime } from './local-runtime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = () => path.resolve(__dirname, '../..');

const projectsFile = () => path.join(app.getPath('userData'), 'projects.json');
const CLIPBOARD_IMAGE_MAX_DATA_URL_LENGTH = 14 * 1024 * 1024;
const CLIPBOARD_IMAGE_MAX_PIXELS = 16 * 1024 * 1024;
const REMOTE_ADAPTER_ORIGIN = 'http://127.0.0.1:8766';
// Vite builds the product UI into app-web/dist. Prefer dist so the renderer always
// loads the production bundle (no Babel-in-browser, production React).
const webRoot = () => {
  const distCandidates = [path.join(projectRoot(), 'app-web', 'dist'), path.join(app.getAppPath(), 'app-web', 'dist')];
  for (const distRoot of distCandidates) {
    if (existsSync(path.join(distRoot, 'index.html'))) {
      return distRoot;
    }
  }
  throw new Error('app-web/dist/index.html is missing; run npm run build:web');
};
const appIconPngPath = () => path.join(app.getAppPath(), 'build', 'icon.png');
const devMode = process.env.HAISH_DEV_MODE === '1' || !app.isPackaged;
const runtimePaths = () => ({
  userDataPath: app.getPath('userData'),
  resourcesPath: process.resourcesPath,
  isPackaged: app.isPackaged && !devMode,
});

// Electron 默认会调 macOS Keychain 给 SafeStorage 派密钥，启动时会弹"允许访问钥匙串"
// 的系统对话框。我们没有用 safeStorage 存任何敏感数据，所以把 password-store 切到
// basic（明文文件）并启用 mock-keychain 来绕过这个弹窗。必须在 app.whenReady 之前调用。
app.commandLine.appendSwitch('password-store', 'basic');
app.commandLine.appendSwitch('use-mock-keychain');

// dev (`npm run dev`) 与已安装的 `/Applications/Haish.app` 都用 productName "Haish"，
// 默认共享同一个 ~/Library/Application Support/Haish 目录，导致 projects.json、
// runtime workdir 互相串数据。在未打包时把 userData 隔离到独立目录。
if (devMode) {
  app.setPath('userData', path.join(app.getPath('appData'), 'Haish (Dev)'));
}

// 单实例锁：第二次启动直接退出。两个实例会各自拉起一个后端，
// 共享同一个 runtime 数据目录会造成状态竞争和请求路由不稳定。
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}
app.on('second-instance', () => {
  const [window] = BrowserWindow.getAllWindows();
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'haish',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

async function proxyApiRequest(request: Request, url: URL): Promise<Response> {
  let runtime;
  try {
    runtime = await ensureLocalRuntime(runtimePaths());
  } catch (error) {
    return Response.json(
      {
        detail: `Local runtime is unavailable: ${String((error as Error)?.message || error)}`,
      },
      { status: 503 },
    );
  }
  const targetUrl = `${runtime.baseUrl}${url.pathname}${url.search}`;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');
  const body =
    request.method === 'GET' || request.method === 'HEAD' ? undefined : Buffer.from(await request.arrayBuffer());
  return net.fetch(targetUrl, {
    method: request.method,
    headers,
    body,
    // 透传渲染进程的取消信号：Cmd+R / 页面销毁时渲染进程的 fetch 会被
    // Chromium 中止，这里让后端转发请求也一并取消，避免“孤儿请求”在
    // 服务端完成刷新令牌轮换后结果丢失（新页面再用旧 token 刷新必 401）。
    signal: request.signal,
  });
}

function registerWebProtocol(): void {
  protocol.handle('haish', async (request) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return proxyApiRequest(request, url);
    }
    const normalizedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const relativePath = normalizedPath.replace(/^\/+/, '');
    const filePath = path.join(webRoot(), relativePath);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

async function remoteAdapterJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await net.fetch(`${REMOTE_ADAPTER_ORIGIN}${pathname}`, init);
  } catch {
    throw new Error('Remote Control is unavailable. Start the Haish Remote service and try again.');
  }
  if (!response.ok) {
    let message = `Remote Control request failed (${response.status}).`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) message = payload.detail;
    } catch {
      // Keep the status fallback for non-JSON errors.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function getWindowVisualState(window: BrowserWindow) {
  return {
    fullScreen: window.isFullScreen(),
    maximized: window.isMaximized(),
  };
}

function publishWindowVisualState(window: BrowserWindow): void {
  window.webContents.send('window:state', getWindowVisualState(window));
}

function applyDockIcon(): void {
  if (process.platform !== 'darwin' || !app.dock) return;
  app.dock.setIcon(appIconPngPath());
}

let dockAttentionRequestId: number | null = null;

function stopDockAttention(): void {
  if (process.platform !== 'darwin' || !app.dock || dockAttentionRequestId === null) return;
  app.dock.cancelBounce(dockAttentionRequestId);
  dockAttentionRequestId = null;
}

function requestDockAttention(window: BrowserWindow | null): boolean {
  if (process.platform !== 'darwin' || !app.dock) return false;
  // A critical request keeps using macOS's native Dock bounce until the app is
  // activated. Never start it while the user is already looking at Haish.
  if (app.isActive() || window?.isFocused()) {
    stopDockAttention();
    return false;
  }
  // macOS may heavily reduce an old critical request after about a minute.
  // A newly completed task must therefore replace the old request instead of
  // being ignored merely because we still hold its request id.
  stopDockAttention();
  dockAttentionRequestId = app.dock.bounce('critical');
  return true;
}

function setDockTaskBadge(count: number): number {
  const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setBadge(normalizedCount > 0 ? String(normalizedCount) : '');
  }
  return normalizedCount;
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 760,
    title: 'Haish',
    // 每次打开都在屏幕中央创建窗口，避免落在屏幕角落/被其他窗口遮挡。
    center: true,
    // 透明窗口 + vibrancy 只用于 OS 圆角边缘；首屏在 web 内容 paint 前若仍用
    // 全透明底，硬刷新会露出浅色系统材质（用户看到的「灰白异常页」）。
    // 用与 html/body 一致的深色底，paint 前也保持暗色，避免空白闪屏。
    backgroundColor: '#05060b',
    transparent: true,
    hasShadow: true,
    roundedCorners: true,
    vibrancy: 'under-window',
    visualEffectState: 'active',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 22, y: 22 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => undefined);
    return { action: 'deny' };
  });
  window.on('enter-full-screen', () => publishWindowVisualState(window));
  window.on('leave-full-screen', () => publishWindowVisualState(window));
  window.on('maximize', () => publishWindowVisualState(window));
  window.on('unmaximize', () => publishWindowVisualState(window));
  window.on('restore', () => publishWindowVisualState(window));
  window.on('focus', stopDockAttention);
  window.webContents.once('did-finish-load', () => publishWindowVisualState(window));

  window.loadURL('haish://app/index.html').catch((error) => console.error('Failed to load Haish UI:', error));
}

async function readProjects(): Promise<LocalProject[]> {
  try {
    const raw = await fs.readFile(projectsFile(), 'utf8');
    const parsed = JSON.parse(raw) as LocalProject[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

async function writeProjects(projects: LocalProject[]): Promise<void> {
  await fs.mkdir(path.dirname(projectsFile()), { recursive: true });
  await fs.writeFile(projectsFile(), JSON.stringify(projects, null, 2), 'utf8');
}

function projectNameFromPath(rootPath: string): string {
  return path.basename(rootPath.replace(/\/+$/, '')) || rootPath;
}

async function resolveProjectRoot(projectId: string): Promise<string> {
  const project = (await readProjects()).find((item) => item.id === projectId);
  if (!project) {
    throw new Error('Project is not authorized.');
  }
  return project.rootPath;
}

async function resolveInsideProject(projectId: string, relativePath = ''): Promise<string> {
  const root = await resolveProjectRoot(projectId);
  const candidate = path.resolve(root, relativePath || '.');
  const resolvedRoot = path.resolve(root);
  if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('Path escapes the authorized project directory.');
  }
  return candidate;
}

ipcMain.handle('project:pick-directory', async (): Promise<DirectoryPickResult> => {
  const result = await dialog.showOpenDialog({
    title: 'Add Project to Haish',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const rootPath = result.filePaths[0];
  const projects = await readProjects();
  const existing = projects.find((item) => item.rootPath === rootPath);
  if (existing) {
    return { canceled: false, project: existing };
  }

  const project: LocalProject = {
    id: crypto.randomUUID(),
    name: projectNameFromPath(rootPath),
    rootPath,
    createdAt: new Date().toISOString(),
  };
  await writeProjects([...projects, project]);
  return { canceled: false, project };
});

ipcMain.handle('project:list', async (): Promise<LocalProject[]> => readProjects());

ipcMain.handle('skill:pick-directory', async (): Promise<SkillDirectoryPickResult> => {
  const result = await dialog.showOpenDialog({
    title: 'Install Skill Directory',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }
  const selectedPath = result.filePaths[0];
  return {
    canceled: false,
    path: selectedPath,
    name: path.basename(selectedPath.replace(/\/+$/, '')) || selectedPath,
  };
});

ipcMain.handle('runtime:status', async () => getLocalRuntimeState());
ipcMain.handle('remote-control:start-pairing', async (): Promise<RemotePairingState> => {
  return remoteAdapterJson('/remote/pairing/start', { method: 'POST' });
});
ipcMain.handle('remote-control:list-devices', async (): Promise<RemoteDevice[]> => {
  const payload = await remoteAdapterJson<{ devices: RemoteDevice[] }>('/remote/devices');
  return payload.devices;
});
ipcMain.handle('remote-control:revoke-device', async (_event, deviceId: string): Promise<boolean> => {
  if (!/^[a-f0-9]{32}$/.test(deviceId)) throw new Error('Invalid remote device ID.');
  await remoteAdapterJson(`/remote/devices/${deviceId}`, { method: 'DELETE' });
  return true;
});
ipcMain.handle('dock:notify-task-complete', (event): boolean => {
  return requestDockAttention(BrowserWindow.fromWebContents(event.sender));
});
ipcMain.handle('dock:set-task-badge', (_event, count: number): number => setDockTaskBadge(count));
ipcMain.handle('window:state', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? getWindowVisualState(window) : { fullScreen: false, maximized: false };
});
ipcMain.handle('app-update:state', () => getAppUpdateState());
ipcMain.handle('app-update:check', () => checkForAppUpdates());
ipcMain.handle('app-update:download', () => downloadAppUpdate());
ipcMain.handle('app-update:install', () => installAppUpdate());
ipcMain.handle('app-update:apply', () => applyLatestAppUpdate());
ipcMain.handle('clipboard:write-image', (_event, dataUrl: string): boolean => {
  if (
    typeof dataUrl !== 'string' ||
    dataUrl.length > CLIPBOARD_IMAGE_MAX_DATA_URL_LENGTH ||
    !dataUrl.startsWith('data:image/')
  )
    return false;
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) return false;
  const { width, height } = image.getSize();
  if (!width || !height || width * height > CLIPBOARD_IMAGE_MAX_PIXELS) return false;
  clipboard.writeImage(image);
  return true;
});

ipcMain.handle('fs:list-directory', async (_event, projectId: string, relativePath = ''): Promise<FileEntry[]> => {
  const target = await resolveInsideProject(projectId, relativePath);
  const entries = await fs.readdir(target, { withFileTypes: true });
  const rows = await Promise.all(
    entries.map(async (entry) => {
      const entryRelativePath = path.posix.join(relativePath.split(path.sep).join('/'), entry.name);
      const absolutePath = path.join(target, entry.name);
      const stats = await fs.stat(absolutePath);
      return {
        name: entry.name,
        relativePath: entryRelativePath,
        kind: entry.isDirectory() ? 'directory' : 'file',
        size: entry.isFile() ? stats.size : undefined,
        modifiedAt: stats.mtime.toISOString(),
      } satisfies FileEntry;
    }),
  );
  return rows.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
});

ipcMain.handle('fs:read-file', async (_event, projectId: string, relativePath: string): Promise<ReadFileResult> => {
  const target = await resolveInsideProject(projectId, relativePath);
  const stats = await fs.stat(target);
  if (!stats.isFile()) {
    throw new Error('Path is not a file.');
  }
  if (stats.size > 1024 * 1024) {
    throw new Error('File is larger than the 1MB preview limit.');
  }
  return {
    relativePath,
    content: await fs.readFile(target, 'utf8'),
    encoding: 'utf8',
  };
});

app
  .whenReady()
  .then(() => {
    if (!gotTheLock) return;
    app.setName('Haish');
    applyDockIcon();
    setupAppUpdater();
    ensureLocalRuntime(runtimePaths()).catch((error) => {
      console.error('Failed to start local Haish runtime:', error);
    });
    registerWebProtocol();
    createWindow();
    app.on('activate', () => {
      stopDockAttention();
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((error) => console.error('Failed to start Haish:', error));

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let runtimeStopInFlight = false;
app.on('before-quit', (event) => {
  // During an update install the app must exit immediately so the detached
  // install script can replace the .app bundle.  Skipping the (slow) runtime
  // shutdown here lets the process exit right away.
  if (isUpdateInstallInProgress()) {
    return;
  }
  if (runtimeStopInFlight) {
    return;
  }
  runtimeStopInFlight = true;
  event.preventDefault();
  for (const window of BrowserWindow.getAllWindows()) {
    window.destroy();
  }
  stopLocalRuntime()
    .catch((error) => console.error('Failed to stop local Haish runtime cleanly:', error))
    .finally(() => app.quit());
});
