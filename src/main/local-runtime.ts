import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

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

const DEFAULT_RUNTIME_REPO = '/Users/zhanruitao/py-project/haishihua-agent-core';
const BUNDLED_RUNTIME_DIR = 'haishihua-agent-core';
const BUNDLED_RUNTIME_EXECUTABLE = path.join('bin', 'haish-runtime', 'haish-runtime');
const START_TIMEOUT_MS = 20_000;

let child: ChildProcessWithoutNullStreams | null = null;
let state: LocalRuntimeState = { status: 'idle', baseUrl: '' };
let startPromise: Promise<LocalRuntimeState> | null = null;

function choosePython(runtimeRepo: string): string {
  if (process.env.HAISH_LOCAL_RUNTIME_PYTHON) {
    return process.env.HAISH_LOCAL_RUNTIME_PYTHON;
  }
  const venvPython = path.join(runtimeRepo, '.venv/bin/python');
  if (fs.existsSync(venvPython)) {
    return venvPython;
  }
  return 'python3';
}

function chooseRuntimeCommand(runtimeRepo: string): { command: string; argsPrefix: string[] } {
  const bundledRuntimeExecutable = path.join(runtimeRepo, BUNDLED_RUNTIME_EXECUTABLE);
  if (fs.existsSync(bundledRuntimeExecutable)) {
    return { command: bundledRuntimeExecutable, argsPrefix: [] };
  }
  return { command: choosePython(runtimeRepo), argsPrefix: ['-m', 'haishihua_agent_core.app.web'] };
}

function runtimeRepoPath(paths: RuntimePaths): string {
  if (process.env.HAISH_LOCAL_RUNTIME_CWD) {
    return process.env.HAISH_LOCAL_RUNTIME_CWD;
  }
  const bundledRuntime = path.join(paths.resourcesPath, BUNDLED_RUNTIME_DIR);
  if (paths.isPackaged && fs.existsSync(bundledRuntime)) {
    return bundledRuntime;
  }
  return DEFAULT_RUNTIME_REPO;
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

function runtimeEnv(paths: RuntimePaths, runtimeRepo: string): NodeJS.ProcessEnv {
  const envFile = process.env.HAISH_LOCAL_RUNTIME_ENV_FILE
    || path.join(paths.userDataPath, 'runtime.env');
  const bundledEnvFile = path.join(runtimeRepo, '.env');
  const bundledMcpConfig = path.join(runtimeRepo, 'mcp.json');
  const pythonPath = path.join(runtimeRepo, 'src');
  const baseEnv = {
    ...process.env,
    ...(!process.env.HAISHIHUA_MCP_CONFIG && fs.existsSync(bundledMcpConfig)
      ? { HAISHIHUA_MCP_CONFIG: bundledMcpConfig }
      : {}),
  };
  return {
    ...baseEnv,
    ...parseEnvFile(bundledEnvFile),
    ...parseEnvFile(envFile),
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
      const response = await fetch(`${baseUrl}/api/conversations`, {
        headers: { 'X-Agent-User-Id': 'haish-runtime-healthcheck' },
      });
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
        cwd: runtimeRepo,
        env: runtimeEnv(paths, runtimeRepo),
      },
    );

    child.stdout.on('data', (chunk) => {
      console.log(`[haish-runtime] ${String(chunk).trimEnd()}`);
    });
    child.stderr.on('data', (chunk) => {
      console.error(`[haish-runtime] ${String(chunk).trimEnd()}`);
    });
    child.on('exit', (code, signal) => {
      const message = `Local runtime exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}.`;
      if (state.status !== 'stopped') {
        state = { status: 'failed', baseUrl, message };
      }
      child = null;
      startPromise = null;
    });

    try {
      await waitForRuntime(baseUrl, START_TIMEOUT_MS);
      state = { status: 'ready', baseUrl, pid: child.pid };
      return state;
    } catch (error) {
      const message = String((error as Error)?.message || error);
      child.kill();
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
  return startLocalRuntime(paths);
}

export function getLocalRuntimeState(): LocalRuntimeState {
  return state;
}

export function stopLocalRuntime(): void {
  state = { ...state, status: 'stopped' };
  if (child && !child.killed) {
    child.kill();
  }
  child = null;
  startPromise = null;
}
