// @haish-esm
import React from 'react';
const { useState, useEffect, useRef } = React;

export function AuthScreen({ mode, onModeChange, onSubmit, submitting = false, error = '', errorKey = 0 }) {
  const [account, setAccount] = useState('');
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [localError, setLocalError] = useState('');
  const [localErrorKey, setLocalErrorKey] = useState(0);
  const [authToast, setAuthToast] = useState(null);
  const [touchedFields, setTouchedFields] = useState({
    userName: false,
    password: false,
  });
  const isRegister = mode === 'register';
  const primaryLabel = isRegister ? 'Create account' : 'Sign in';
  const secondaryLabel = isRegister ? 'Sign in' : 'Create account';

  const clearLocalValidation = () => {
    setLocalError('');
    setAuthToast(null);
  };

  const markFieldTouched = (field) => {
    setTouchedFields((current) => ({ ...current, [field]: true }));
  };

  const userNameError = isRegister && touchedFields.userName && userName.trim() && userName.trim().length < 3
    ? 'User name must be at least 3 characters.'
    : '';
  const passwordError = isRegister && touchedFields.password && password && password.length < 8
    ? 'Password must be at least 8 characters.'
    : '';

  const renderPasswordToggle = (visible, onToggle, label) => (
    <button
      type="button"
      className="auth-password-toggle"
      onClick={onToggle}
      aria-label={visible ? `Hide ${label}` : `Show ${label}`}
      aria-pressed={visible}
      disabled={submitting}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {visible ? (
          <>
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.9 4.4A10.7 10.7 0 0 1 12 4c6.5 0 10 8 10 8a18.7 18.7 0 0 1-3.1 4.4" />
            <path d="M6.5 6.5C3.6 8.5 2 12 2 12s3.5 8 10 8a10.7 10.7 0 0 0 4.3-.9" />
          </>
        ) : (
          <>
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
  );

  useEffect(() => {
    const message = localError || error;
    if (!message) {
      setAuthToast(null);
      return undefined;
    }
    const nextToast = {
      id: `${errorKey}-${localErrorKey}-${Date.now()}`,
      message,
    };
    setAuthToast(nextToast);
    const timer = setTimeout(() => {
      setAuthToast((current) => (current?.id === nextToast.id ? null : current));
    }, 3200);
    return () => clearTimeout(timer);
  }, [localError, error, errorKey, localErrorKey]);

  const submit = (event) => {
    event.preventDefault();
    clearLocalValidation();
    if (isRegister) {
      const missingRegisterFields = {
        userName: !userName.trim(),
        email: !email.trim(),
        password: !password,
        confirmPassword: !confirmPassword,
        terms: !agreedToTerms,
      };
      if (Object.values(missingRegisterFields).some(Boolean)) {
        setLocalError('Please complete all required fields.');
        setLocalErrorKey((current) => current + 1);
        return;
      }
      const nextUserNameError = userName.trim().length < 3;
      const nextPasswordError = password.length < 8;
      if (nextUserNameError || nextPasswordError) {
        setTouchedFields((current) => ({
          ...current,
          userName: true,
          password: true,
        }));
        setLocalError('Please fix the highlighted fields.');
        setLocalErrorKey((current) => current + 1);
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("Passwords don't match.");
        setLocalErrorKey((current) => current + 1);
        return;
      }
      onSubmit({
        mode,
        userName: userName.trim(),
        email: email.trim(),
        password,
      });
    } else {
      const missingLoginFields = {
        account: !account.trim(),
        password: !password,
      };
      if (missingLoginFields.account || missingLoginFields.password) {
        const message = missingLoginFields.account && missingLoginFields.password
          ? 'Enter your account and password to sign in.'
          : missingLoginFields.account
            ? 'Enter your account or email to sign in.'
            : 'Enter your password to sign in.';
        setLocalError(message);
        setLocalErrorKey((current) => current + 1);
        return;
      }
      onSubmit({
        mode,
        account: account.trim(),
        password,
        remember,
      });
    }
  };

  const displayError = authToast?.message || '';

  return (
    <div className={`auth-shell auth-shell-${mode}`}>
      <div className="app-topbar auth-topbar" aria-hidden="true">
        <div className="topbar-brand">
          <img className="topbar-logo" src="assets/ui/penguin_logo_user.png" alt="" draggable={false} />
          <div className="topbar-title">Haish Agent</div>
        </div>
      </div>
      <div className="auth-hero">
        <div className="auth-hero-copy">
          <span>Your AI work assistant</span>
          <h1>The More It Works,<br />the Smarter It Gets.</h1>
          <p>Your agent learns from every interaction and continuously improves for you.</p>
        </div>
        <img className="auth-hero-image" src="assets/auth/login-hero.png?v=2" alt="" aria-hidden="true" draggable={false} />
      </div>

      <section className={displayError ? 'auth-card auth-card--shake' : 'auth-card'} key={displayError ? `auth-card-${errorKey}-${localErrorKey}-${displayError}` : 'auth-card'} aria-label="Account authentication">
        <div className="auth-card-head">
          <h2>{isRegister ? 'Create account' : 'Welcome back'}</h2>
          <p>{isRegister ? 'Set up your account and get started.' : 'Sign in to continue to your workspace.'}</p>
        </div>
        {isRegister ? null : (
          <div className="auth-tabs" role="tablist" aria-label="Sign in method">
            <button type="button" className="active" role="tab" aria-selected="true">Account login</button>
          </div>
        )}

        <form className="auth-form" onSubmit={submit} noValidate>
          {isRegister ? (
            <>
              <label className={`auth-field auth-field--user${userNameError ? ' auth-field--invalid' : ''}`}>
                <span>User name</span>
                <input
                  value={userName}
                  onChange={(event) => {
                    setUserName(event.target.value);
                    clearLocalValidation();
                  }}
                  onBlur={() => markFieldTouched('userName')}
                  aria-invalid={Boolean(userNameError)}
                  aria-describedby={userNameError ? 'auth-user-name-error' : undefined}
                  placeholder="Enter your user name"
                  autoComplete="username"
                  disabled={submitting}
                  required
                />
                {userNameError ? <span className="auth-field-error" id="auth-user-name-error">{userNameError}</span> : null}
              </label>

              <label className="auth-field auth-field--mail">
                <span>Email</span>
                <input
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    clearLocalValidation();
                  }}
                  placeholder="name@company.com"
                  type="email"
                  autoComplete="email"
                  disabled={submitting}
                  required
                />
              </label>

              <label className={`auth-field auth-field--lock${passwordError ? ' auth-field--invalid' : ''}`}>
                <span>Password</span>
                <input
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearLocalValidation();
                  }}
                  onBlur={() => markFieldTouched('password')}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? 'auth-password-error' : undefined}
                  placeholder="Enter your password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  disabled={submitting}
                  required
                />
                {renderPasswordToggle(showPassword, () => setShowPassword((current) => !current), 'password')}
                {passwordError ? <span className="auth-field-error" id="auth-password-error">{passwordError}</span> : null}
              </label>

              <label className="auth-field auth-field--lock">
                <span>Confirm password</span>
                <input
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value);
                    clearLocalValidation();
                  }}
                  placeholder="Confirm your password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={8}
                  disabled={submitting}
                  required
                />
                {renderPasswordToggle(showConfirmPassword, () => setShowConfirmPassword((current) => !current), 'confirm password')}
              </label>

              <label className="auth-terms">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(event) => {
                    setAgreedToTerms(event.target.checked);
                    clearLocalValidation();
                  }}
                  disabled={submitting}
                  required
                />
                <span>
                  I agree to the <a href="#" onClick={(e) => e.preventDefault()}>Terms</a> and <a href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>
                </span>
              </label>
            </>
          ) : (
            <>
              <label className="auth-field auth-field--mail">
                <span>Account / Email</span>
                <input
                  value={account}
                  onChange={(event) => {
                    setAccount(event.target.value);
                    clearLocalValidation();
                  }}
                  placeholder="name@company.com"
                  autoComplete="username"
                  disabled={submitting}
                  required
                />
              </label>

              <label className="auth-field auth-field--lock">
                <span>Password</span>
                <input
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearLocalValidation();
                  }}
                  placeholder="Enter password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  minLength={1}
                  disabled={submitting}
                  required
                />
                {renderPasswordToggle(showPassword, () => setShowPassword((current) => !current), 'password')}
              </label>

              <div className="auth-row">
                <label className="auth-remember">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(event) => setRemember(event.target.checked)}
                    disabled={submitting}
                  />
                  <span>Remember me</span>
                </label>
                <button type="button" className="auth-link" disabled>Forgot password?</button>
              </div>
            </>
          )}

          <button type="submit" className="auth-primary" disabled={submitting}>
            {submitting ? (
              <>
                <span>{isRegister ? 'Creating account...' : 'Signing in...'}</span>
                <span className="auth-loading-icon" aria-hidden="true" />
              </>
            ) : primaryLabel}
          </button>

          <div className="auth-mode-switch">
            <span>{isRegister ? 'Already have an account?' : "Don't have an account?"}</span>
            <button
              type="button"
              onClick={() => onModeChange(isRegister ? 'login' : 'register')}
              disabled={submitting}
            >
              {secondaryLabel}
            </button>
          </div>
        </form>

        <div className="auth-divider"><span>Or continue with</span></div>
        <div className="auth-socials">
          <button type="button" disabled>
            <svg className="auth-social-icon auth-social-github" viewBox="0 0 98 96" aria-hidden="true">
              <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d="M48.85 0C21.88 0 0 22.28 0 49.76c0 21.98 14 40.62 33.43 47.2 2.44.45 3.34-1.08 3.34-2.39 0-1.18-.04-4.3-.07-8.44-13.6 3.01-16.47-6.68-16.47-6.68-2.22-5.75-5.43-7.28-5.43-7.28-4.44-3.09.34-3.03.34-3.03 4.9.35 7.49 5.13 7.49 5.13 4.36 7.61 11.43 5.41 14.21 4.14.44-3.22 1.7-5.41 3.1-6.65-10.86-1.26-22.28-5.53-22.28-24.62 0-5.44 1.91-9.88 5.03-13.36-.5-1.26-2.18-6.33.48-13.18 0 0 4.1-1.34 13.43 5.1a45.74 45.74 0 0 1 24.46 0c9.33-6.44 13.42-5.1 13.42-5.1 2.67 6.85.99 11.92.49 13.18 3.13 3.48 5.02 7.92 5.02 13.36 0 19.14-11.44 23.35-22.34 24.58 1.75 1.54 3.32 4.58 3.32 9.24 0 6.66-.06 12.04-.06 13.67 0 1.32.88 2.87 3.36 2.38C84 90.36 98 71.73 98 49.76 98 22.28 76.13 0 48.85 0Z" />
            </svg>
            <span>GitHub</span>
          </button>
          <button type="button" disabled>
            <svg className="auth-social-icon auth-social-google" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.52h11.84a10.12 10.12 0 0 1-4.4 6.64v5.52h7.12c4.16-3.84 6.56-9.48 6.56-16.18Z" />
              <path fill="#34A853" d="M24 46c5.94 0 10.92-1.96 14.56-5.32l-7.12-5.52c-1.98 1.32-4.5 2.1-7.44 2.1-5.72 0-10.56-3.86-12.3-9.04H4.34v5.7A22 22 0 0 0 24 46Z" />
              <path fill="#FBBC05" d="M11.7 28.22A13.2 13.2 0 0 1 11 24c0-1.46.25-2.88.7-4.22v-5.7H4.34A22 22 0 0 0 2 24c0 3.55.85 6.9 2.34 9.92l7.36-5.7Z" />
              <path fill="#EA4335" d="M24 10.74c3.23 0 6.12 1.11 8.4 3.28l6.32-6.32C34.9 4.15 29.92 2 24 2A22 22 0 0 0 4.34 14.08l7.36 5.7c1.74-5.18 6.58-9.04 12.3-9.04Z" />
            </svg>
            <span>Google</span>
          </button>
        </div>
      </section>

      {authToast ? (
        <div className="auth-toast auth-toast-error" role="alert" aria-live="assertive" key={authToast.id}>
          <span className="auth-toast-icon" aria-hidden="true" />
          <span className="auth-toast-message">{authToast.message}</span>
        </div>
      ) : null}
    </div>
  );
}


