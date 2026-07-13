#!/usr/bin/env node
/**
 * Build macOS artifacts and publish a GitHub Release for electron-updater.
 *
 * Usage:
 *   npm run release:mac              # signed/notarized when credentials exist
 *   npm run release:mac:unsigned     # skip signing gate; useful for internal smoke
 *
 * Requirements:
 *   - gh CLI authenticated (gh auth status)
 *   - package.json version already bumped for this release
 *   - For private repos: clients need GH_TOKEN to download updates unless
 *     the repository (or release assets) are made publicly readable.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const unsigned = process.argv.includes('--unsigned');
const dryRun = process.argv.includes('--dry-run');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.stdio || 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(
      `${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`,
    );
  }
  return result;
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`,
    );
  }
  return (result.stdout || '').trim();
}

function fail(message, details = []) {
  console.error(`\n[release:mac] ${message}`);
  for (const detail of details) console.error(`  - ${detail}`);
  process.exit(1);
}

function readPackageJson() {
  return JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
}

function listReleaseAssets(version) {
  const releaseDir = path.join(root, 'release');
  if (!existsSync(releaseDir)) return [];

  // electron-updater needs zip + latest-mac.yml (+ blockmap). dmg is for first install.
  return readdirSync(releaseDir)
    .map((name) => path.join(releaseDir, name))
    .filter((full) => statSync(full).isFile())
    .filter((full) => {
      const name = path.basename(full);
      if (name === 'latest-mac.yml' || name === 'latest-mac.yaml') return true;
      if (!name.includes(version)) return false;
      return (
        name.endsWith('.dmg')
        || name.endsWith('.zip')
        || name.endsWith('.blockmap')
        || name.endsWith('.yml')
        || name.endsWith('.yaml')
      );
    });
}

function main() {
  const pkg = readPackageJson();
  const version = pkg.version;
  if (!version) fail('package.json is missing version.');

  console.log(`[release:mac] version=${version} unsigned=${unsigned} dryRun=${dryRun}`);

  try {
    runCapture('gh', ['auth', 'status']);
  } catch (error) {
    fail('GitHub CLI is not authenticated.', [
      'Run: gh auth login',
      String(error.message || error),
    ]);
  }

  const repo = runCapture('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner']);
  console.log(`[release:mac] repo=${repo}`);

  if (!unsigned) {
    console.log('[release:mac] checking signing/notarization prerequisites…');
    run('node', ['scripts/check-mac-release.mjs']);
  } else {
    console.log('[release:mac] --unsigned: skipping check-mac-release.mjs');
  }

  console.log('[release:mac] building web + electron + runtime…');
  run('npm', ['run', 'build']);
  run('npm', ['run', 'build:runtime']);

  const builderArgs = ['--mac', 'dmg', 'zip', '--publish', 'never'];
  if (!unsigned) {
    builderArgs.push('--config.forceCodeSigning=true');
  }
  console.log(`[release:mac] electron-builder ${builderArgs.join(' ')}`);
  run('npx', ['electron-builder', ...builderArgs]);

  const assets = listReleaseAssets(version);
  if (!assets.length) {
    fail('No release assets found under release/.', [
      `Expected Haish-${version}-*.dmg/zip and latest-mac.yml`,
    ]);
  }

  console.log('[release:mac] assets to upload:');
  for (const asset of assets) {
    const sizeMb = (statSync(asset).size / (1024 * 1024)).toFixed(1);
    console.log(`  - ${path.basename(asset)} (${sizeMb} MiB)`);
  }

  const tag = `v${version}`;
  const title = `Haish ${version}`;
  const notes = [
    `Haish desktop ${version}`,
    '',
    'Install: open the `.dmg` and drag Haish to Applications.',
    'In-app updates use the `.zip` + `latest-mac.yml` published with this release.',
    '',
    unsigned
      ? 'Note: this build was published with --unsigned (may require right-click → Open on first launch).'
      : 'This build was signed and notarized when credentials were available.',
  ].join('\n');

  if (dryRun) {
    console.log(`[release:mac] dry-run: would create/upload release ${tag} to ${repo}`);
    return;
  }

  // Create or reuse draft-less release, then upload assets (clobber on re-run).
  const existing = spawnSync(
    'gh',
    ['release', 'view', tag, '--repo', repo],
    { cwd: root, encoding: 'utf8' },
  );

  if (existing.status === 0) {
    console.log(`[release:mac] release ${tag} exists — uploading/replacing assets…`);
    run('gh', [
      'release',
      'upload',
      tag,
      ...assets,
      '--repo',
      repo,
      '--clobber',
    ]);
  } else {
    console.log(`[release:mac] creating release ${tag}…`);
    run('gh', [
      'release',
      'create',
      tag,
      ...assets,
      '--repo',
      repo,
      '--title',
      title,
      '--notes',
      notes,
    ]);
  }

  console.log(`\n[release:mac] done: https://github.com/${repo}/releases/tag/${tag}`);
  console.log('[release:mac] users on older packaged builds can use Check for updates.');
  if (repo) {
    console.log(
      '[release:mac] note: private repositories require authenticated download for in-app updates.',
    );
  }
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
