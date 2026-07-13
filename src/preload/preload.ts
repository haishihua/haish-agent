import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  AppUpdateState,
  DirectoryPickResult,
  FileEntry,
  HaishDesktopApi,
  LocalProject,
  LocalRuntimeState,
  ReadFileResult,
  SkillDirectoryPickResult,
  WindowVisualState,
} from '../shared/haish-api.js';

const api: HaishDesktopApi = {
  platform: process.platform,
  apiBase: '',
  homePath: process.env.HOME || '',
  getRuntimeStatus: () => ipcRenderer.invoke('runtime:status') as Promise<LocalRuntimeState>,
  getWindowState: () => ipcRenderer.invoke('window:state') as Promise<WindowVisualState>,
  onWindowStateChange: (callback: (state: WindowVisualState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: WindowVisualState) => callback(state);
    ipcRenderer.on('window:state', listener);
    return () => ipcRenderer.removeListener('window:state', listener);
  },
  getAppUpdateState: () => ipcRenderer.invoke('app-update:state') as Promise<AppUpdateState>,
  checkForAppUpdates: () => ipcRenderer.invoke('app-update:check') as Promise<AppUpdateState>,
  downloadAppUpdate: () => ipcRenderer.invoke('app-update:download') as Promise<AppUpdateState>,
  installAppUpdate: () => ipcRenderer.invoke('app-update:install') as Promise<AppUpdateState>,
  applyLatestAppUpdate: () => ipcRenderer.invoke('app-update:apply') as Promise<AppUpdateState>,
  onAppUpdateStateChange: (callback: (state: AppUpdateState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: AppUpdateState) => callback(state);
    ipcRenderer.on('app-update:state', listener);
    return () => ipcRenderer.removeListener('app-update:state', listener);
  },
  pickProjectDirectory: () => ipcRenderer.invoke('project:pick-directory') as Promise<DirectoryPickResult>,
  pickSkillDirectory: () => ipcRenderer.invoke('skill:pick-directory') as Promise<SkillDirectoryPickResult>,
  listProjects: () => ipcRenderer.invoke('project:list') as Promise<LocalProject[]>,
  listDirectory: (projectId: string, relativePath = '') => ipcRenderer.invoke('fs:list-directory', projectId, relativePath) as Promise<FileEntry[]>,
  readFile: (projectId: string, relativePath: string) => ipcRenderer.invoke('fs:read-file', projectId, relativePath) as Promise<ReadFileResult>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('AGENT_WORLD_API_BASE', '');
contextBridge.exposeInMainWorld('haish', api);
