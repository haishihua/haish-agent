const { app, BrowserWindow } = require('electron');

app.commandLine.appendSwitch('disable-gpu');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(win, expression, expected, label) {
  const deadline = Date.now() + 10000;
  let value;
  while (Date.now() < deadline) {
    value = await win.webContents.executeJavaScript(expression);
    if (value === expected) return;
    await pause(50);
  }
  throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
}

async function typeDraft(win, text) {
  await win.webContents.executeJavaScript("document.querySelector('[contenteditable=\"true\"]').focus()");
  await win.webContents.insertText(text);
  await waitFor(win, "document.querySelector('[contenteditable=\"true\"]')?.textContent", text, '输入内容');
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 900, show: false, webPreferences: { backgroundThrottling: false } });
  const timeout = setTimeout(() => { console.error('FAIL: 夹具超时'); app.exit(1); }, 30000);
  try {
    await win.loadURL(process.env.DRAFT_FIXTURE_URL);
    await waitFor(win, "Boolean(document.querySelector('[contenteditable=\"true\"]'))", true, '输入框挂载');
    await typeDraft(win, 'Draft A');
    await win.webContents.executeJavaScript("document.querySelector('#switch-b').click()");
    await waitFor(win, "document.querySelector('[contenteditable=\"true\"]')?.textContent", '', '切换到 B');
    await typeDraft(win, 'Draft B');
    await win.webContents.executeJavaScript("document.querySelector('#switch-a').click()");
    await waitFor(win, "document.querySelector('[contenteditable=\"true\"]')?.textContent", 'Draft A', '切回 A');
    await win.webContents.executeJavaScript("document.querySelector('#switch-b').click()");
    await waitFor(win, "document.querySelector('[contenteditable=\"true\"]')?.textContent", 'Draft B', '切回 B');
    console.log('PASS: 未受控输入框的草稿在两个会话之间独立保存和恢复');
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    clearTimeout(timeout);
    console.error('FAIL:', error.stack || error);
    app.exit(1);
  }
}).catch((error) => { console.error(error); app.exit(1); });
