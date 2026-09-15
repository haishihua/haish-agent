import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { randomUUID } from 'node:crypto';
import type {
  AppUpdateState,
  DirectoryPickResult,
  FileEntry,
  HaishDesktopApi,
  LocalProject,
  LocalRuntimeState,
  ReadFileResult,
  RemoteDevice,
  RemotePairingState,
  SkillDirectoryPickResult,
  WindowVisualState,
} from '../shared/haish-api.js';

const api: HaishDesktopApi = {
  platform: process.platform,
  apiBase: '',
  homePath: process.env.HOME || '',
  getRuntimeStatus: () => ipcRenderer.invoke('runtime:status') as Promise<LocalRuntimeState>,
  startRemotePairing: () => ipcRenderer.invoke('remote-control:start-pairing') as Promise<RemotePairingState>,
  listRemoteDevices: () => ipcRenderer.invoke('remote-control:list-devices') as Promise<RemoteDevice[]>,
  revokeRemoteDevice: (deviceId: string) =>
    ipcRenderer.invoke('remote-control:revoke-device', deviceId) as Promise<boolean>,
  notifyTaskComplete: () => ipcRenderer.invoke('dock:notify-task-complete') as Promise<boolean>,
  setTaskCompletionBadgeCount: (count: number) => ipcRenderer.invoke('dock:set-task-badge', count) as Promise<number>,
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
  listDirectory: (projectId: string, relativePath = '') =>
    ipcRenderer.invoke('fs:list-directory', projectId, relativePath) as Promise<FileEntry[]>,
  readFile: (projectId: string, relativePath: string) =>
    ipcRenderer.invoke('fs:read-file', projectId, relativePath) as Promise<ReadFileResult>,
  copyImage: (dataUrl: string) => ipcRenderer.invoke('clipboard:write-image', dataUrl) as Promise<boolean>,
  readToolScreenshot: (imagePath: string, taskId: string) =>
    ipcRenderer.invoke('tool:read-screenshot', imagePath, taskId) as Promise<string>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  runTaskStream: (command, onEvent) => new Promise<void>((resolve, reject) => {
    const requestId = command.request_id;
    const listener = (_event: Electron.IpcRendererEvent, message: Record<string, unknown>) => {
      if (message.request_id !== requestId) return;
      if (message.type === 'task.event') {
        onEvent(message.event as Record<string, unknown>);
      } else if (message.type === 'task.error') {
        cleanup();
        const detail = typeof message.detail === 'string'
          ? message.detail
          : JSON.stringify(message.detail || 'Task stream failed.');
        reject(Object.assign(new Error(detail), { status: message.status }));
      } else if (message.type === 'task.end') {
        cleanup();
        resolve();
      }
    };
    const cleanup = () => ipcRenderer.removeListener('runtime:task-message', listener);
    ipcRenderer.on('runtime:task-message', listener);
    ipcRenderer.invoke('runtime:command', { ...command, type: 'task.start' }).catch((error) => {
      cleanup();
      reject(error);
    });
  }),
  onApprovalEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, message: Record<string, unknown>) => callback(message);
    ipcRenderer.on('runtime:approval-event', listener);
    ipcRenderer.send('runtime:approval-subscribe');
    return () => {
      ipcRenderer.removeListener('runtime:approval-event', listener);
      ipcRenderer.send('runtime:approval-unsubscribe');
    };
  },
  resolveApproval: (approvalKind, approvalId, payload) => ipcRenderer.invoke('runtime:command', {
    type: 'approval.resolve',
    request_id: randomUUID(),
    approval_id: approvalId,
    approval_kind: approvalKind,
    payload,
  }) as Promise<Record<string, unknown>>,
};

contextBridge.exposeInMainWorld('HAISH_API_BASE', '');
contextBridge.exposeInMainWorld('haish', api);
