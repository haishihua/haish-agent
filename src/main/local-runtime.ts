import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type LocalRuntimeStatus = 'idle' | 'starting' | 'ready' | 'failed' | 'stopped';

export type LocalRuntimeState = {
  status: LocalRuntimeStatus;
  baseUrl: string;
  pid?: number;
  message?: string;
};

type RuntimePaths = {
  userDataPath: string;
  resourcesPath: string;
  isPackaged: boolean;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// dist-electron/main/local-runtime.js -> repo root
const PROJECT_ROOT = path.resolve(__dirname, '../..');

const DEFAULT_RUNTIME_REPO = '/Users/zhanruitao/py-project/haish-agent-core';
const BUNDLED_RUNTIME_DIR = 'haish-agent-core';
const BUNDLED_RUNTIME_EXECUTABLE = path.join('bin', 'haish-runtime', 'haish-runtime');
// Local runtime startup measured 30-40s on a clean machine (heavy Python
// import graph + session/state deserialization from the workdir). Doubled
// from 60s to give headroom under load / large saved state, so we don't
// kill a backend that's just slow to reach ready.
const START_TIMEOUT_MS = 120_000;
// Python 后端及其 MCP 子进程（含 Chromium）退出窗口。SIGTERM 后等
// 这么久还没退就 SIGKILL，防止 Electron quit 后残留 Chrome 占内存。
const SHUTDOWN_GRACE_MS = 5_000;

// Dev-mode lookup order for the Python backend repo (haish-agent-core):
//   1. HAISH_LOCAL_RUNTIME_CWD env var (explicit override)
//   2. ../haish-agent-core sibling of this repo
//   3. ./haish-agent-core inside this repo
const DEV_RUNTIME_REPO_CANDIDATES = [
  path.resolve(PROJECT_ROOT, '..', 'haish-agent-core'),
  path.resolve(PROJECT_ROOT, 'haish-agent-core'),
  path.join(os.homedir(), 'Desktop', BUNDLED_RUNTIME_DIR),
  path.join(os.homedir(), 'Desktop', '打工人', BUNDLED_RUNTIME_DIR),
  DEFAULT_RUNTIME_REPO,
];

let child: ChildProcessWithoutNullStreams | null = null;
let state: LocalRuntimeState = { status: 'idle', baseUrl: '' };
let startPromise: Promise<LocalRuntimeState> | null = null;
// 本进程 spawn 的后端 workdir，用于退出时清理 pid 文件（复用的进程不清理）。
let currentWorkdir: string | null = null;

const RUNTIME_PID_FILE = 'runtime.pid';

function choosePython(runtimeRepo: string): string {
  if (process.env.HAISH_LOCAL_RUNTIME_PYTHON) {
    return process.env.HAISH_LOCAL_RUNTIME_PYTHON;
  }
  const candidates = [
    path.join(runtimeRepo, '.venv/bin/python3'),
    path.join(runtimeRepo, '.venv/bin/python'),
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'python3';
}

function chooseRuntimeCommand(runtimeRepo: string): { command: string; argsPrefix: string[] } {
  const bundledRuntimeExecutable = path.join(runtimeRepo, BUNDLED_RUNTIME_EXECUTABLE);
  if (fs.existsSync(bundledRuntimeExecutable)) {
    return { command: bundledRuntimeExecutable, argsPrefix: [] };
  }
  return { command: choosePython(runtimeRepo), argsPrefix: ['-m', 'haish_agent_core.app.web'] };
}

function runtimeRepoPath(paths: RuntimePaths): string {
  // Packaged builds are self-contained and must never depend on a developer checkout.
  if (!paths.isPackaged && process.env.HAISH_LOCAL_RUNTIME_CWD) {
    return process.env.HAISH_LOCAL_RUNTIME_CWD;
  }
  const bundledRuntime = path.join(paths.resourcesPath, BUNDLED_RUNTIME_DIR);
  if (paths.isPackaged && fs.existsSync(bundledRuntime)) {
    return bundledRuntime;
  }
  for (const candidate of DEV_RUNTIME_REPO_CANDIDATES) {
    if (
      fs.existsSync(path.join(candidate, 'pyproject.toml'))
      && fs.existsSync(path.join(candidate, 'src', 'haish_agent_core'))
    ) {
      return candidate;
    }
  }
  throw new Error(
    'Could not locate the Haish Python backend (haish-agent-core). '
    + `Looked for: ${DEV_RUNTIME_REPO_CANDIDATES.join(', ')}. `
    + 'Clone the haish-agent-core repo next to this project, or set '
    + 'HAISH_LOCAL_RUNTIME_CWD to its absolute path.',
  );
}

function runtimeWorkdir(userDataPath: string): string {
  return process.env.HAISH_LOCAL_RUNTIME_WORKDIR || path.join(userDataPath, 'runtime');
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const result: Record<string, string> = {};
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

function ensureRuntimeMcpConfig(runtimeRepo: string, workdir: string): string {
  const runtimeMcpConfig = path.join(workdir, 'mcp.json');
  if (fs.existsSync(runtimeMcpConfig)) {
    return runtimeMcpConfig;
  }

  const bundledMcpConfig = path.join(runtimeRepo, 'mcp.json');
  if (fs.existsSync(bundledMcpConfig)) {
    fs.copyFileSync(bundledMcpConfig, runtimeMcpConfig);
  } else {
    fs.writeFileSync(runtimeMcpConfig, `${JSON.stringify({ servers: {} }, null, 2)}\n`, 'utf8');
  }
  return runtimeMcpConfig;
}

function runtimeEnv(paths: RuntimePaths, runtimeRepo: string, workdir: string): NodeJS.ProcessEnv {
  const envFile = process.env.HAISH_LOCAL_RUNTIME_ENV_FILE
    || path.join(paths.userDataPath, 'runtime.env');
  const pythonPath = path.join(runtimeRepo, 'src');
  const userEnv = parseEnvFile(envFile);
  const explicitMcpConfig = process.env.HAISH_MCP_CONFIG
    || userEnv.HAISH_MCP_CONFIG;
  return {
    ...process.env,
    ...(!explicitMcpConfig ? { HAISH_MCP_CONFIG: ensureRuntimeMcpConfig(runtimeRepo, workdir) } : {}),
    ...userEnv,
    HAISH_AGENT_WORLD_APP_HOME: workdir,
    HAISH_AGENT_WORLD_APP_WORKDIR: workdir,
    PYTHONPATH: process.env.PYTHONPATH ? `${pythonPath}${path.delimiter}${process.env.PYTHONPATH}` : pythonPath,
    PYTHONUNBUFFERED: '1',
  };
}

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('Could not allocate local runtime port.'));
        }
      });
    });
  });
}

async function waitForRuntime(baseUrl: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`healthcheck returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw lastError instanceof Error ? lastError : new Error('Local runtime did not become ready.');
}

function runtimePidFile(workdir: string): string {
  return path.join(workdir, RUNTIME_PID_FILE);
}

function readPidRecord(workdir: string): { pid: number; port: number } | null {
  try {
    const raw = JSON.parse(fs.readFileSync(runtimePidFile(workdir), 'utf8'));
    if (typeof raw.pid === 'number' && typeof raw.port === 'number') {
      return { pid: raw.pid, port: raw.port };
    }
  } catch {
    // 文件缺失或损坏：视为没有可复用的实例。
  }
  return null;
}

function writePidRecord(workdir: string, pid: number, port: number): void {
  try {
    fs.mkdirSync(workdir, { recursive: true });
    fs.writeFileSync(runtimePidFile(workdir), JSON.stringify({ pid, port }), {
      encoding: 'utf8',
      mode: 0o600,
    });
  } catch (error) {
    console.error('[local-runtime] Failed to write runtime pid file:', error);
  }
}

function removePidRecord(workdir: string): void {
  try {
    fs.rmSync(runtimePidFile(workdir), { force: true });
  } catch {
    // 清理失败忽略。
  }
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

function isHaishBackendCommand(command: string): boolean {
  return command.includes('haish_agent_core.app.web') || command.includes('haish-runtime');
}

// 兜底清理：pid 文件丢失/损坏或升级前启动的旧后端仍可能残留，
// 与新建后端共享同一个 auth.db 会让登录互相打架。这里按 workdir 精确匹配查杀，
// 只在本进程即将启动新后端（没有可复用的健康实例）时调用。
function reapStaleBackends(workdir: string): void {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return;
  let output: string;
  try {
    output = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' });
  } catch {
    return;
  }
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(.+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const command = match[2];
    if (!isHaishBackendCommand(command)) continue;
    if (!command.includes('--workdir') || !command.includes(workdir)) continue;
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // 已退出或无权限，忽略。
    }
  }
}

// 复用健康的旧后端：pid 文件指向的进程还活着且 /api/health 正常，
// 就直接接管（密钥不变、会话不丢、不会出现双后端）。
async function tryReuseExistingRuntime(paths: RuntimePaths): Promise<LocalRuntimeState | null> {
  const workdir = runtimeWorkdir(paths.userDataPath);
  const record = readPidRecord(workdir);
  if (!record) {
    return null;
  }
  const baseUrl = `http://127.0.0.1:${record.port}`;
  if (!processAlive(record.pid)) {
    removePidRecord(workdir);
    return null;
  }
  try {
    await waitForRuntime(baseUrl, 5_000);
  } catch {
    // 进程活着但健康检查不通（启动中卡死/半死）：关掉它，让下面重新拉起。
    try {
      process.kill(record.pid, 'SIGTERM');
    } catch {
      // 忽略。
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (processAlive(record.pid)) {
      try {
        process.kill(record.pid, 'SIGKILL');
      } catch {
        // 忽略。
      }
    }
    removePidRecord(workdir);
    return null;
  }
  state = { status: 'ready', baseUrl, pid: record.pid };
  return state;
}

export async function startLocalRuntime(paths: RuntimePaths): Promise<LocalRuntimeState> {
  if (state.status === 'ready') {
    return state;
  }
  if (startPromise) {
    return startPromise;
  }

  startPromise = (async () => {
    const runtimeRepo = runtimeRepoPath(paths);
    const runtimeCommand = chooseRuntimeCommand(runtimeRepo);
    const port = Number(process.env.HAISH_LOCAL_RUNTIME_PORT || await findFreePort());
    const workdir = runtimeWorkdir(paths.userDataPath);
    const baseUrl = `http://127.0.0.1:${port}`;

    fs.mkdirSync(workdir, { recursive: true });
    state = { status: 'starting', baseUrl };

    // 兜底清理同 workdir 的残留后端，避免双后端共享 auth.db。
    reapStaleBackends(workdir);

    child = spawn(
      runtimeCommand.command,
      [
        ...runtimeCommand.argsPrefix,
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--workdir',
        workdir,
        '--cors-origin',
        'haish://app',
      ],
      {
        cwd: workdir,
        env: runtimeEnv(paths, runtimeRepo, workdir),
      },
    );

    child.on('error', (error) => {
      const message = `Local runtime failed to launch: ${error.message}`;
      state = { status: 'failed', baseUrl, message };
      child = null;
      startPromise = null;
    });
    child.stdout.on('data', (chunk) => {
      console.log(`[haish-runtime] ${String(chunk).trimEnd()}`);
    });
    child.stderr.on('data', (chunk) => {
      console.error(`[haish-runtime] ${String(chunk).trimEnd()}`);
    });
    const launchFailure = new Promise<never>((_resolve, reject) => {
      child?.once('error', (error) => reject(error));
      child?.once('exit', (code, signal) => {
        reject(new Error(
          `Local runtime exited before becoming ready${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}.`,
        ));
      });
    });
    child.on('exit', (code, signal) => {
      const message = `Local runtime exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}.`;
      if (state.status !== 'stopped') {
        state = { status: 'failed', baseUrl, message };
      }
      child = null;
      startPromise = null;
    });

    currentWorkdir = workdir;
    const spawnedPid = child.pid;
    if (spawnedPid !== undefined) {
      writePidRecord(workdir, spawnedPid, port);
    }

    try {
      await Promise.race([waitForRuntime(baseUrl, START_TIMEOUT_MS), launchFailure]);
      state = { status: 'ready', baseUrl, pid: child.pid };
      return state;
    } catch (error) {
      const message = String((error as Error)?.message || error);
      child?.kill();
      if (currentWorkdir) {
        removePidRecord(currentWorkdir);
      }
      currentWorkdir = null;
      state = { status: 'failed', baseUrl, message };
      throw new Error(`Local runtime failed to start: ${message}`);
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

export async function ensureLocalRuntime(paths: RuntimePaths): Promise<LocalRuntimeState> {
  if (state.status === 'ready') {
    return state;
  }
  if (state.status === 'starting' && startPromise) {
    return startPromise;
  }
  const reused = await tryReuseExistingRuntime(paths);
  if (reused) {
    return reused;
  }
  return startLocalRuntime(paths);
}

export function getLocalRuntimeState(): LocalRuntimeState {
  return state;
}

export async function stopLocalRuntime(): Promise<void> {
  state = { ...state, status: 'stopped' };
  const current = child;
  child = null;
  startPromise = null;
  if (!current || current.exitCode !== null || current.signalCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      clearTimeout(reapTimer);
      resolve();
    };

    current.once('exit', finish);

    try {
      current.kill('SIGTERM');
    } catch {
      finish();
      return;
    }

    // SIGTERM 没在窗口内生效就升级到 SIGKILL，再给 500ms 让 OS 回收。
    const killTimer = setTimeout(() => {
      if (settled) return;
      if (current.exitCode === null && current.signalCode === null) {
        try {
          current.kill('SIGKILL');
        } catch {
          // 已经死了
        }
      }
    }, SHUTDOWN_GRACE_MS);

    const reapTimer = setTimeout(finish, SHUTDOWN_GRACE_MS + 500);
  });

  if (currentWorkdir) {
    removePidRecord(currentWorkdir);
  }
  currentWorkdir = null;
}
