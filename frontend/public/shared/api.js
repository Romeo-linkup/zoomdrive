// shared/api.js
import { CONFIG } from './config.js';
import { getToken, clearToken } from './auth.js';

export class ApiError extends Error {
  constructor({ code, message, field = null, status = 0, requestId = null, details = null } = {}) {
    super(message || '');
    this.name = 'ApiError';
    this.code = code;
    this.message = message || '';
    this.field = field || null;
    this.status = status || 0;
    this.requestId = requestId || null;
    this.details = details || null;
  }
}

function isPlainObject(obj) {
  if (obj === null || typeof obj !== 'object') return false;
  if (obj instanceof FormData) return false;
  if (obj instanceof ArrayBuffer) return false;
  if (ArrayBuffer.isView(obj)) return false;
  if (obj instanceof Blob) return false;
  return Object.prototype.toString.call(obj) === '[object Object]';
}

export async function apiFetch(path, { method = 'GET', body, auth = true, timeoutMs = 30000, signal } = {}) {
  const url = CONFIG.API_BASE + path;
  const controller = new AbortController();
  let timeoutId = null;
  if (timeoutMs && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(new Error('ZD-NET-002')), timeoutMs);
  }
  const onAbort = () => controller.abort(signal.reason || new Error('ZD-NET-004'));
  if (signal) {
    if (signal.aborted) {
      if (timeoutId) clearTimeout(timeoutId);
      throw new ApiError({ code: 'ZD-NET-004', message: 'Request cancelled.', status: 0 });
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  const headers = {};
  let fetchBody = undefined;
  if (body !== undefined && body !== null) {
    if (body instanceof FormData) {
      fetchBody = body;
    } else if (isPlainObject(body) || Array.isArray(body)) {
      headers['Content-Type'] = 'application/json';
      fetchBody = JSON.stringify(body);
    } else {
      fetchBody = body;
    }
  }
  if (auth) {
    try {
      const token = getToken ? getToken() : null;
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
      }
    } catch (e) {
      // ignore
    }
  }
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: fetchBody,
      signal: controller.signal,
    });
    let json = null;
    try {
      json = await res.json();
    } catch (e) {
      const ms = Date.now() - start;
      if (CONFIG && CONFIG.ZD_DEBUG) {
        try { console.debug('[ZD-API]', method, path, 0, ms); } catch (e2) { /* Optional debug output can be skipped. */ }
      }
      throw new ApiError({ code: 'ZD-NET-003', message: 'The server sent an unexpected response.', status: 0 });
    }
    const ms = Date.now() - start;
    if (CONFIG && CONFIG.ZD_DEBUG) {
      try { console.debug('[ZD-API]', method, path, res.status, ms); } catch (e2) { /* Optional debug output can be skipped. */ }
    }
    if (json && json.ok) {
      return json.data;
    }
    const err = json && json.error ? json.error : {};
    const apiErr = new ApiError({
      code: err.code,
      message: err.message,
      field: err.field || null,
      status: res.status,
      requestId: json && json.requestId ? json.requestId : null,
      details: err.details || null,
    });
    try {
      window.dispatchEvent(new CustomEvent('zd:apierror', { detail: apiErr }));
    } catch (e) {
      try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ }
    }
    if (res.status === 401 && auth && apiErr.code === 'ZD-AUTH-001') {
      try { if (clearToken) clearToken(); } catch (e) { /* Session cleanup is best-effort. */ }
      try { window.dispatchEvent(new CustomEvent('zd:unauthorized')); } catch (e) { /* The auth event is optional. */ }
    }
    throw apiErr;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (timeoutId) clearTimeout(timeoutId);
    if (signal) {
      try { signal.removeEventListener('abort', onAbort); } catch (e2) { /* Listener cleanup is best-effort. */ }
    }
    // check if aborted by timeout
    if (e && e.name === 'AbortError') {
      // could be timeout or cancelled
      // if we aborted due to timeout, message is ZD-NET-002
      throw new ApiError({ code: 'ZD-NET-002', message: 'The server took too long to respond. Try again.', status: 0 });
    }
    // network failure
    throw new ApiError({ code: 'ZD-NET-001', message: 'Cannot reach the server. Check your connection and try again.', status: 0 });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (signal) {
      try { signal.removeEventListener('abort', onAbort); } catch (e2) { /* Listener cleanup is best-effort. */ }
    }
  }
}
