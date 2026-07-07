export type LocalProject = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
};

export type DirectoryPickResult =
  | { canceled: true }
  | { canceled: false; project: LocalProject };

export type SkillDirectoryPickResult =
  | { canceled: true }
  | { canceled: false; path: string; name: string };

export type FileEntry = {
  name: string;
  relativePath: string;
  kind: 'file' | 'directory';
  size?: number;
  modifiedAt?: string;
};

export type ReadFileResult = {
  relativePath: string;
  content: string;
  encoding: 'utf8';
};

export type LocalRuntimeStatus = 'idle' | 'starting' | 'ready' | 'failed' | 'stopped';

export type LocalRuntimeState = {
  status: LocalRuntimeStatus;
  baseUrl: string;
  pid?: number;
  message?: string;
};

export type WindowVisualState = {
  fullScreen: boolean;
  maximized: boolean;
};

export type HaishDesktopApi = {
  platform: NodeJS.Platform;
  apiBase: string;
  homePath: string;
  getRuntimeStatus: () => Promise<LocalRuntimeState>;
  getWindowState: () => Promise<WindowVisualState>;
  onWindowStateChange: (callback: (state: WindowVisualState) => void) => () => void;
  pickProjectDirectory: () => Promise<DirectoryPickResult>;
  pickSkillDirectory: () => Promise<SkillDirectoryPickResult>;
  listProjects: () => Promise<LocalProject[]>;
  listDirectory: (projectId: string, relativePath?: string) => Promise<FileEntry[]>;
  readFile: (projectId: string, relativePath: string) => Promise<ReadFileResult>;
  getPathForFile: (file: File) => string;
};

declare global {
  interface Window {
    AGENT_WORLD_API_BASE?: string;
    haish: HaishDesktopApi;
  }
}
