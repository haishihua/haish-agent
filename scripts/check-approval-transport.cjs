const { app, BrowserWindow, protocol, net } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const assert = require('node:assert/strict');

protocol.registerSchemesAsPrivileged([
  { scheme: 'approval-test', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
let active = 0;
let total = 0;
async function waitFor(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(predicate(), 'transport did not reach expected state within 3 seconds');
}
const server = http.createServer((req, res) => {
  if (req.url === '/api/approvals/stream') {
    active++;
    total++;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write('data: ' + JSON.stringify({ type: 'approval_snapshot', state: {
      mode: 'smart', pending: [], pending_workflow_approvals: [],
      pending_user_inputs: [], pending_browser_runtime_installs: [],
    } }) + '\n\n');
    res.on('close', () => active--);
  } else if (req.url === '/store.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.end(fs.readFileSync('app-web/src/features/approvals/model/approval-store.js', 'utf8')
      .replace(/import .*?from .*?;\n/, "const API_BASE = '';\n"));
  } else {
    res.end('<!doctype html><title>Approval transport check</title>');
  }
});

app.whenReady().then(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const { proxyResponse } = await import('../dist-electron/main/proxy-response.js');
  protocol.handle('approval-test', request => {
    const url = new URL(request.url);
    return proxyResponse(signal => net.fetch(base + url.pathname, { signal }), request.signal);
  });
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } });
  try {
    await win.loadURL('approval-test://app/');
    await win.webContents.executeJavaScript(`(async () => {
      const { approvalStore: store } = await import('/store.js');
      window.store = store;
      store.start();
      await new Promise(resolve => {
        const unsubscribe = store.subscribeMode(mode => {
          if (mode) { queueMicrotask(unsubscribe); resolve(); }
        });
      });
      for (let i = 0; i < 30; i++) {
        const a = store.subscribe(() => {});
        const b = store.subscribeInputs(() => {});
        const c = store.subscribeMode(() => {});
        a(); b(); c();
      }
    })()`);
    assert.equal(total, 1, 'view switches must not open streams');
    assert.equal(active, 1);
    await win.webContents.executeJavaScript('window.store.stop()');
    await waitFor(() => active === 0);
    assert.equal(active, 0, 'renderer cancellation must close upstream SSE');
    for (let i = 0; i < 12; i++) {
      const previousTotal = total;
      await win.webContents.executeJavaScript('window.store.start()');
      await waitFor(() => total === previousTotal + 1 && active === 1);
      await win.webContents.executeJavaScript('window.store.stop()');
      await waitFor(() => active === 0);
    }
    await win.webContents.executeJavaScript('window.store.start()');
    await waitFor(() => active === 1);
    await win.loadURL('approval-test://app/');
    await waitFor(() => active === 0);
    console.log('PASS: 30 view subscription switches = 1 SSE; 12 start/stop cycles and page reload = 0 leaked streams');
  } finally {
    win.destroy();
    server.closeAllConnections();
    server.close();
  }
}).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
