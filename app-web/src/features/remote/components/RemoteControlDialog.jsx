import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';

function formatLastSeen(timestamp) {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - Number(timestamp || 0)));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hr ago`;
  return `${Math.floor(seconds / 86_400)} days ago`;
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M6.1 9a7 7 0 0 1 11.5-2.6L20 9M4 15l2.4 2.6A7 7 0 0 0 17.9 15" />
    </svg>
  );
}

export function RemoteControlDialog({ onClose }) {
  const [pairing, setPairing] = useState(null);
  const [qrImage, setQrImage] = useState('');
  const [devices, setDevices] = useState([]);
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  const refreshDevices = useCallback(async () => {
    const nextDevices = await window.haish?.listRemoteDevices?.();
    if (nextDevices) setDevices(nextDevices);
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
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function revokeDevice(device) {
    if (!window.confirm(`Revoke remote access for ${device.name}?`)) return;
    try {
      await window.haish.revokeRemoteDevice(device.device_id);
      await refreshDevices();
    } catch (nextError) {
      setError(String(nextError?.message || nextError));
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
              <PhoneIcon />
            </span>
            <div>
              <h2 id="remote-control-title">Remote Control</h2>
              <p>Pair once, then control this Mac from your phone anywhere.</p>
            </div>
          </div>
          <button type="button" className="remote-control-close" aria-label="Close Remote Control" onClick={onClose}>
            ×
          </button>
        </header>

        <div className="remote-control-content">
          <section className="remote-pairing-panel" aria-label="Phone pairing">
            <div className="remote-section-heading">
              <span className="remote-step">1</span>
              <div>
                <h3>Scan with Haish mobile</h3>
                <p>Open Haish on your iPhone and scan this code.</p>
              </div>
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
              <span className="remote-pairing-code">
                {pairing ? `Code ${pairing.code.slice(0, 4)} ${pairing.code.slice(4)}` : 'Waiting for service'}
              </span>
              <span className="remote-pairing-expiry">
                {secondsLeft > 0
                  ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                  : 'Expired'}
              </span>
            </div>
            <button type="button" className="remote-refresh-button" onClick={startPairing} disabled={busy}>
              <RefreshIcon /> Refresh QR code
            </button>
          </section>

          <section className="remote-devices-panel" aria-labelledby="remote-devices-title">
            <div className="remote-devices-heading">
              <div>
                <h3 id="remote-devices-title">Paired devices</h3>
                <p>Phones allowed to control this Mac.</p>
              </div>
              <span className="remote-device-count">{devices.length} connected</span>
            </div>
            <div className="remote-device-list">
              {devices.length ? (
                devices.map((device) => (
                  <article className="remote-device-row" key={device.device_id}>
                    <span className="remote-device-icon">
                      <PhoneIcon />
                    </span>
                    <div>
                      <strong>{device.name}</strong>
                      <span>Last seen {formatLastSeen(device.last_seen_at)}</span>
                    </div>
                    <button type="button" onClick={() => revokeDevice(device)}>
                      Revoke
                    </button>
                  </article>
                ))
              ) : (
                <div className="remote-device-empty">
                  <PhoneIcon />
                  <strong>No paired phones yet</strong>
                  <span>Your phone appears here after scanning the QR code.</span>
                </div>
              )}
            </div>
            <div className="remote-security-note">
              <span aria-hidden="true">✓</span>
              <p>
                <strong>Private by default</strong>
                Only devices listed above can access this Haish Runtime.
              </p>
            </div>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
}
