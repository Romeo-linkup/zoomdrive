import { apiFetch } from '../shared/api.js';
import { getPosition } from '../shared/geo.js';
import { isAuthed, registerLogoutHook } from '../shared/auth.js';

const HEARTBEAT_INTERVAL_MS = 15000;
const HIDDEN_LIMIT_MS = 5 * 60 * 1000;
const listeners = new Set();

let online = false;
let lastPosition = null;
let heartbeatTimer = null;
let backgroundTimer = null;
let heartbeatController = null;
let offlineMessage = '';

function notify() {
  const state = {
    isOnline: online,
    lastPosition: lastPosition ? { ...lastPosition } : null,
    message: offlineMessage,
  };
  listeners.forEach((callback) => {
    try {
      callback(state);
    } catch (err) {
      try { console.debug(err); } catch (e) {}
    }
  });
}

function clearTimers() {
  if (heartbeatTimer !== null) clearTimeout(heartbeatTimer);
  if (backgroundTimer !== null) clearTimeout(backgroundTimer);
  heartbeatTimer = null;
  backgroundTimer = null;
}

function scheduleHeartbeat(delay = HEARTBEAT_INTERVAL_MS) {
  if (!online || heartbeatTimer !== null) return;
  heartbeatTimer = setTimeout(() => {
    heartbeatTimer = null;
    sendHeartbeat();
  }, delay);
}

async function currentPosition() {
  try {
    const position = await getPosition();
    lastPosition = { lat: position.lat, lng: position.lng };
  } catch (err) {
    if (!lastPosition) throw err;
  }
  return lastPosition;
}

async function sendHeartbeat() {
  if (!online || heartbeatController) return;
  const controller = new AbortController();
  heartbeatController = controller;
  try {
    const position = await currentPosition();
    if (!online || controller.signal.aborted) return;
    const data = await apiFetch('/providers/me/heartbeat', {
      method: 'POST',
      body: { lat: position.lat, lng: position.lng },
      signal: controller.signal,
    });
    if (!online || controller.signal.aborted) return;
    lastPosition = { lat: position.lat, lng: position.lng };
    if (data.isOnline === false) {
      await stopOnline({ notifyServer: false });
      return;
    }
  } catch (err) {
    if (online && !controller.signal.aborted) {
      try { console.debug(err); } catch (e) {}
    }
  } finally {
    if (heartbeatController === controller) heartbeatController = null;
    if (online) scheduleHeartbeat();
  }
}

export function startOnline(position) {
  if (position && Number.isFinite(Number(position.lat)) && Number.isFinite(Number(position.lng))) {
    lastPosition = { lat: Number(position.lat), lng: Number(position.lng) };
  }
  online = true;
  offlineMessage = '';
  clearTimers();
  notify();
  if (document.hidden) startHiddenTimer();
  scheduleHeartbeat();
}

export async function stopOnline({ notifyServer = false, message = '' } = {}) {
  const wasOnline = online;
  online = false;
  offlineMessage = message;
  clearTimers();
  if (heartbeatController) {
    heartbeatController.abort();
    heartbeatController = null;
  }
  notify();
  if (notifyServer && wasOnline && isAuthed()) {
    try {
      await apiFetch('/providers/me/online', {
        method: 'POST',
        body: { online: false },
      });
    } catch (err) {
      try { console.debug(err); } catch (e) {}
    }
  }
}

function startHiddenTimer() {
  if (!online || backgroundTimer !== null) return;
  backgroundTimer = setTimeout(() => {
    backgroundTimer = null;
    stopOnline({
      notifyServer: true,
      message: 'You were set offline while the app was in the background',
    });
  }, HIDDEN_LIMIT_MS);
}

function onVisibilityChange() {
  if (document.hidden) {
    startHiddenTimer();
  } else {
    if (backgroundTimer !== null) clearTimeout(backgroundTimer);
    backgroundTimer = null;
  }
}

export function isOnline() {
  return online;
}

export function getLastPosition() {
  return lastPosition ? { ...lastPosition } : null;
}

export function onChange(callback) {
  if (typeof callback !== 'function') return () => {};
  listeners.add(callback);
  try {
    callback({
      isOnline: online,
      lastPosition: lastPosition ? { ...lastPosition } : null,
      message: offlineMessage,
    });
  } catch (err) {
    try { console.debug(err); } catch (e) {}
  }
  return () => listeners.delete(callback);
}

document.addEventListener('visibilitychange', onVisibilityChange);
registerLogoutHook(() => stopOnline({ notifyServer: true }));
window.addEventListener('zd:session', () => {
  if (!isAuthed() && online) stopOnline({ notifyServer: true });
});