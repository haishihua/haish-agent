#!/usr/bin/env node
// Builds a clickable dev launcher for Haish.
//
// Why this exists: `npm run dev` runs `node_modules/electron/dist/Electron.app`
// (see node_modules/electron/path.txt), so the process的 Dock 标识来自 Electron 本身。
// 之前为了让 dev 有个「Haish」图标，是手工把 Electron.app 复制成
// node_modules/electron/dist/Haish.app 再钉到 Dock —— 那里归 package manager 管，
// 一次 npm install / 重装 electron 就被清掉，Dock 里只剩一个带问号的死链。
//
// 这里改成在 ~/Applications 下生成一个独立的小 app：点它就执行本仓库的
// `npm run dev`，不依赖 node_modules，永远不会被重装抹掉。
//
// 用法：npm run install:dev-launcher

import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appName = 'Haish Dev';
const bundleId = 'com.haish.agent.dev-launcher';
const appPath = path.join(os.homedir(), 'Applications', `${appName}.app`);
const contentsDir = path.join(appPath, 'Contents');
const macosDir = path.join(contentsDir, 'MacOS');
const resourcesDir = path.join(contentsDir, 'Resources');
const launchScript = path.join(macosDir, 'launch');
const iconSource = path.join(repoRoot, 'build', 'icon.icns');

function findNpm() {
  // 跟运行本脚本的 node 同目录的 npm 最准（nvm/homebrew 下都对得上），
  // 不写死任何本机路径。
  const sibling = path.join(path.dirname(process.execPath), 'npm');
  if (fs.existsSync(sibling)) return sibling;
  try {
    const found = execFileSync('sh', ['-c', 'command -v npm'], { encoding: 'utf8' }).trim();
    if (found) return found;
  } catch {
    // 落在下面的报错里
  }
  throw new Error('找不到 npm，请在能正常执行 npm 的终端里运行 npm run install:dev-launcher');
}

const npmBin = findNpm();

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>zh_CN</string>
  <key>CFBundleExecutable</key>
  <string>launch</string>
  <key>CFBundleIconFile</key>
  <string>Haish</string>
  <key>CFBundleIdentifier</key>
  <string>${bundleId}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${appName}</string>
  <key>CFBundleDisplayName</key>
  <string>${appName}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <!-- 只做启动器：不在 Dock 里额外占一格，真正的窗口归 dev 的 Electron 进程。 -->
  <key>LSUIElement</key>
  <true/>
  <key>LSMinimumSystemVersion</key>
  <string>12.0</string>
</dict>
</plist>
`;

// 前台 exec：Electron 退出时这里跟着结束，不会留下孤儿 watcher。
// PATH 必须显式给：从 Dock 启动的进程不继承登录 shell 的 PATH，
// 而 npm 的 shebang 是 /usr/bin/env node，找不到 node 会直接报
// "env: node: No such file or directory"。
const launcher = `#!/bin/sh
# 由 scripts/install-dev-launcher.mjs 生成，改这个文件请改脚本本身。
set -eu
cd ${JSON.stringify(repoRoot)}
export PATH=${"\""}${path.dirname(npmBin)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin${"\""}
LOG="\${HOME}/Library/Logs/haish-agent-dev.log"
mkdir -p "$(dirname "$LOG")"
exec ${JSON.stringify(npmBin)} run dev >>"$LOG" 2>&1
`;

// 内容没变就一个字节都不写：重写包内容（尤其重签）会让 Dock 里的固定项失效
// 而被剪掉，所以重复执行 install:dev-launcher 必须是完全无副作用的。
fs.mkdirSync(macosDir, { recursive: true });
fs.mkdirSync(resourcesDir, { recursive: true });

function writeIfChanged(file, content, mode) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.writeFileSync(file, content, 'utf8');
  if (mode) fs.chmodSync(file, mode);
  return true;
}

let changed = writeIfChanged(path.join(contentsDir, 'Info.plist'), infoPlist);
changed = writeIfChanged(launchScript, launcher, 0o755) || changed;

if (fs.existsSync(iconSource)) {
  const iconTarget = path.join(resourcesDir, 'Haish.icns');
  const iconBytes = fs.readFileSync(iconSource);
  if (!fs.existsSync(iconTarget) || !fs.readFileSync(iconTarget).equals(iconBytes)) {
    fs.copyFileSync(iconSource, iconTarget);
    changed = true;
  }
} else {
  console.warn(`[dev-launcher] 缺少图标 ${iconSource}，先用系统默认图标`);
}

if (changed) {
  // 改过包内容必须重新签名，否则 macOS 会判定包损坏。
  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'pipe' });
  } catch (error) {
    console.warn(`[dev-launcher] ad-hoc 签名失败：${error.message}`);
  }
}

execFileSync('plutil', ['-lint', path.join(contentsDir, 'Info.plist')], { stdio: 'inherit' });

console.log(`[dev-launcher] ${changed ? '已更新' : '无改动，保持原样'}：${appPath}`);
console.log('[dev-launcher] 点击它等于在仓库里执行 npm run dev（日志追加到 ~/Library/Logs/haish-agent-dev.log）');
