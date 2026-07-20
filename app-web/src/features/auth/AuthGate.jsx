// @haish-esm
import React from 'react';
import { AuthScreen } from './AuthScreen.jsx';
import {
  authMemorySession,
  fetchCurrentAuthUser,
  loginWithPassword,
  registerNewAccount,
  clearAuthSession,
  logoutCurrentSession,
} from '../../api/auth.js';
import { AppShell as App } from '../app/AppShell.jsx';

const { useState, useEffect } = React;

export function AuthGate() {
  const [session, setSession] = useState(() => authMemorySession);
  const [mode, setMode] = useState('login');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [errorKey, setErrorKey] = useState(0);
  const [postAuthToast, setPostAuthToast] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const markSignedOut = (message = '') => {
      if (cancelled) return;
      setSession(null);
      if (message) setError(message);
    };
    const handleExpired = () => markSignedOut('Session expired. Sign in again.');

    window.addEventListener('haish-auth-expired', handleExpired);
    (async () => {
      if (!authMemorySession?.accessToken && !authMemorySession?.refreshToken) {
        markSignedOut();
        return;
      }
      try {
        const user = await fetchCurrentAuthUser();
        if (cancelled) return;
        setSession({ ...authMemorySession, user });
        setError('');
      } catch (authError) {
        clearAuthSession({ notify: false });
        markSignedOut('Please sign in to continue.');
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('haish-auth-expired', handleExpired);
    };
  }, []);

  const handleSubmit = async (formData) => {
    setSubmitting(true);
    setError('');
    try {
      let nextSession;
      if (formData.mode === 'register') {
        nextSession = await registerNewAccount({
          userName: formData.userName,
          email: formData.email,
          password: formData.password,
        }, true);
      } else {
        nextSession = await loginWithPassword(formData.account, formData.password, formData.remember);
        setPostAuthToast({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          kind: 'success',
          message: 'Login successful',
        });
      }
      setSession(nextSession);
      setMode('login');
    } catch (authError) {
      const message = String(authError?.message || authError);
      setError(
        formData.mode === 'login' && /invalid account or password/i.test(message)
          ? 'Incorrect account or password. Try again.'
          : message,
      );
      setErrorKey((current) => current + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await logoutCurrentSession();
    setSession(null);
    setMode('login');
    setError('');
  };

  if (!session?.accessToken) {
    return (
      <AuthScreen
        mode={mode}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          setError('');
        }}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        errorKey={errorKey}
      />
    );
  }
  return <App authUser={session.user} onLogout={handleLogout} initialToast={postAuthToast} />;
}

