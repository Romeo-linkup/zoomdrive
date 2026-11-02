// shared/auth.js
import { CONFIG, APP_ID } from './config.js';
import { apiFetch } from './api.js';

let memoryToken = null;
let session = null;
const logoutHooks = new Set();

function readToken() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const t = localStorage.getItem(CONFIG.TOKEN_KEY);
    if (t && typeof t === 'string') return t;
    return null;
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
    return memoryToken;
  }
}

function writeToken(t) {
  try {
    if (typeof localStorage === 'undefined') {
      memoryToken = t || null;
      return;
    }
    if (t) {
      localStorage.setItem(CONFIG.TOKEN_KEY, t);
    } else {
      localStorage.removeItem(CONFIG.TOKEN_KEY);
    }
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
    memoryToken = t || null;
  }
}

export function getToken() {
  const t = readToken();
  if (t) return t;
  return memoryToken;
}

export function setToken(t) {
  writeToken(t || null);
  if (!t) memoryToken = null;
  dispatchSession();
}

export function clearToken() {
  writeToken(null);
  memoryToken = null;
  session = null;
  dispatchSession();
}

function dispatchSession() {
  try {
    window.dispatchEvent(new CustomEvent('zd:session'));
  } catch (e) {
    // ignore
  }
}

export function isAuthed() {
  return !!getToken();
}

export function setSession(payload) {
  if (!payload) {
    session = null;
    clearToken();
    dispatchSession();
    return;
  }
  if (payload.token) {
    writeToken(payload.token);
    memoryToken = payload.token;
  }
  const s = {
    user: payload.user || null,
    profile: payload.profile || null,
    profileComplete: payload.profileComplete || false,
    providerStatus: payload.providerStatus || null,
  };
  // Role safety
  try {
    if ((APP_ID === 'driver' || APP_ID === 'provider') && s.user && s.user.role && s.user.role !== APP_ID) {
      session = null;
      clearToken();
      dispatchSession();
      return null;
    }
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
  }
  session = s;
  dispatchSession();
  return session;
}

export function getSession() {
  return session;
}

export function getUser() {
  return session && session.user ? session.user : null;
}

export async function refreshMe() {
  try {
    const data = await apiFetch('/auth/me', { method: 'GET', auth: true });
    if (!data) {
      // treat as failure case
      session = null;
      clearToken();
      return null;
    }
    const s = {
      user: data.user || null,
      profile: data.profile || null,
      profileComplete: data.profileComplete || false,
      providerStatus: data.providerStatus || null,
    };
    try {
      if ((APP_ID === 'driver' || APP_ID === 'provider') && s.user && s.user.role && s.user.role !== APP_ID) {
        session = null;
        clearToken();
        dispatchSession();
        return null;
      }
    } catch (e) {
      try { console.debug(e); } catch (e2) {}
    }
    session = s;
    dispatchSession();
    return session;
  } catch (e) {
    if (e && e.code === 'ZD-AUTH-001') {
      session = null;
      clearToken();
      return null;
    }
    if (e && e.code === 'ZD-AUTH-005') {
      session = null;
      clearToken();
      return null;
    }
    throw e;
  }
}

export function requireAuth() {
  return isAuthed();
}

export function registerLogoutHook(callback) {
  if (typeof callback !== 'function') return () => {};
  logoutHooks.add(callback);
  return () => logoutHooks.delete(callback);
}

export async function logout() {
  for (const hook of logoutHooks) {
    try {
      await hook();
    } catch (e) {
      try { console.debug(e); } catch (e2) {}
    }
  }
  try {
    await apiFetch('/auth/logout', { method: 'POST', auth: true });
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
  }
  session = null;
  clearToken();
  try {
    location.hash = '#/welcome';
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('zd:unauthorized', () => {
    session = null;
    clearToken();
    try {
      location.hash = '#/welcome';
    } catch (e) {
      try { console.debug(e); } catch (e2) {}
    }
  });
}
