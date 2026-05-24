import { contextBridge, ipcRenderer } from 'electron';
import type {
  DirectoryPickResult,
  FileEntry,
  HaishDesktopApi,
  LocalProject,
  LocalRuntimeState,
  ReadFileResult,
  WindowVisualState,
} from '../shared/haish-api.js';

const api: HaishDesktopApi = {
  platform: process.platform,
  apiBase: '',
  getRuntimeStatus: () => ipcRenderer.invoke('runtime:status') as Promise<LocalRuntimeState>,
  getWindowState: () => ipcRenderer.invoke('window:state') as Promise<WindowVisualState>,
  onWindowStateChange: (callback: (state: WindowVisualState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: WindowVisualState) => callback(state);
    ipcRenderer.on('window:state', listener);
    return () => ipcRenderer.removeListener('window:state', listener);
  },
  pickProjectDirectory: () => ipcRenderer.invoke('project:pick-directory') as Promise<DirectoryPickResult>,
  listProjects: () => ipcRenderer.invoke('project:list') as Promise<LocalProject[]>,
  listDirectory: (projectId: string, relativePath = '') => ipcRenderer.invoke('fs:list-directory', projectId, relativePath) as Promise<FileEntry[]>,
  readFile: (projectId: string, relativePath: string) => ipcRenderer.invoke('fs:read-file', projectId, relativePath) as Promise<ReadFileResult>
};

contextBridge.exposeInMainWorld('AGENT_WORLD_API_BASE', '');
contextBridge.exposeInMainWorld('haish', api);
