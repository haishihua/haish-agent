import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  MoreVertical,
  RefreshCw,
  Settings2,
  Smartphone,
  TriangleAlert,
  X,
} from 'lucide-react';
import QRCode from 'qrcode';
import { ErrorState } from '../../../shared/ui/agent-elements/ErrorState.jsx';
import { prefersReducedMotion } from '../../../shared/lib/reduced-motion.js';

function formatLastSeen(timestamp) {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - Number(timestamp || 0)));
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} hr ago`;
  const days = Math.floor(seconds / 86_400);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function settingsToDraft(settings) {
  return {
    serverAddr: settings?.serverAddr || '',
    serverPort: String(settings?.serverPort || 7000),
    remotePort: String(settings?.remotePort || 18766),
    publicEndpoint: settings?.publicEndpoint || '',
    token: settings?.token || '',
  };
}

// A restart or a reconnect usually finishes within a couple of seconds, so the
// panel waits out a short grace period before telling the user that remote
// access is down — a self-healing blip must never flash a scary banner.
const FAILURE_GRACE_MS = 6_000;

// Internal errors talk about the remote "adapter"; users know it as the remote
// service. The raw text stays available in tooltips.
function humanizeRemoteError(message) {
  return String(message || '').replace(/remote adapter/gi, 'remote service');
}

export function RemoteControlDialog({ onClose }) {
  const [pairing, setPairing] = useState(null);
  const [qrImage, setQrImage] = useState('');
  const [devices, setDevices] = useState([]);
  const [expiresAt, setExpiresAt] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [adapterState, setAdapterState] = useState(null);
  const [settings, setSettings] = useState(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(settingsToDraft(null));
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [deviceNotice, setDeviceNotice] = useState(null);
  const [deviceToRevoke, setDeviceToRevoke] = useState(null);
  const [revoking, setRevoking] = useState(false);
  const [failureSince, setFailureSince] = useState(0);
  const [closing, setClosing] = useState(false);
  const knownDeviceIdsRef = useRef(null);
  const closeTimerRef = useRef(0);

  // Closing is a transition, not a jump cut: the panel fades out in 140ms (the
  // entrance takes 200ms) before it unmounts. Reduced motion skips straight out.
  const requestClose = useCallback(() => {
    if (closing) return;
    if (prefersReducedMotion()) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimerRef.current = window.setTimeout(onClose, 140);
  }, [closing, onClose]);

  useEffect(() => () => window.clearTimeout(closeTimerRef.current), []);

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await window.haish?.getRemoteStatus?.();
      if (nextStatus) setAdapterState(nextStatus);
    } catch {
      // Keep the last snapshot; the panel shows the adapter's own message.
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    const nextDevices = await window.haish?.listRemoteDevices?.();
    if (!nextDevices) return;
    const nextIds = new Set(nextDevices.map((device) => device.device_id));
    const knownIds = knownDeviceIdsRef.current;
    const newlyPaired = knownIds ? nextDevices.find((device) => !knownIds.has(device.device_id)) : null;
    knownDeviceIdsRef.current = nextIds;
    setDevices(nextDevices);
    if (newlyPaired) {
      setDeviceNotice({ kind: 'success', text: `${newlyPaired.name || 'Phone'} paired successfully` });
    }
  }, []);

  const startPairing = useCallback(async () => {
    if (!settings) return;
    setBusy(true);
    setError('');
    try {
      if (!window.haish?.startRemotePairing)
        throw new Error('Remote Control is only available in the Haish desktop app.');
      const nextPairing = await window.haish.startRemotePairing();
      if (!nextPairing?.pairing_uri) throw new Error('Pairing is unavailable. Check the remote service and try again.');
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
      setError(humanizeRemoteError(nextError?.message || nextError));
    } finally {
      setBusy(false);
    }
  }, [refreshDevices, settings]);

  const notConfigured = settingsLoaded && !settings;
  const tunnel = adapterState?.tunnel || null;
  const adapterFailed = adapterState?.status === 'failed';
  const tunnelFailed =
    Boolean(settings) && !adapterFailed && Boolean(tunnel) && !tunnel.running && Boolean(tunnel.last_error);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const [nextSettings, nextStatus] = await Promise.all([
          window.haish?.getRemoteSettings?.(),
          window.haish?.getRemoteStatus?.(),
        ]);
        if (cancelled) return;
        setSettings(nextSettings ?? null);
        setSettingsDraft(settingsToDraft(nextSettings ?? null));
        if (nextStatus) setAdapterState(nextStatus);
        if (!nextSettings) {
          setSettingsOpen(true);
          setBusy(false);
        }
      } catch (bootstrapError) {
        if (!cancelled) setError(String(bootstrapError?.message || bootstrapError));
      } finally {
        if (!cancelled) setSettingsLoaded(true);
      }
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (settings) startPairing();
    else setBusy(false);
  }, [settings, settingsLoaded, startPairing]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      refreshDevices().catch(() => undefined);
      refreshStatus();
    }, 3000);
    return () => window.clearInterval(poll);
  }, [refreshDevices, refreshStatus]);

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
      else if (settingsOpen && settings) setSettingsOpen(false);
      else requestClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deviceToRevoke, requestClose, settings, settingsOpen]);

  useEffect(() => {
    if (!deviceNotice) return undefined;
    const timer = window.setTimeout(() => setDeviceNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [deviceNotice]);

  // Track how long remote access has been failing; the notice only appears once
  // the failure outlives the grace period above.
  useEffect(() => {
    if (!adapterFailed && !tunnelFailed) {
      setFailureSince(0);
      return;
    }
    setFailureSince((previous) => previous || Date.now());
  }, [adapterFailed, tunnelFailed]);

  function openSettings() {
    setSettingsDraft(settingsToDraft(settings));
    setSettingsError('');
    setSettingsOpen(true);
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSavingSettings(true);
    setSettingsError('');
    try {
      const saved = await window.haish.saveRemoteSettings({
        serverAddr: settingsDraft.serverAddr.trim(),
        serverPort: Number(settingsDraft.serverPort),
        remotePort: Number(settingsDraft.remotePort),
        publicEndpoint: settingsDraft.publicEndpoint.trim(),
        token: settingsDraft.token.trim(),
      });
      setSettings(saved);
      setAdapterState(saved);
      setSettingsOpen(false);
      refreshStatus();
    } catch (nextError) {
      setSettingsError(String(nextError?.message || nextError));
    } finally {
      setSavingSettings(false);
    }
  }

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

  // Users never configure the local service themselves, so the panel stays quiet
  // while everything works and only speaks up when the phone cannot reach this Mac.
  const failureStuck = failureSince > 0 && Date.now() - failureSince >= FAILURE_GRACE_MS;
  const connecting =
    Boolean(settings) &&
    !adapterFailed &&
    !tunnelFailed &&
    Boolean(adapterState) &&
    (adapterState.status === 'starting' || (tunnel ? !tunnel.running : false));
  let accessNotice = null;
  if (adapterFailed && failureStuck) {
    // Haish restarts the remote service on its own; the raw exit reason stays in
    // the tooltip instead of being shouted at the user.
    accessNotice = {
      tone: 'pending',
      title: 'Reconnecting…',
      detail: 'Remote access stopped unexpectedly. Haish is restarting it automatically.',
      raw: adapterState.message || '',
      canRetry: true,
    };
  } else if (tunnelFailed && failureStuck) {
    accessNotice = {
      tone: 'error',
      title: 'Remote access is offline',
      detail: tunnel.last_error,
      raw: tunnel.last_error,
      canRetry: true,
    };
  } else if (connecting) {
    accessNotice = {
      tone: 'pending',
      title: 'Connecting…',
      detail: 'Publishing this Mac through your server.',
      canRetry: false,
    };
  }

  return createPortal(
    <div
      className={`remote-control-backdrop${closing ? ' closing' : ''}`}
      role="presentation"
      onMouseDown={requestClose}
    >
      <section
        className="remote-control-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remote-control-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="remote-control-header">
          <div className="remote-control-heading">
            <h2 id="remote-control-title">Remote Control</h2>
          </div>
          <button
            type="button"
            className="remote-control-close"
            aria-label="Close Remote Control"
            onClick={requestClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>

        {settingsOpen ? (
          <form className="remote-settings-panel" onSubmit={saveSettings}>
            <div className="remote-settings-heading">
              <h3>Remote server</h3>
              <p>Publish this Mac through your frps server. The token stays on this Mac.</p>
            </div>
            <div className="remote-settings-grid">
              <label className="wide">
                <span>Server address</span>
                <input
                  value={settingsDraft.serverAddr}
                  onChange={(event) => setSettingsDraft({ ...settingsDraft, serverAddr: event.target.value })}
                  placeholder="203.0.113.9"
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </label>
              <label>
                <span>Server port</span>
                <input
                  value={settingsDraft.serverPort}
                  onChange={(event) => setSettingsDraft({ ...settingsDraft, serverPort: event.target.value })}
                  inputMode="numeric"
                  placeholder="7000"
                  autoComplete="off"
                />
              </label>
              <label>
                <span>Public port</span>
                <input
                  value={settingsDraft.remotePort}
                  onChange={(event) => setSettingsDraft({ ...settingsDraft, remotePort: event.target.value })}
                  inputMode="numeric"
                  placeholder="18766"
                  autoComplete="off"
                />
              </label>
              <label className="wide">
                <span>Public address</span>
                <input
                  value={settingsDraft.publicEndpoint}
                  onChange={(event) => setSettingsDraft({ ...settingsDraft, publicEndpoint: event.target.value })}
                  placeholder="https://203.0.113.9"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="wide">
                <span>Auth token</span>
                <input
                  type="password"
                  value={settingsDraft.token}
                  onChange={(event) => setSettingsDraft({ ...settingsDraft, token: event.target.value })}
                  placeholder="frps auth token"
                  autoComplete="off"
                />
              </label>
            </div>
            {settingsError ? <ErrorState variant="inline" detail={settingsError} /> : null}
            <div className="remote-settings-actions">
              {settings ? (
                <button type="button" onClick={() => setSettingsOpen(false)} disabled={savingSettings}>
                  Cancel
                </button>
              ) : null}
              <button type="submit" className="primary" disabled={savingSettings}>
                {savingSettings ? 'Saving…' : 'Save and connect'}
              </button>
            </div>
          </form>
        ) : (
          <div className="remote-control-content">
            <section className="remote-pairing-panel" aria-label="Phone pairing">
              <div className="remote-section-heading">
                <h3>Scan with Haish mobile</h3>
              </div>
              {accessNotice ? (
                <div
                  className={`remote-access-notice ${accessNotice.tone}`}
                  role="status"
                  title={accessNotice.raw || undefined}
                >
                  <span className="remote-access-notice-icon" aria-hidden="true">
                    {accessNotice.tone === 'error' ? <TriangleAlert /> : <LoaderCircle />}
                  </span>
                  <div className="remote-access-notice-text">
                    <strong>{accessNotice.title}</strong>
                    <span className="remote-access-notice-detail">{accessNotice.detail}</span>
                  </div>
                  {accessNotice.canRetry ? (
                    <button type="button" onClick={startPairing} disabled={busy}>
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
              <div className={`remote-qr-frame ${secondsLeft === 0 && pairing ? 'expired' : ''}`}>
                {qrImage ? <img src={qrImage} alt="Haish phone pairing QR code" /> : null}
                {busy ? <div className="remote-qr-state">Creating secure code…</div> : null}
                {!busy && notConfigured ? (
                  <div className="remote-qr-state">
                    <strong>Set up the remote server</strong>
                    <span>Enter the server address and token to publish this Mac.</span>
                    <button type="button" onClick={openSettings}>
                      Configure
                    </button>
                  </div>
                ) : null}
                {!busy && !notConfigured && error ? (
                  <div className="remote-qr-state error">
                    <strong>Connection unavailable</strong>
                    <span>{error}</span>
                  </div>
                ) : null}
                {!busy && !notConfigured && !error && pairing && secondsLeft === 0 ? (
                  <div className="remote-qr-state">
                    <strong>Code expired</strong>
                    <button type="button" onClick={startPairing}>
                      Create a new code
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="remote-pairing-meta" aria-live="polite">
                <span className={`remote-pairing-expiry ${secondsLeft > 0 && secondsLeft <= 60 ? 'urgent' : ''}`}>
                  <Clock3 aria-hidden="true" />
                  {secondsLeft > 0
                    ? `Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`
                    : pairing
                      ? 'Expired'
                      : notConfigured
                        ? 'Not configured'
                        : 'Waiting for service'}
                </span>
                <button
                  type="button"
                  className="remote-refresh-button"
                  onClick={startPairing}
                  disabled={busy || notConfigured}
                >
                  <RefreshCw aria-hidden="true" /> Refresh QR
                </button>
              </div>
            </section>

            <section className="remote-devices-panel" aria-labelledby="remote-devices-title">
              <div className="remote-devices-heading">
                <h3 id="remote-devices-title">Paired devices</h3>
                {devices.length ? <span className="remote-devices-count">{devices.length}</span> : null}
              </div>
              {deviceNotice ? (
                <div className={`remote-device-notice ${deviceNotice.kind}`} role="status">
                  {deviceNotice.kind === 'error' ? (
                    <TriangleAlert aria-hidden="true" />
                  ) : (
                    <CheckCircle2 aria-hidden="true" />
                  )}
                  <span>{deviceNotice.text}</span>
                </div>
              ) : null}
              <div className="remote-device-list">
                {devices.length ? (
                  devices.map((device) => (
                    <article className="remote-device-row" key={device.device_id}>
                      <div>
                        <strong>{device.name}</strong>
                        <span>Last seen {formatLastSeen(device.last_seen_at)}</span>
                      </div>
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
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        <footer className="remote-security-note">
          <span className="remote-note-text">
            <LockKeyhole aria-hidden="true" />
            Paired devices only.
          </span>
          {settings && !settingsOpen ? (
            <button type="button" className="remote-settings-link" onClick={openSettings}>
              <Settings2 aria-hidden="true" />
              Server settings
            </button>
          ) : null}
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
              <h3 id="remote-revoke-title">Remove remote access?</h3>
              <p id="remote-revoke-message">{deviceToRevoke.name} will need to scan the QR code again to reconnect.</p>
              <div className="remote-confirm-actions">
                <button type="button" onClick={() => setDeviceToRevoke(null)} disabled={revoking} autoFocus>
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={() => revokeDevice(deviceToRevoke)}
                  disabled={revoking}
                >
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
