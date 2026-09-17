import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  RemoteAdapterState,
  RemoteSettings,
  RemoteTunnelState,
} from '../shared/haish-api.js';

/**
 * The desktop app hosts the remote adapter: it starts the frozen
 * `haish-remote-adapter` (which in turn supervises frpc), keeps it alive for as
 * long as the app runs, and stops it on quit. The adapter is not a service the
 * user installs or starts — Remote Control configures this computer's frps
 * endpoint and the app does the rest.
 */

type RemotePaths = {
  userDataPath: string;
  resourcesPath: string;
  isPackaged: boolean;
};

export const REMOTE_ADAPTER_PORT = 8766;
const ORIGIN = `http://127.0.0.1:${REMOTE_ADAPTER_PORT}`;
const BUNDLED_DIR = 'remote-adapter';
const ADAPTER_BINARY = 'haish-remote-adapter';
const FRPC_BINARY = 'frpc';
// Both the packaged copy (Resources/remote-adapter/…) and the dev copy
// (build/remote-adapter/…) contain this marker in their command line.
const ADAPTER_COMMAND_MARKER = `${BUNDLED_DIR}/${ADAPTER_BINARY}`;
const PID_FILE = 'remote-adapter.pid';
const SETTINGS_FILE = 'remote.json';
const START_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 1_500;
const SHUTDOWN_GRACE_MS = 5_000;
const RESTART_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// dist-electron/main/local-remote.js -> repo root
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DEV_REMOTE_DIR = path.join(PROJECT_ROOT, 'build', BUNDLED_DIR);

let child: ChildProcessWithoutNullStreams | null = null;
let state: RemoteAdapterState = { status: 'idle', origin: ORIGIN };
let startPromise: Promise<RemoteAdapterState> | null = null;
let stopping = false;
let restartTimer: NodeJS.Timeout | null = null;
let restartAttempts = 0;
let lastPaths: RemotePaths | null = null;
let cachedOwnGroupId: number | null = null;

export function remoteAdapterOrigin(): string {
  return ORIGIN;
}

function settingsPath(userDataPath: string): string {
  return path.join(userDataPath, SETTINGS_FILE);
}

function pidPath(userDataPath: string): string {
  return path.join(userDataPath, PID_FILE);
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

// The frozen adapter is a PyInstaller one-file build: the launched process is a
// bootloader that runs the real app as its own child. Every adapter process is
// therefore started detached (its own process group) and stopped as a group —
// signalling only the recorded pid would leave the app child behind, still
// holding port 8766 and the tunnel.
function processGroupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

function signalProcessGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
    return;
  } catch {
    // The group is gone (or was never one); fall back to the single process.
  }
  try {
    process.kill(pid, signal);
  } catch {
    // Already gone.
  }
}

function ownProcessGroupId(): number {
  if (cachedOwnGroupId !== null) return cachedOwnGroupId;
  try {
    const value = Number(execFileSync('ps', ['-p', String(process.pid), '-o', 'pgid='], { encoding: 'utf8' }).trim());
    cachedOwnGroupId = Number.isInteger(value) && value > 0 ? value : process.pid;
  } catch {
    cachedOwnGroupId = process.pid;
  }
  return cachedOwnGroupId;
}

async function stopProcessGroup(pid: number, graceMs: number): Promise<void> {
  if (!processAlive(pid) && !processGroupAlive(pid)) return;
  signalProcessGroup(pid, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while ((processAlive(pid) || processGroupAlive(pid)) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (processAlive(pid) || processGroupAlive(pid)) {
    signalProcessGroup(pid, 'SIGKILL');
  }
}

// Values land inside frpc.toml; the adapter re-validates everything, this only
// keeps obviously unsafe input out of the app's own settings file.
const UNSAFE_VALUE = /[\s"'\\\x00-\x1f]/;

function validateRemoteSettings(input: unknown): RemoteSettings {
  if (!input || typeof input !== 'object') throw new Error('Remote settings are missing.');
  const raw = input as Record<string, unknown>;
  const serverAddr = String(raw.serverAddr ?? '').trim();
  if (!serverAddr || !/^[A-Za-z0-9.-]+$/.test(serverAddr)) {
    throw new Error('Server address must be a host name or IP address.');
  }
  const serverPort = Number(raw.serverPort ?? 7000);
  const remotePort = Number(raw.remotePort ?? 0);
  for (const [label, value] of [['Server port', serverPort], ['Public port', remotePort]] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error(`${label} must be a number between 1 and 65535.`);
    }
  }
  const publicEndpoint = String(raw.publicEndpoint ?? '').trim();
  let parsed: URL;
  try {
    parsed = new URL(publicEndpoint);
  } catch {
    throw new Error('Public address must be a full https origin, for example https://203.0.113.9.');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('Public address must be a plain https origin without a path.');
  }
  const token = String(raw.token ?? '').trim();
  if (!token || UNSAFE_VALUE.test(token)) {
    throw new Error('Auth token must be a single line without quotes or whitespace.');
  }
  return { serverAddr, serverPort, remotePort, publicEndpoint: parsed.origin, token };
}

export function readRemoteSettings(userDataPath: string): RemoteSettings | null {
  const file = settingsPath(userDataPath);
  if (!fs.existsSync(file)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error(`${file} is not valid JSON.`);
  }
  return validateRemoteSettings(parsed);
}

export function writeRemoteSettings(userDataPath: string, input: unknown): RemoteSettings {
  const settings = validateRemoteSettings(input);
  const file = settingsPath(userDataPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const descriptor = fs.openSync(file, 'w', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(settings, null, 2)}\n`);
  } finally {
    fs.closeSync(descriptor);
  }
  // openSync only sets the mode when the file is created.
  fs.chmodSync(file, 0o600);
  return settings;
}

function locateBinaries(paths: RemotePaths): { adapter: string; frpc: string } {
  const adapter = process.env.HAISH_REMOTE_ADAPTER_BIN
    || (paths.isPackaged
      ? path.join(paths.resourcesPath, BUNDLED_DIR, ADAPTER_BINARY)
      : path.join(DEV_REMOTE_DIR, ADAPTER_BINARY));
  const frpc = process.env.HAISH_REMOTE_FRPC
    || (paths.isPackaged
      ? path.join(paths.resourcesPath, BUNDLED_DIR, FRPC_BINARY)
      : path.join(DEV_REMOTE_DIR, FRPC_BINARY));
  if (!fs.existsSync(adapter)) {
    throw new Error(
      `The remote adapter binary is missing at ${adapter}. Run \`npm run fetch:remote-adapter\` before building.`,
    );
  }
  if (!fs.existsSync(frpc)) {
    throw new Error(
      `The frpc binary is missing at ${frpc}. Run \`npm run fetch:remote-adapter\` before building.`,
    );
  }
  return { adapter, frpc };
}

function adapterEnv(binaries: { frpc: string }, settings: RemoteSettings | null): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of [
    'HAISH_REMOTE_PUBLIC_ENDPOINT',
    'HAISH_REMOTE_TUNNEL',
    'HAISH_REMOTE_TUNNEL_SERVER',
    'HAISH_REMOTE_TUNNEL_SERVER_PORT',
    'HAISH_REMOTE_TUNNEL_TOKEN',
    'HAISH_REMOTE_TUNNEL_REMOTE_PORT',
  ]) {
    delete env[name];
  }
  if (!settings) {
    // The adapter still serves so Remote Control can talk to it; only the
    // public tunnel stays off until the user configures the server.
    return env;
  }
  return {
    ...env,
    HAISH_REMOTE_PUBLIC_ENDPOINT: settings.publicEndpoint,
    HAISH_REMOTE_TUNNEL: '1',
    HAISH_REMOTE_TUNNEL_SERVER: settings.serverAddr,
    HAISH_REMOTE_TUNNEL_SERVER_PORT: String(settings.serverPort),
    HAISH_REMOTE_TUNNEL_TOKEN: settings.token,
    HAISH_REMOTE_TUNNEL_REMOTE_PORT: String(settings.remotePort),
    HAISH_REMOTE_FRPC: binaries.frpc,
  };
}

type RemoteStatusPayload = {
  version?: string;
  runtime_online?: boolean;
  tunnel?: RemoteTunnelState;
};

async function fetchRemoteStatus(timeoutMs: number): Promise<RemoteStatusPayload> {
  const response = await fetch(`${ORIGIN}/remote/status`, {
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`/remote/status returned ${response.status}.`);
  }
  return response.json() as Promise<RemoteStatusPayload>;
}

async function waitForRemoteAdapter(timeoutMs: number): Promise<RemoteStatusPayload> {
  const startedAt = Date.now();
  let lastError: unknown = null;
  while (Date.now() - startedAt < timeoutMs) {
    if (child && child.exitCode !== null) {
      throw new Error(`The remote adapter exited with code ${child.exitCode}.`);
    }
    try {
      return await fetchRemoteStatus(STATUS_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw lastError instanceof Error ? lastError : new Error('The remote adapter did not become ready.');
}

function readPidRecord(userDataPath: string): number | null {
  try {
    const pid = Number(fs.readFileSync(pidPath(userDataPath), 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function writePidRecord(userDataPath: string, pid: number): void {
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(pidPath(userDataPath), `${pid}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.error('[local-remote] Failed to write the adapter pid file:', error);
  }
}

function removePidRecord(userDataPath: string): void {
  try {
    fs.rmSync(pidPath(userDataPath), { force: true });
  } catch {
    // Cleanup failure is harmless.
  }
}

// Only processes whose command line runs our adapter binary are killed, so
// unrelated processes are never signalled. The scan — not the pid file — is the
// source of truth: after a `kill -9` the PyInstaller bootloader can die while
// its app child keeps running as an orphan, still holding port 8766.
function findLingeringAdapterGroups(): number[] {
  if (process.platform !== 'darwin' && process.platform !== 'linux') return [];
  let output: string;
  try {
    output = execFileSync('ps', ['-axo', 'pid=,pgid=,command='], { encoding: 'utf8' });
  } catch {
    return [];
  }
  const ownGroup = ownProcessGroupId();
  const groups = new Set<number>();
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    if (!match) continue;
    const pid = Number(match[1]);
    const pgid = Number(match[2]);
    const command = match[3];
    if (!command.includes(ADAPTER_COMMAND_MARKER) || !command.includes(' serve')) continue;
    if (pid === process.pid || pgid === ownGroup) continue;
    groups.add(pgid > 0 ? pgid : pid);
  }
  return [...groups];
}

async function reapStaleAdapter(paths: RemotePaths): Promise<void> {
  const groups = new Set<number>(findLingeringAdapterGroups());
  const recorded = readPidRecord(paths.userDataPath);
  if (recorded !== null && (processAlive(recorded) || processGroupAlive(recorded)) && !groups.has(recorded)) {
    groups.add(recorded);
  }
  removePidRecord(paths.userDataPath);
  for (const group of groups) {
    console.log(`[local-remote] stopping a remote adapter left behind by a previous run (process group ${group})`);
    await stopProcessGroup(group, SHUTDOWN_GRACE_MS);
  }
}

function scheduleRestart(reason: string): void {
  if (stopping || !lastPaths || restartTimer) return;
  const delay = RESTART_DELAYS_MS[Math.min(restartAttempts, RESTART_DELAYS_MS.length - 1)];
  restartAttempts += 1;
  console.log(`[local-remote] ${reason}; restarting in ${delay}ms`);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    const paths = lastPaths;
    if (!paths) return;
    ensureRemoteAdapter(paths).catch((error) => {
      console.error('[local-remote] Failed to restart the remote adapter:', error);
      scheduleRestart('the remote adapter failed to start');
    });
  }, delay);
}

export function getRemoteAdapterState(): RemoteAdapterState {
  return state;
}

export async function refreshRemoteAdapterState(): Promise<RemoteAdapterState> {
  if (state.status !== 'ready') return state;
  try {
    const payload = await fetchRemoteStatus(STATUS_TIMEOUT_MS);
    state = {
      ...state,
      version: payload.version ?? state.version,
      runtimeOnline: payload.runtime_online,
      tunnel: payload.tunnel ?? state.tunnel,
    };
  } catch {
    // Keep the last known snapshot; the exit handler owns failure reporting.
  }
  return state;
}

export async function ensureRemoteAdapter(
  paths: RemotePaths,
  settings?: RemoteSettings | null,
): Promise<RemoteAdapterState> {
  lastPaths = paths;
  if (state.status === 'ready' && child && child.exitCode === null) {
    return state;
  }
  if (startPromise) {
    return startPromise;
  }

  startPromise = (async () => {
    const resolvedSettings = settings === undefined ? readRemoteSettings(paths.userDataPath) : settings;
    const binaries = locateBinaries(paths);
    await reapStaleAdapter(paths);
    state = { status: 'starting', origin: ORIGIN };

    const spawned = spawn(binaries.adapter, [
      'serve', '--host', '127.0.0.1', '--port', String(REMOTE_ADAPTER_PORT),
    ], {
      cwd: path.dirname(binaries.adapter),
      env: adapterEnv(binaries, resolvedSettings),
      // Own process group: see signalProcessGroup above.
      detached: true,
    });
    child = spawned;
    spawned.stdout?.on('data', (chunk) => {
      console.log(`[haish-remote] ${String(chunk).trimEnd()}`);
    });
    spawned.stderr?.on('data', (chunk) => {
      console.error(`[haish-remote] ${String(chunk).trimEnd()}`);
    });
    spawned.on('exit', (code, signal) => {
      if (child !== spawned) return;
      child = null;
      if (spawned.pid !== undefined) removePidRecord(paths.userDataPath);
      const message = `The remote adapter exited${code === null ? '' : ` with code ${code}`}${signal ? ` (${signal})` : ''}.`;
      if (stopping) {
        state = { status: 'stopped', origin: ORIGIN };
        return;
      }
      state = { status: 'failed', origin: ORIGIN, message };
      scheduleRestart(message);
    });
    if (spawned.pid !== undefined) writePidRecord(paths.userDataPath, spawned.pid);

    try {
      const payload = await waitForRemoteAdapter(START_TIMEOUT_MS);
      restartAttempts = 0;
      state = {
        status: 'ready',
        origin: ORIGIN,
        pid: spawned.pid,
        version: payload.version,
        runtimeOnline: payload.runtime_online,
        tunnel: payload.tunnel,
      };
      return state;
    } catch (error) {
      const message = String((error as Error)?.message || error);
      if (spawned.pid !== undefined) await stopProcessGroup(spawned.pid, 3_000);
      if (child === spawned) child = null;
      removePidRecord(paths.userDataPath);
      state = { status: 'failed', origin: ORIGIN, message };
      throw new Error(`The remote adapter failed to start: ${message}`);
    } finally {
      startPromise = null;
    }
  })();

  return startPromise;
}

export async function restartRemoteAdapter(
  paths: RemotePaths,
  settings: RemoteSettings | null,
): Promise<RemoteAdapterState> {
  await stopRemoteAdapter();
  stopping = false;
  return ensureRemoteAdapter(paths, settings);
}

export async function stopRemoteAdapter(): Promise<void> {
  stopping = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  const spawned = child;
  const pid = spawned?.pid ?? state.pid;
  child = null;
  startPromise = null;
  if (pid) await stopProcessGroup(pid, SHUTDOWN_GRACE_MS);
  if (lastPaths) removePidRecord(lastPaths.userDataPath);
  state = { status: 'stopped', origin: ORIGIN };
}
