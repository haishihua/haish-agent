import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const topBarSource = fs.readFileSync(new URL('../../src/features/app/components/TopBar.jsx', import.meta.url), 'utf8');
const dialogSource = fs.readFileSync(
  new URL('../../src/features/remote/components/RemoteControlDialog.jsx', import.meta.url),
  'utf8',
);
const preloadSource = fs.readFileSync(new URL('../../../src/preload/preload.ts', import.meta.url), 'utf8');
const mainSource = fs.readFileSync(new URL('../../../src/main/main.ts', import.meta.url), 'utf8');
const localRemoteSource = fs.readFileSync(new URL('../../../src/main/local-remote.ts', import.meta.url), 'utf8');

test('desktop remote control is opened from the first top-bar action', () => {
  assert.match(topBarSource, /className="topbar-actions"[\s\S]*aria-label="Remote Control"/);
  assert.match(topBarSource, /<RemoteControlDialog/);
});

test('remote control uses the desktop bridge for QR pairing and device access', () => {
  assert.match(dialogSource, /QRCode\.toDataURL\(nextPairing\.pairing_uri/);
  assert.match(dialogSource, /window\.haish\.startRemotePairing\(\)/);
  assert.match(dialogSource, /window\.haish\.revokeRemoteDevice\(device\.device_id\)/);
  assert.match(preloadSource, /remote-control:start-pairing/);
  assert.match(preloadSource, /remote-control:list-devices/);
  assert.match(preloadSource, /remote-control:revoke-device/);
  // The desktop app hosts the adapter: the origin lives in local-remote.ts and
  // main.ts must reach the adapter through ensureRemoteAdapter().
  assert.match(localRemoteSource, /REMOTE_ADAPTER_PORT = 8766/);
  assert.match(localRemoteSource, /\/remote\/status/);
  assert.match(mainSource, /remoteAdapterOrigin\(\)/);
});

test('remote control configures and surfaces the hosted adapter', () => {
  assert.match(dialogSource, /window\.haish\.saveRemoteSettings\(/);
  // The panel stays quiet while the hosted adapter works and only speaks up with
  // a plain-language notice (plus the real error text) when it cannot.
  assert.match(dialogSource, /remote-access-notice/);
  assert.doesNotMatch(dialogSource, /remote-status-strip/);
  assert.match(dialogSource, /Remote access is offline/);
  assert.match(preloadSource, /remote-control:save-settings/);
  assert.match(mainSource, /ensureRemoteAdapter\(runtimePaths\(\)\)/);
  assert.match(mainSource, /stopRemoteAdapter\(\)/);
});

test('remote pairing and revoke actions use in-app feedback', () => {
  assert.match(dialogSource, /paired successfully/);
  assert.match(dialogSource, /role="alertdialog"/);
  assert.doesNotMatch(dialogSource, /window\.confirm/);
});
