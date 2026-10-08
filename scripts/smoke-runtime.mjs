import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function smokeRuntime(executable, { timeoutMs = 120_000, logPath } = {}) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'haish-runtime-smoke-'));
  const home = path.join(temp, 'home');
  mkdirSync(home);
  const envFile = path.join(temp, 'empty.env');
  const mcpFile = path.join(temp, 'mcp.json');
  writeFileSync(envFile, '');
  writeFileSync(mcpFile, '{"servers":{}}\n');
  let child;
  let output = '';
  let exited = false;
  let launchError;
  let exitPromise;
  const capture = (chunk) => { output = (output + String(chunk)).slice(-128_000); };
  try {
    const port = await freePort();
    child = spawn(path.resolve(executable), [
      '--host', '127.0.0.1', '--port', String(port), '--workdir', temp,
      '--cors-origin', 'haish://app',
    ], {
      cwd: temp,
      // No developer credentials, PYTHONPATH, runtime overrides or real user state.
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin', HOME: home, TMPDIR: temp,
        LANG: 'en_US.UTF-8', PYTHONUNBUFFERED: '1',
        HAISH_APP_HOME: temp, HAISH_APP_WORKDIR: temp,
        HAISH_ENV_PATH: envFile, HAISH_MCP_CONFIG: mcpFile,
        XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, XDG_DATA_HOME: home,
      },
    });
    child.stdout.on('data', capture);
    child.stderr.on('data', capture);
    exitPromise = new Promise((resolve) => child.once('close', resolve));
    child.once('error', (error) => { launchError = error; exited = true; });
    child.once('exit', (code, signal) => {
      launchError ||= new Error(`Runtime exited with code ${code}, signal ${signal}`);
      exited = true;
    });
    const deadline = Date.now() + timeoutMs;
    const getJson = async (url) => {
      const response = await fetch(`http://127.0.0.1:${port}${url}`, {
        signal: AbortSignal.timeout(Math.max(1, Math.min(3_000, deadline - Date.now()))),
      });
      if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
      return response.json();
    };
    let ready = false;
    while (Date.now() < deadline) {
      if (exited) throw launchError;
      try {
        await getJson('/api/health');
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    if (!ready) throw new Error(`Runtime health timed out after ${timeoutMs}ms`);
    let owner;
    for (const mode of ['chat', 'bot']) {
      const projects = await getJson(`/api/projects?execution_mode=${mode}&summary_only=true`);
      if (!projects?.owner_id || !Array.isArray(projects.projects)) {
        throw new Error(`Invalid ${mode} project list payload`);
      }
      if (owner && owner !== projects.owner_id) throw new Error('Inconsistent project owner_id');
      owner = projects.owner_id;
    }
    await getJson('/api/schedules');
    if (exited) throw launchError;
    console.log('[runtime-smoke] health, chat/bot projects and schedules passed.');
  } catch (error) {
    throw new Error(`${error.message}\n${output}`, { cause: error });
  } finally {
    if (child?.pid && !exited) {
      child.kill('SIGTERM');
      const deadline = Date.now() + 5_000;
      while (!exited && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!exited) child.kill('SIGKILL');
    }
    if (exitPromise) await exitPromise;
    if (logPath) {
      mkdirSync(path.dirname(logPath), { recursive: true });
      writeFileSync(logPath, output);
    }
    rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: smoke-runtime.mjs <frozen runtime executable>');
  await smokeRuntime(process.argv[2], {
    logPath: path.resolve(process.argv[3] || 'build/runtime-smoke.log'),
  });
}
