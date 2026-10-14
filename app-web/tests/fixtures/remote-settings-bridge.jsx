import React from 'react';
import { createRoot } from 'react-dom/client';
import { RemoteControlDialog } from '../../src/features/remote/components/RemoteControlDialog.jsx';
import '../../styles.css';

// Exactly the desktop contract: save returns RemoteAdapterState; get returns
// normalized RemoteSettings. No server config fields are present in status.
const adapter = { status: 'ready', origin: 'http://fixture.invalid', pid: 123, runtimeOnline: true, tunnel: { enabled: true, running: true, pid: 456, server: 'fixture.invalid', remote_port: 19000, restarts: 0, last_error: null } };
let settings = null;
let readFailure = false;
let saveFailure = false;
let saves = 0;
let reads = 0;
let pairings = 0;
const previousBridge = window.haish;
window.haish = {
  getRemoteSettings: async () => { reads += 1; if (readFailure) throw new Error('Fixture readback unavailable'); return settings; },
  getRemoteStatus: async () => adapter,
  saveRemoteSettings: async draft => {
    saves += 1;
    if (saveFailure) throw new Error('Fixture save refused');
    settings = { ...draft, publicEndpoint: new URL(draft.publicEndpoint).origin };
    return adapter;
  },
  startRemotePairing: async () => { pairings += 1; return { pairing_uri: 'haish://pair?fixture=offline', expires_in: 300 }; },
  listRemoteDevices: async () => [],
};
const root = createRoot(document.getElementById('root'));
root.render(<RemoteControlDialog onClose={() => root.unmount()} />);
const report = document.getElementById('checks');
const results = [];
const tick = () => new Promise(resolve => setTimeout(resolve, 120));
const check = (condition, label) => { if (!condition) throw new Error(label); results.push(`PASS ${label}`); };
const field = label => [...document.querySelectorAll('.remote-settings-grid label')].find(row => row.querySelector('span')?.textContent === label)?.querySelector('input');
const input = async (label, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field(label), value);
  field(label).dispatchEvent(new Event('input', { bubbles: true })); await tick();
};
const submit = async () => { document.querySelector('.remote-settings-panel').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await tick(); };
const reopen = async () => { document.querySelector('.remote-settings-link').click(); await tick(); };
async function run() {
  await tick();
  check(Boolean(field('Server address')), 'unconfigured bridge opens settings');
  await input('Server address', '  fixture.invalid  ');
  await input('Server port', '7100'); await input('Public port', '19000');
  await input('Public address', 'https://fixture.invalid/path'); await input('Auth token', '  fixture-token  ');
  await submit();
  check(!document.querySelector('.remote-settings-panel'), 'successful save closes editor');
  check(reads === 2 && saves === 1, 'save reads canonical settings once after adapter result');
  check(pairings === 1, 'pairing resumes using configured state');
  await reopen();
  for (const [label, value] of [['Server address', 'fixture.invalid'], ['Server port', '7100'], ['Public port', '19000'], ['Public address', 'https://fixture.invalid'], ['Auth token', 'fixture-token']]) {
    check(field(label).value === value, `reopen retains canonical ${label}`);
  }
  await submit(); await reopen();
  check(field('Server address').value === 'fixture.invalid' && saves === 2, 'repeated save/reopen does not confuse status with settings');
  readFailure = true;
  await input('Server address', 'second.invalid'); await submit();
  check(Boolean(document.querySelector('.remote-settings-panel')) && field('Server address').value === 'second.invalid', 'readback failure keeps current edit open');
  check(document.querySelector('.remote-settings-panel').textContent.includes('Fixture readback unavailable'), 'readback failure is visible');
  readFailure = false; saveFailure = true; await submit();
  check(document.querySelector('.remote-settings-panel').textContent.includes('Fixture save refused'), 'save failure is visible and keeps draft');
  check(saves === 4, 'neither failure automatically replays save');
  root.unmount(); window.haish = previousBridge;
  report.dataset.result = 'PASS'; report.textContent = results.join('\n');
}
run().catch(error => { root.unmount(); window.haish = previousBridge; report.dataset.result = 'FAIL'; report.textContent = `${results.join('\n')}\nFAIL ${error.stack || error}`; });
