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
  assert.match(mainSource, /REMOTE_ADAPTER_ORIGIN = 'http:\/\/127\.0\.0\.1:8766'/);
});

test('remote pairing and revoke actions use in-app feedback', () => {
  assert.match(dialogSource, /paired successfully/);
  assert.match(dialogSource, /role="alertdialog"/);
  assert.doesNotMatch(dialogSource, /window\.confirm/);
});
