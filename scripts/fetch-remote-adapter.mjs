#!/usr/bin/env node
/**
 * Download the pinned remote-adapter artifacts from the private
 * haishihua/haish-agent-remote release into build/remote-adapter/.
 *
 * scripts/remote-adapter.lock.json is the trust anchor: every file is verified
 * against its sha256 before it reaches the app bundle, and a mismatch fails the
 * build. Auth comes from GH_TOKEN / GITHUB_TOKEN or an authenticated `gh` CLI;
 * a download that needs a proxy reports that instead of failing silently.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = path.join(root, 'scripts', 'remote-adapter.lock.json');
const targetDir = path.join(root, 'build', 'remote-adapter');
const downloadDir = path.join(root, 'build', 'remote-adapter-download');

function fail(message) {
  console.error(`[fetch:remote-adapter] ${message}`);
  process.exit(1);
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function runGh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8', env: process.env });
  if (result.error?.code === 'ENOENT') {
    fail('The GitHub CLI (gh) is required. Install it and run `gh auth login`, or set GH_TOKEN.');
  }
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    if (/auth|not logged|token/i.test(detail)) {
      fail(`gh is not authenticated. Run \`gh auth login\` or set GH_TOKEN.\n${detail}`);
    }
    if (/proxy|timed? ?out|dial tcp|EOF|connect/i.test(detail)) {
      fail(
        'Could not reach GitHub. If this network needs a proxy, export it first, '
        + 'for example: HTTPS_PROXY=http://127.0.0.1:7890 npm run fetch:remote-adapter\n'
        + detail,
      );
    }
    fail(`gh ${args.join(' ')} failed:\n${detail}`);
  }
  return result.stdout;
}

const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
if (!lock.tag || !lock.repository || !Array.isArray(lock.assets) || lock.assets.length === 0) {
  fail(`${lockPath} is incomplete.`);
}

mkdirSync(targetDir, { recursive: true });

for (const asset of lock.assets) {
  const targetName = String(asset.target || asset.name);
  if (!asset.name || !/^[A-Za-z0-9._-]+$/.test(targetName) || !/^[a-f0-9]{64}$/.test(String(asset.sha256 || ''))) {
    fail(`Invalid asset entry in the lock file: ${JSON.stringify(asset)}`);
  }
  const target = path.join(targetDir, targetName);
  if (existsSync(target) && sha256(target) === asset.sha256) {
    if (asset.executable) chmodSync(target, 0o755);
    console.log(`[fetch:remote-adapter] ${targetName} already verified`);
    continue;
  }

  console.log(`[fetch:remote-adapter] downloading ${asset.name} from ${lock.repository}@${lock.tag}`);
  rmSync(downloadDir, { recursive: true, force: true });
  mkdirSync(downloadDir, { recursive: true });
  runGh([
    'release', 'download', lock.tag,
    '-R', lock.repository,
    '--pattern', asset.name,
    '-D', downloadDir,
    '--clobber',
  ]);
  const downloaded = path.join(downloadDir, asset.name);
  if (!existsSync(downloaded)) {
    fail(`The release ${lock.tag} does not contain ${asset.name}.`);
  }
  const digest = sha256(downloaded);
  if (digest !== asset.sha256) {
    rmSync(downloadDir, { recursive: true, force: true });
    rmSync(target, { force: true });
    fail(`${asset.name} failed verification: expected ${asset.sha256}, got ${digest}.`);
  }
  copyFileSync(downloaded, target);
  if (asset.executable) chmodSync(target, 0o755);
  rmSync(downloadDir, { recursive: true, force: true });
  console.log(`[fetch:remote-adapter] ${targetName} verified (sha256 ${digest.slice(0, 12)}…)`);
}

console.log(`[fetch:remote-adapter] ${lock.tag} is ready in build/remote-adapter`);
