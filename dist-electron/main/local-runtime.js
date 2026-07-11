import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
let child = null;
let state = { status: 'idle', baseUrl: '' };
let startPromise = null;
function choosePython(runtimeRepo) {
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
function chooseRuntimeCommand(runtimeRepo) {
    const bundledRuntimeExecutable = path.join(runtimeRepo, BUNDLED_RUNTIME_EXECUTABLE);
    if (fs.existsSync(bundledRuntimeExecutable)) {
        return { command: bundledRuntimeExecutable, argsPrefix: [] };
    }
    return { command: choosePython(runtimeRepo), argsPrefix: ['-m', 'haish_agent_core.app.web'] };
}
function runtimeRepoPath(paths) {
    if (process.env.HAISH_LOCAL_RUNTIME_CWD) {
        return process.env.HAISH_LOCAL_RUNTIME_CWD;
    }
    const bundledRuntime = path.join(paths.resourcesPath, BUNDLED_RUNTIME_DIR);
    if (paths.isPackaged && fs.existsSync(bundledRuntime)) {
        return bundledRuntime;
    }
    for (const candidate of DEV_RUNTIME_REPO_CANDIDATES) {
        if (fs.existsSync(path.join(candidate, 'pyproject.toml'))
            && fs.existsSync(path.join(candidate, 'src', 'haish_agent_core'))) {
            return candidate;
        }
    }
    throw new Error('Could not locate the Haish Python backend (haish-agent-core). '
        + `Looked for: ${DEV_RUNTIME_REPO_CANDIDATES.join(', ')}. `
        + 'Clone the haish-agent-core repo next to this project, or set '
        + 'HAISH_LOCAL_RUNTIME_CWD to its absolute path.');
}
function runtimeWorkdir(userDataPath) {
    return process.env.HAISH_LOCAL_RUNTIME_WORKDIR || path.join(userDataPath, 'runtime');
}
function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }
    const result = {};
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match)
            continue;
        let value = match[2].trim();
        if ((value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        result[match[1]] = value;
    }
    return result;
}
function ensureRuntimeMcpConfig(runtimeRepo, workdir) {
    const runtimeMcpConfig = path.join(workdir, 'mcp.json');
    if (fs.existsSync(runtimeMcpConfig)) {
        return runtimeMcpConfig;
    }
    const bundledMcpConfig = path.join(runtimeRepo, 'mcp.json');
    if (fs.existsSync(bundledMcpConfig)) {
        fs.copyFileSync(bundledMcpConfig, runtimeMcpConfig);
    }
    else {
        fs.writeFileSync(runtimeMcpConfig, `${JSON.stringify({ servers: {} }, null, 2)}\n`, 'utf8');
    }
    return runtimeMcpConfig;
}
function runtimeEnv(paths, runtimeRepo, workdir) {
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
async function findFreePort() {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.on('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            server.close(() => {
                if (address && typeof address === 'object') {
                    resolve(address.port);
                }
                else {
                    reject(new Error('Could not allocate local runtime port.'));
                }
            });
        });
    });
}
async function waitForRuntime(baseUrl, timeoutMs) {
    const startedAt = Date.now();
    let lastError = null;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const response = await fetch(`${baseUrl}/api/health`);
            if (response.ok) {
                return;
            }
            lastError = new Error(`healthcheck returned ${response.status}`);
        }
        catch (error) {
            lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, 350));
    }
    throw lastError instanceof Error ? lastError : new Error('Local runtime did not become ready.');
}
export async function startLocalRuntime(paths) {
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
        child = spawn(runtimeCommand.command, [
            ...runtimeCommand.argsPrefix,
            '--host',
            '127.0.0.1',
            '--port',
            String(port),
            '--workdir',
            workdir,
            '--cors-origin',
            'haish://app',
        ], {
            cwd: workdir,
            env: runtimeEnv(paths, runtimeRepo, workdir),
        });
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
        }
        catch (error) {
            const message = String(error?.message || error);
            child?.kill();
            state = { status: 'failed', baseUrl, message };
            throw new Error(`Local runtime failed to start: ${message}`);
        }
        finally {
            startPromise = null;
        }
    })();
    return startPromise;
}
export async function ensureLocalRuntime(paths) {
    if (state.status === 'ready') {
        return state;
    }
    return startLocalRuntime(paths);
}
export function getLocalRuntimeState() {
    return state;
}
export async function stopLocalRuntime() {
    state = { ...state, status: 'stopped' };
    const current = child;
    child = null;
    startPromise = null;
    if (!current || current.exitCode !== null || current.signalCode !== null) {
        return;
    }
    await new Promise((resolve) => {
        let settled = false;
        const finish = () => {
            if (settled)
                return;
            settled = true;
            clearTimeout(killTimer);
            clearTimeout(reapTimer);
            resolve();
        };
        current.once('exit', finish);
        try {
            current.kill('SIGTERM');
        }
        catch {
            finish();
            return;
        }
        // SIGTERM 没在窗口内生效就升级到 SIGKILL，再给 500ms 让 OS 回收。
        const killTimer = setTimeout(() => {
            if (settled)
                return;
            if (current.exitCode === null && current.signalCode === null) {
                try {
                    current.kill('SIGKILL');
                }
                catch {
                    // 已经死了
                }
            }
        }, SHUTDOWN_GRACE_MS);
        const reapTimer = setTimeout(finish, SHUTDOWN_GRACE_MS + 500);
    });
}
