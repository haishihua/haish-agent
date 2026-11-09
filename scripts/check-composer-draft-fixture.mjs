import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import electron from 'electron';

// 独立 Vite 实例和临时端口避免依赖用户正在运行的开发服务。
const server = await createServer({
  configFile: 'vite.app-web.config.ts',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
let child;
try {
  await server.listen();
  const address = server.httpServer.address();
  const env = { ...process.env, DRAFT_FIXTURE_URL: `http://127.0.0.1:${address.port}/tests/fixtures/composer-draft-store.html` };
  delete env.ELECTRON_RUN_AS_NODE;
  // 开发启动器可能忽略传入的脚本；有原版 Electron 时使用它运行独立夹具。
  const standardElectron = resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
  const executable = process.platform === 'darwin' && existsSync(standardElectron) ? standardElectron : electron;
  child = spawn(executable, ['scripts/composer-draft-fixture.cjs'], { stdio: ['ignore', 'pipe', 'inherit'], env });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk); });
  const code = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { console.error('草稿夹具进程超时。'); child.kill(); }, 45000);
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('close', (status, signal) => { clearTimeout(timeout); resolve(signal ? 1 : status); });
  });
  if (code !== 0 || !output.includes('PASS: 未受控输入框的草稿')) {
    console.error('草稿夹具未完成或未报告成功。');
    process.exitCode = 1;
  }
} finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill();
  await server.close();
}
