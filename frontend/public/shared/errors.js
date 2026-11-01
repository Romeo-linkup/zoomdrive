// shared/errors.js
import { APP_ID } from './config.js';
import { CONFIG } from './config.js';
import { el, clear, toast } from './ui.js';

let bannerCountThisLoad = 0;
const MAX_BANNERS = 5;

function isResizeObserverLoop(msg) {
  if (!msg) return false;
  const s = String(msg);
  if (s.indexOf('ResizeObserver loop') !== -1) return true;
  return false;
}

export function initErrors() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    try {
      const msg = event && event.message ? event.message : '';
      if (isResizeObserverLoop(msg)) return;
      let err = event.error;
      if (!(err instanceof Error)) {
        err = { code: 'ZD-UI-001', message: 'Something went wrong. Please try again.' };
      }
      try { console.error('[ZD-ERR]', err); } catch (e) {}
      try { showError(err); } catch (e) { try { console.debug(e); } catch (e2) {} }
    } catch (e) {
      try { console.debug(e); } catch (e2) {}
    }
  });
  window.addEventListener('unhandledrejection', (event) => {
    try {
      let reason = event && event.reason;
      if (reason && reason.message && isResizeObserverLoop(reason.message)) return;
      let err = reason;
      if (!(err instanceof Error) && typeof err !== 'object') {
        err = { code: 'ZD-UI-001', message: 'Something went wrong. Please try again.' };
      }
      try { console.error('[ZD-ERR]', err); } catch (e) {}
      try { showError(err); } catch (e) { try { console.debug(e); } catch (e2) {} }
    } catch (e) {
      try { console.debug(e); } catch (e2) {}
    }
  });
}

export function buildErrorDetails(err) {
  const code = err && err.code ? err.code : (err instanceof Error ? err.name : 'ZD-UI-001');
  const status = err && typeof err.status === 'number' ? err.status : 0;
  const requestId = err && err.requestId ? err.requestId : null;
  return {
    app: APP_ID,
    version: CONFIG && CONFIG.APP_VERSION ? CONFIG.APP_VERSION : '',
    route: (typeof location !== 'undefined' && location.hash) ? location.hash : '/',
    code: code,
    status: status,
    requestId: requestId,
    time: new Date().toISOString(),
  };
}

function ensureBannerRoot() {
  let root = document.querySelector('.banner-root');
  if (!root) {
    root = el('div', { class: 'banner-root', id: 'banner-root' });
    document.body.appendChild(root);
  }
  return root;
}

export function showError(err) {
  try {
    if (bannerCountThisLoad >= MAX_BANNERS) return;
    bannerCountThisLoad++;
    const root = ensureBannerRoot();
    const existing = root.querySelector('.err-banner');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
    const msg = err && err.message ? err.message : 'Something went wrong. Please try again.';
    const requestId = err && err.requestId ? String(err.requestId) : '';
    const ref = requestId ? requestId.slice(0, 6) : '-';
    const code = err && err.code ? err.code : 'ZD-UI-001';
    const banner = el('div', { class: 'err-banner' });
    banner.appendChild(el('b', {}, msg));
    banner.appendChild(el('small', {}, 'Code ' + code + ' · ref ' + ref));
    const actions = el('div', { class: 'actions' });
    const btnCopy = el('button', { type: 'button' }, 'Copy details');
    btnCopy.addEventListener('click', () => {
      try { copyDetails(err); } catch (e) { try { console.debug(e); } catch (e2) {} }
    });
    const btnDismiss = el('button', { type: 'button' }, 'Dismiss');
    btnDismiss.addEventListener('click', () => {
      clearError();
    });
    actions.appendChild(btnCopy);
    actions.appendChild(btnDismiss);
    banner.appendChild(actions);
    root.appendChild(banner);
    try { highlightField(err); } catch (e) { try { console.debug(e); } catch (e2) {} }
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
  }
}

export function clearError() {
  try {
    const root = document.querySelector('.banner-root');
    if (!root) return;
    const existing = root.querySelector('.err-banner');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
  }
}

export function copyDetails(err) {
  const details = buildErrorDetails(err);
  const text = JSON.stringify(details, null, 2);
  try {
    if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(() => {
        try { toast('Details copied', 'ok'); } catch (e) {}
      }).catch(() => {
        fallbackCopy(text);
      });
      return;
    }
    fallbackCopy(text);
  } catch (e) {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('Details copied', 'ok');
    } catch (e) {
      try { toast('Failed to copy', 'error'); } catch (e2) {}
    }
    if (ta.parentNode) ta.parentNode.removeChild(ta);
  } catch (e) {
    try { toast('Failed to copy', 'error'); } catch (e2) {}
  }
}

export function highlightField(err, root = document) {
  try {
    if (!err || !err.field) return false;
    const field = String(err.field);
    let elField = null;
    try {
      elField = root.querySelector('[data-field="' + CSS.escape(field) + '"]');
    } catch (e) {
      try {
        elField = root.querySelector('[data-field="' + field.replace(/"/g, '\\"') + '"]');
      } catch (e2) {
        elField = null;
      }
    }
    if (!elField) return false;
    elField.classList.add('has-error');
    let fe = elField.parentNode ? elField.parentNode.querySelector('.field-error') : null;
    if (!fe) {
      fe = el('div', { class: 'field-error' });
      if (elField.parentNode) {
        elField.parentNode.appendChild(fe);
      }
    }
    fe.textContent = err.message || '';
    try { elField.focus(); } catch (e) {}
    return true;
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
    return false;
  }
}

export function clearFieldErrors(root = document) {
  try {
    const fields = root.querySelectorAll('.has-error');
    fields.forEach((f) => f.classList.remove('has-error'));
    const errs = root.querySelectorAll('.field-error');
    errs.forEach((e) => { if (e.parentNode) e.parentNode.removeChild(e); });
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
  }
}

export function renderPageError(container, err, retry) {
  try {
    if (!container) return;
    clear(container);
    const card = el('div', { class: 'card' });
    card.appendChild(el('h2', {}, 'This page failed to load'));
    const msg = err && err.message ? err.message : 'Something went wrong. Please try again.';
    card.appendChild(el('div', {}, msg));
    const requestId = err && err.requestId ? String(err.requestId) : '';
    const ref = requestId ? requestId.slice(0, 6) : '-';
    const code = err && err.code ? err.code : 'ZD-UI-001';
    card.appendChild(el('div', {}, 'Code ' + code + ' · ref ' + ref));
    const actions = el('div', {});
    const btnRetry = el('button', { class: 'btn', type: 'button' }, 'Try again');
    if (typeof retry === 'function') {
      btnRetry.addEventListener('click', () => {
        try { retry(); } catch (e) { try { console.debug(e); } catch (e2) {} }
      });
    }
    const btnCopy = el('button', { class: 'btn soft', type: 'button' }, 'Copy details');
    btnCopy.addEventListener('click', () => {
      try { copyDetails(err); } catch (e) { try { console.debug(e); } catch (e2) {} }
    });
    actions.appendChild(btnRetry);
    actions.appendChild(btnCopy);
    card.appendChild(actions);
    container.appendChild(card);
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
  }
}
