const { app, BrowserWindow } = require('electron');

// Only run offline regression fixtures against an explicitly supplied local Vite server.
const target = new URL(process.argv[2]);
if (target.hostname !== '127.0.0.1' || target.protocol !== 'http:' || !target.pathname.startsWith('/tests/fixtures/')) {
  throw new Error('Expected a local regression fixture URL');
}
app.commandLine.appendSwitch('disable-gpu');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  const timeout = setTimeout(() => { console.error('FAIL: fixture timed out'); app.exit(1); }, 30000);
  try {
    await win.loadURL(target.href);
    for (;;) {
      const result = await win.webContents.executeJavaScript("document.querySelector('#result')?.textContent || ''");
      if (/^(PASS|FAIL):/.test(result)) {
        console.log(result);
        clearTimeout(timeout);
        app.exit(result.startsWith('PASS:') ? 0 : 1);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  } catch (error) {
    clearTimeout(timeout);
    console.error(error);
    app.exit(1);
  }
}).catch(error => { console.error(error); app.exit(1); });
