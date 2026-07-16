// @haish-esm
import { API_BASE } from './base.js';

export const CONVERSATION_STORAGE_KEY = 'agent_world_conversation_id';
export const WORKSPACE_STORAGE_KEY = 'agent_world_workspaces_v2';
export const CONTEXT_USAGE_STORAGE_KEY = 'agent_world_context_usage_v1';
export const AUTH_SESSION_STORAGE_KEY = 'haish_auth_session_v1';
export const RUN_CONFIG_STORAGE_PREFIX = 'haish_run_config_v1';
export const DEFAULT_CONTEXT_TOTAL_TOKENS = 128000;
export const RESTORED_CONTEXT_BASE_TOKENS = 4200;
export const DEFAULT_PROJECT_ID = 'default-project';
export const DEFAULT_PROJECT_NAME = 'Default project';
export const DEFAULT_SESSION_NAME = 'Default Session';
export const DEFAULT_CONVERSATION_NAMES = new Set([DEFAULT_SESSION_NAME, 'New Chat', 'New Conversation', 'Untitled Chat']);


export function readStoredJson(storage, key) {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export function stableHash(value) {
  const input = String(value || '');
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function buildRunConfigStorageKey(authUser, providerKey, conversationId = '') {
  const userKey = String(authUser?.id || authUser?.email || authUser?.username || 'anonymous').trim() || 'anonymous';
  const provider = String(providerKey || 'unknown').trim() || 'unknown';
  const conversation = String(conversationId || '').trim();
  if (provider === 'unknown' || !conversation) return '';
  return `${RUN_CONFIG_STORAGE_PREFIX}:${stableHash(userKey)}:${stableHash(provider)}:${stableHash(conversation)}`;
}

export function clearStoredAuthSession() {
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
}

export function loadStoredAuthSession() {
  const localSession = readStoredJson(window.localStorage, AUTH_SESSION_STORAGE_KEY);
  if (localSession?.accessToken || localSession?.refreshToken) return { ...localSession, remember: true };
  const sessionSession = readStoredJson(window.sessionStorage, AUTH_SESSION_STORAGE_KEY);
  if (sessionSession?.accessToken || sessionSession?.refreshToken) return { ...sessionSession, remember: false };
  return null;
}

export let authMemorySession = loadStoredAuthSession();
export let authRefreshPromise = null;

export function normalizeAuthPayload(payload, remember = true) {
  const accessToken = String(payload?.access_token || payload?.accessToken || '').trim();
  const refreshToken = String(payload?.refresh_token || payload?.refreshToken || '').trim();
  if (!accessToken || !refreshToken) {
    throw new Error('Authentication response did not include tokens.');
  }
  const expiresIn = Number(payload?.expires_in || payload?.expiresIn || 0) || 0;
  return {
    accessToken,
    refreshToken,
    tokenType: String(payload?.token_type || payload?.tokenType || 'bearer').toLowerCase(),
    expiresAt: expiresIn > 0 ? Date.now() + expiresIn * 1000 : null,
    user: payload?.user || null,
    remember: Boolean(remember),
  };
}

export function saveAuthSession(payload, remember = true) {
  const session = normalizeAuthPayload(payload, remember);
  authMemorySession = session;
  clearStoredAuthSession();
  const storage = session.remember ? window.localStorage : window.sessionStorage;
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  return session;
}

export function updateAuthSessionUser(user) {
  if (!authMemorySession) return null;
  authMemorySession = { ...authMemorySession, user };
  clearStoredAuthSession();
  const storage = authMemorySession.remember ? window.localStorage : window.sessionStorage;
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(authMemorySession));
  return authMemorySession;
}

export function clearAuthSession({ notify = true } = {}) {
  authMemorySession = null;
  clearStoredAuthSession();
  if (notify) {
    window.dispatchEvent(new CustomEvent('haish-auth-expired'));
  }
}

export function getAuthAccessToken() {
  return String(authMemorySession?.accessToken || '').trim();
}

export function getAuthRefreshToken() {
  return String(authMemorySession?.refreshToken || '').trim();
}

export function buildAuthHeaders(extraHeaders = {}, { json = true } = {}) {
  const headers = new Headers(extraHeaders || {});
  if (json && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const token = getAuthAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return Object.fromEntries(headers.entries());
}

export function withAuthInit(init = {}, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  return {
    ...init,
    headers: buildAuthHeaders(init.headers, { json: options.json !== false && !isFormData }),
  };
}

export function buildApiHeaders(extraHeaders = {}) {
  return buildAuthHeaders(extraHeaders);
}

export function dispatchAuthExpired() {
  clearAuthSession({ notify: true });
}

export async function parseResponseMessage(response, fallback) {
  try {
    const payload = await response.json();
    const detail = payload?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail.trim();
    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((item) => item?.msg || item?.message || String(item)).join(' ');
    }
    if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message.trim();
  } catch (error) {
    // Keep the fallback when the server returns an empty or non-JSON response.
  }
  return fallback;
}

export async function refreshAuthSession() {
  if (authRefreshPromise) return authRefreshPromise;
  authRefreshPromise = (async () => {
    const refreshToken = getAuthRefreshToken();
    if (!refreshToken) throw new Error('No refresh token is available.');
    const remember = authMemorySession?.remember ?? true;
    const response = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!response.ok) {
      const message = await parseResponseMessage(response, `refresh failed: ${response.status}`);
      clearAuthSession({ notify: false });
      throw new Error(message);
    }
    const payload = await response.json();
    return saveAuthSession(payload, remember);
  })().finally(() => {
    authRefreshPromise = null;
  });
  return authRefreshPromise;
}

export async function authFetch(input, init = {}, options = {}) {
  const response = await fetch(input, withAuthInit(init, options));
  if (response.status !== 401 || options.skipRefresh) return response;
  if (!getAuthRefreshToken()) return response;
  try {
    await refreshAuthSession();
  } catch (error) {
    dispatchAuthExpired();
    return response;
  }
  if (init.signal?.aborted) return response;
  return fetch(input, withAuthInit(init, options));
}

export async function requestAuthJson(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const message = await parseResponseMessage(response, `request failed: ${response.status}`);
    throw new Error(message);
  }
  return response.json();
}

export function accountToRegisterPayload(account, password) {
  const normalized = String(account || '').trim();
  const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized);
  const baseName = isEmail ? normalized.split('@', 1)[0] : normalized;
  return {
    username: isEmail ? undefined : normalized,
    email: isEmail ? normalized : undefined,
    password,
    display_name: baseName || 'User',
  };
}

export async function loginWithPassword(account, password, remember) {
  const payload = await requestAuthJson('/api/auth/login', { account, password });
  return saveAuthSession(payload, remember);
}

export async function registerWithPassword(account, password, remember) {
  const payload = await requestAuthJson('/api/auth/register', accountToRegisterPayload(account, password));
  return saveAuthSession(payload, remember);
}

export async function registerNewAccount({ userName, email, password }, remember) {
  const trimmedName = String(userName || '').trim();
  const trimmedEmail = String(email || '').trim();
  const payload = await requestAuthJson('/api/auth/register', {
    username: trimmedName || undefined,
    email: trimmedEmail || undefined,
    password,
    display_name: trimmedName || (trimmedEmail ? trimmedEmail.split('@', 1)[0] : 'User'),
  });
  return saveAuthSession(payload, remember);
}

export async function fetchCurrentAuthUser() {
  const response = await authFetch(`${API_BASE}/api/auth/me`, { method: 'GET' }, { json: false });
  if (!response.ok) {
    const message = await parseResponseMessage(response, `session check failed: ${response.status}`);
    throw new Error(message);
  }
  const user = await response.json();
  updateAuthSessionUser(user);
  return user;
}

export async function logoutCurrentSession() {
  const refreshToken = getAuthRefreshToken();
  if (refreshToken) {
    await fetch(`${API_BASE}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    }).catch(() => undefined);
  }
  clearAuthSession({ notify: false });
}


