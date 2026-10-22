import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
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
const execFileAsync = promisify(execFile);
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
// Set when the adapter became ready; used to tell "crashed right away" apart
// from "ran fine and then died", so a crash loop backs off instead of spinning.
let readyAt = 0;

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

async function probeRemoteStatus(timeoutMs: number): Promise<RemoteStatusPayload | null> {
  try {
    return await fetchRemoteStatus(timeoutMs);
  } catch {
    return null;
  }
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

type PidRecord = {
  pid: number;
  /** The app instance that started this adapter; kept so a second instance can
   *  tell a live adapter from an orphan. */
  ownerPid: number | null;
};

function readPidRecord(userDataPath: string): PidRecord | null {
  try {
    const raw = fs.readFileSync(pidPath(userDataPath), 'utf8').trim();
    if (!raw) return null;
    if (raw.startsWith('{')) {
      const parsed = JSON.parse(raw) as { pid?: unknown; ownerPid?: unknown };
      const pid = Number(parsed.pid);
      const ownerPid = Number(parsed.ownerPid);
      if (!Number.isInteger(pid) || pid <= 0) return null;
      return { pid, ownerPid: Number.isInteger(ownerPid) && ownerPid > 0 ? ownerPid : null };
    }
    // Older builds wrote a bare pid with no owner recorded.
    const pid = Number(raw);
    return Number.isInteger(pid) && pid > 0 ? { pid, ownerPid: null } : null;
  } catch {
    return null;
  }
}

function writePidRecord(userDataPath: string, pid: number): void {
  try {
    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(
      pidPath(userDataPath),
      `${JSON.stringify({ pid, ownerPid: process.pid })}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
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

// Only a *stale* adapter is stopped here, and "stale" is decided by ownership:
// the pid record names the app instance that started it, so a second running
// instance leaves a live adapter alone instead of killing it (two instances
// used to reap each other's adapter once a second, forever). The command line is
// re-checked before signalling, because pids get recycled.
async function commandLineOf(pid: number): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('ps', ['-p', String(pid), '-o', 'command=']);
    return String(stdout).trim() || null;
  } catch {
    return null;
  }
}

async function reapStaleAdapter(paths: RemotePaths): Promise<void> {
  const record = readPidRecord(paths.userDataPath);
  if (!record) return;
  const { pid, ownerPid } = record;
  if (ownerPid !== null && ownerPid !== process.pid && processAlive(ownerPid)) {
    return;
  }
  if (pid === process.pid) {
    removePidRecord(paths.userDataPath);
    return;
  }
  if (!processAlive(pid) && !processGroupAlive(pid)) {
    removePidRecord(paths.userDataPath);
    return;
  }
  const command = await commandLineOf(pid);
  if (command && !command.includes(ADAPTER_COMMAND_MARKER)) {
    removePidRecord(paths.userDataPath);
    return;
  }
  console.log(`[local-remote] stopping a remote adapter left behind by a previous run (process group ${pid})`);
  await stopProcessGroup(pid, SHUTDOWN_GRACE_MS);
  removePidRecord(paths.userDataPath);
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
    // An adopted adapter has no exit handler here, so a dead shared adapter is
    // reported (and taken over) on the next ensureRemoteAdapter call.
    if (state.adopted) {
      state = {
        status: 'failed',
        origin: ORIGIN,
        message: 'The shared remote adapter stopped responding.',
      };
    }
  }
  return state;
}

export async function ensureRemoteAdapter(
  paths: RemotePaths,
  settings?: RemoteSettings | null,
): Promise<RemoteAdapterState> {
  lastPaths = paths;
  if (state.status === 'ready' && (state.adopted === true || (child && child.exitCode === null))) {
    return state;
  }
  if (startPromise) {
    return startPromise;
  }

  startPromise = (async () => {
    try {
      // Another instance (the packaged app next to a dev build) may already
      // serve port 8766. Adopt that process instead of replacing it: killing it
      // is what turned two running instances into a once-per-second restart
      // loop, and it also spares the PyInstaller unpack on every cycle.
      const shared = child === null ? await probeRemoteStatus(STATUS_TIMEOUT_MS) : null;
      if (shared) {
        readyAt = Date.now();
        restartAttempts = 0;
        state = {
          status: 'ready',
          origin: ORIGIN,
          adopted: true,
          version: shared.version,
          runtimeOnline: shared.runtime_online,
          tunnel: shared.tunnel,
        };
        return state;
      }

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
        // Only a process that stayed up counts as recovery; a crash loop keeps
        // its attempt count and backs off instead of restarting every second.
        if (readyAt && Date.now() - readyAt >= 15_000) restartAttempts = 0;
        readyAt = 0;
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
        readyAt = Date.now();
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
      }
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
  // Only ever stop the process this instance started. `state.pid` may name an
  // adapter adopted from another running instance, and quitting must not kill it.
  const pid = spawned?.pid;
  child = null;
  startPromise = null;
  readyAt = 0;
  if (pid) await stopProcessGroup(pid, SHUTDOWN_GRACE_MS);
  if (lastPaths) removePidRecord(lastPaths.userDataPath);
  state = { status: 'stopped', origin: ORIGIN };
}
