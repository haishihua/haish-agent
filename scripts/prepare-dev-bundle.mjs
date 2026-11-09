#!/usr/bin/env node
// 让 `npm run dev` 的 Dock 标识是「Haish Dev」，而不是 Electron。
//
// 背景：`electron .` 跑的是 node_modules/electron/dist/Electron.app（见
// node_modules/electron/path.txt），所以 Dock 里显示的是 Electron 的名字。
// 之前是手工把 Electron.app 复制成 Haish.app 再钉到 Dock，一旦 npm install
// 重装 electron 就被清掉，Dock 里只剩一个带问号的死链。
//
// 这里把「改名后的 dev 应用包」变成可重建的一步：克隆 Electron.app →
// 改 CFBundleName/可执行文件名 → 重签 → 把 path.txt 指过去。predev 自动执行，
// 所以每次 npm 重装后第一次 `npm run dev` 就会把标识修回来。
//
// 用法：npm run prepare:dev-bundle（一般由 predev 自动触发）

import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const electronDist = path.join(repoRoot, 'node_modules', 'electron', 'dist');
const sourceBundle = path.join(electronDist, 'Electron.app');
const targetBundle = path.join(electronDist, 'Haish Dev.app');
const executableName = 'Haish Dev';
const bundleId = 'com.haish.agent.dev';
const pathFile = path.join(repoRoot, 'node_modules', 'electron', 'path.txt');
const relativeEntry = `${path.basename(targetBundle)}/Contents/MacOS/${executableName}`;

if (process.platform !== 'darwin') {
  console.log('[dev-bundle] 只有 macOS 需要这一步，跳过。');
  process.exit(0);
}

if (!fs.existsSync(sourceBundle)) {
  console.error(`[dev-bundle] 找不到 ${sourceBundle}，先跑一次 npm install。`);
  process.exit(1);
}

const plistPath = path.join(targetBundle, 'Contents', 'Info.plist');

function bundleName() {
  if (!fs.existsSync(plistPath)) return '';
  return execFileSync('plutil', ['-extract', 'CFBundleName', 'raw', '-o', '-', plistPath], {
    encoding: 'utf8',
  }).trim();
}

const iconSource = path.join(repoRoot, 'build', 'icon.icns');

function ensureBundleIdentity() {
  const executable = path.join(targetBundle, 'Contents', 'MacOS', 'Electron');
  if (fs.existsSync(executable)) {
    fs.renameSync(executable, path.join(targetBundle, 'Contents', 'MacOS', executableName));
  }
  // 图标进包：改名后 Electron 认为自己是已安装应用，不再走 app.dock.setIcon，
  // 所以 Dock/Finder 里的脸只能由包内的 icns 提供。
  if (fs.existsSync(iconSource)) {
    fs.copyFileSync(iconSource, path.join(targetBundle, 'Contents', 'Resources', 'Haish.icns'));
  }
  const overrides = [
    ['CFBundleExecutable', executableName],
    ['CFBundleName', executableName],
    ['CFBundleDisplayName', executableName],
    ['CFBundleIdentifier', bundleId],
    ...(fs.existsSync(iconSource) ? [['CFBundleIconFile', 'Haish']] : []),
  ];
  for (const [key, value] of overrides) {
    execFileSync('plutil', ['-replace', key, '-string', value, plistPath]);
  }
  // 改过包内容必须重签，否则 macOS 判定包损坏、拒绝启动。
  signBundle();
}

// 不用 --deep：Resources/app 是指回仓库的软链接，深度签名会一路走进源码目录。
// 浅签就够，因为我们只改了包自身（Info.plist、主二进制、Resources 下的软链接）。
function signBundle() {
  execFileSync('codesign', ['--force', '--sign', '-', targetBundle], { stdio: 'pipe' });
}

// 把 app 装进包里：不装的话直接双击这个包只会弹出 Electron 的默认引导页
// （"To run a local app, execute the following..."）。用相对软链接指回仓库，
// 不复制源码：npm run dev 走 path.txt + 仓库路径，双击包则走 Resources/app。
function ensureAppLink() {
  const linkPath = path.join(targetBundle, 'Contents', 'Resources', 'app');
  const expected = path.relative(path.dirname(linkPath), repoRoot);
  let current = null;
  try {
    current = fs.readlinkSync(linkPath);
  } catch {
    current = null;
  }
  if (current === expected) return false;
  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.symlinkSync(expected, linkPath, 'dir');
  return true;
}

function cloneBundle() {
  fs.rmSync(targetBundle, { recursive: true, force: true });
  try {
    // APFS 上直接写时复制，几百 MB 秒级完成。
    execFileSync('cp', ['-Rc', sourceBundle, targetBundle], { stdio: 'pipe' });
  } catch {
    execFileSync('cp', ['-R', sourceBundle, targetBundle], { stdio: 'pipe' });
  }
  ensureBundleIdentity();
}

function ensurePathFile() {
  const current = fs.existsSync(pathFile) ? fs.readFileSync(pathFile, 'utf8').trim() : '';
  if (current !== relativeEntry) {
    fs.writeFileSync(pathFile, relativeEntry, 'utf8');
    console.log(`[dev-bundle] path.txt -> ${relativeEntry}`);
  }
}

const bundleReady = () => bundleName() === executableName
  && fs.existsSync(path.join(targetBundle, 'Contents', 'MacOS', executableName))
  && (!fs.existsSync(iconSource) || fs.existsSync(path.join(targetBundle, 'Contents', 'Resources', 'Haish.icns')))
  && fs.existsSync(path.join(targetBundle, 'Contents', 'Resources', 'app', 'package.json'));

if (bundleReady()) {
  ensurePathFile();
  console.log(`[dev-bundle] 已就绪：${path.basename(targetBundle)}`);
} else {
  if (!fs.existsSync(path.join(targetBundle, 'Contents', 'Resources', 'app'))) {
    cloneBundle();
  }
  if (ensureAppLink()) {
    signBundle();
  }
  ensurePathFile();
  console.log(`[dev-bundle] 已重建 ${path.basename(targetBundle)}，Dock 里将显示「${executableName}」`);
}
