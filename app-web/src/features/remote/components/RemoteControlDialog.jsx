import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Clock3, LockKeyhole, MoreVertical, RefreshCw, Smartphone, Unplug, X } from 'lucide-react';
import QRCode from 'qrcode';

function formatLastSeen(timestamp) {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - Number(timestamp || 0)));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86_400)} days ago`;
}

export function RemoteControlDialog({ onClose }) {
  const [pairing, setPairing] = useState(null);
  const [qrImage, setQrImage] = useState('');
  const [devices, setDevices] = useState([]);
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [deviceNotice, setDeviceNotice] = useState(null);
  const [deviceToRevoke, setDeviceToRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const knownDeviceIdsRef = useRef(null);

  const refreshDevices = useCallback(async () => {
    const nextDevices = await window.haish?.listRemoteDevices?.();
    if (!nextDevices) return;
    const nextIds = new Set(nextDevices.map((device) => device.device_id));
    const knownIds = knownDeviceIdsRef.current;
    const newlyPaired = knownIds
      ? nextDevices.find((device) => !knownIds.has(device.device_id))
      : null;
    knownDeviceIdsRef.current = nextIds;
    setDevices(nextDevices);
    if (newlyPaired) {
      setDeviceNotice({ kind: 'success', text: `${newlyPaired.name || 'Phone'} paired successfully` });
    }
  }, []);

  const startPairing = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      if (!window.haish?.startRemotePairing)
        throw new Error('Remote Control is only available in the Haish desktop app.');
      const nextPairing = await window.haish.startRemotePairing();
      if (!nextPairing?.pairing_uri) throw new Error('Restart the Haish Remote service to enable QR pairing.');
      const image = await QRCode.toDataURL(nextPairing.pairing_uri, {
        width: 256,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#11131a', light: '#ffffff' },
      });
      setPairing(nextPairing);
      setQrImage(image);
      setExpiresAt(Date.now() + nextPairing.expires_in * 1000);
      await refreshDevices();
    } catch (nextError) {
      setError(String(nextError?.message || nextError));
    } finally {
      setBusy(false);
    }
  }, [refreshDevices]);

  useEffect(() => {
    startPairing();
    const devicePoll = window.setInterval(() => refreshDevices().catch(() => undefined), 3000);
    return () => window.clearInterval(devicePoll);
  }, [refreshDevices, startPairing]);

  useEffect(() => {
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (deviceToRevoke) setDeviceToRevoke(null);
      else onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deviceToRevoke, onClose]);

  useEffect(() => {
    if (!deviceNotice) return undefined;
    const timer = window.setTimeout(() => setDeviceNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [deviceNotice]);

  async function revokeDevice(device) {
    setRevoking(true);
    try {
      await window.haish.revokeRemoteDevice(device.device_id);
      await refreshDevices();
      setDeviceNotice({ kind: 'success', text: `${device.name} access removed` });
      setDeviceToRevoke(null);
    } catch (nextError) {
      setDeviceNotice({ kind: 'error', text: String(nextError?.message || nextError) });
    } finally {
      setRevoking(false);
    }
  }

  return createPortal(
    <div className="remote-control-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="remote-control-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remote-control-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="remote-control-header">
          <div className="remote-control-heading">
            <span className="remote-control-heading-icon" aria-hidden="true">
              <Smartphone />
            </span>
            <div>
              <h2 id="remote-control-title">Remote Control</h2>
              <p>Control this Mac from your phone.</p>
            </div>
          </div>
          <button type="button" className="remote-control-close" aria-label="Close Remote Control" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="remote-control-content">
          <section className="remote-pairing-panel" aria-label="Phone pairing">
            <div className="remote-section-heading">
              <h3>Scan with Haish mobile</h3>
            </div>
            <div className={`remote-qr-frame ${secondsLeft === 0 && pairing ? 'expired' : ''}`}>
              {qrImage ? <img src={qrImage} alt="Haish phone pairing QR code" /> : null}
              {busy ? <div className="remote-qr-state">Creating secure code…</div> : null}
              {error ? (
                <div className="remote-qr-state error">
                  <strong>Connection unavailable</strong>
                  <span>{error}</span>
                </div>
              ) : null}
              {!busy && pairing && secondsLeft === 0 ? (
                <div className="remote-qr-state">
                  <strong>Code expired</strong>
                  <button type="button" onClick={startPairing}>
                    Create a new code
                  </button>
                </div>
              ) : null}
            </div>
            <div className="remote-pairing-meta" aria-live="polite">
              <span className="remote-pairing-expiry">
                <Clock3 aria-hidden="true" />
                {secondsLeft > 0
                  ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                  : pairing
                    ? 'Expired'
                    : 'Waiting for service'}
              </span>
            </div>
            <button type="button" className="remote-refresh-button" onClick={startPairing} disabled={busy}>
              <RefreshCw aria-hidden="true" /> Refresh QR
            </button>
          </section>

          <section className="remote-devices-panel" aria-labelledby="remote-devices-title">
            <div className="remote-devices-heading">
              <h3 id="remote-devices-title">Paired devices</h3>
            </div>
            {deviceNotice ? (
              <div className={`remote-device-notice ${deviceNotice.kind}`} role="status">
                <CheckCircle2 aria-hidden="true" />
                <span>{deviceNotice.text}</span>
              </div>
            ) : null}
            <div className="remote-device-list">
              {devices.length ? (
                devices.map((device) => (
                  <article className="remote-device-row" key={device.device_id}>
                    <span className="remote-device-icon">
                      <Smartphone aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{device.name}</strong>
                      <span>Last seen {formatLastSeen(device.last_seen_at)}</span>
                    </div>
                    <span className="remote-device-online" aria-label="Paired device" />
                    <button
                      type="button"
                      onClick={() => setDeviceToRevoke(device)}
                      aria-label={`Revoke access for ${device.name}`}
                      title="Revoke access"
                    >
                      <MoreVertical aria-hidden="true" />
                    </button>
                  </article>
                ))
              ) : (
                <div className="remote-device-empty">
                  <Smartphone aria-hidden="true" />
                  <strong>No paired phones yet</strong>
                  <span>Your phone appears here after scanning the QR code.</span>
                </div>
              )}
            </div>
          </section>
        </div>
        <footer className="remote-security-note">
          <LockKeyhole aria-hidden="true" />
          <span>Only paired devices can access this Mac.</span>
        </footer>
        {deviceToRevoke ? (
          <div className="remote-confirm-backdrop" role="presentation" onMouseDown={() => setDeviceToRevoke(null)}>
            <div
              className="remote-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="remote-revoke-title"
              aria-describedby="remote-revoke-message"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <span className="remote-confirm-icon" aria-hidden="true"><Unplug /></span>
              <h3 id="remote-revoke-title">Remove remote access?</h3>
              <p id="remote-revoke-message">
                {deviceToRevoke.name} will need to scan the QR code again to reconnect.
              </p>
              <div className="remote-confirm-actions">
                <button type="button" onClick={() => setDeviceToRevoke(null)} disabled={revoking} autoFocus>
                  Cancel
                </button>
                <button type="button" className="danger" onClick={() => revokeDevice(deviceToRevoke)} disabled={revoking}>
                  {revoking ? 'Removing…' : 'Remove access'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
