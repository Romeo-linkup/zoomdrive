// shared/ui.js
import { CONFIG } from './config.js';

export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/;/g, '&#59;');
}

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  if (props && typeof props === 'object') {
    for (const key of Object.keys(props)) {
      const val = props[key];
      if (val === undefined || val === null) continue;
      if (key === 'class') {
        if (Array.isArray(val)) node.className = val.filter(Boolean).join(' ');
        else node.className = String(val);
        continue;
      }
      if (key === 'className') {
        if (Array.isArray(val)) node.className = val.filter(Boolean).join(' ');
        else node.className = String(val);
        continue;
      }
      if (key === 'text') {
        node.textContent = String(val);
        continue;
      }
      if (key === 'dataset') {
        if (typeof val === 'object') {
          for (const dk of Object.keys(val)) {
            if (val[dk] !== undefined && val[dk] !== null) {
              node.dataset[dk] = String(val[dk]);
            }
          }
        }
        continue;
      }
      if (key === 'attrs') {
        if (typeof val === 'object') {
          for (const ak of Object.keys(val)) {
            if (val[ak] !== undefined && val[ak] !== null) {
              node.setAttribute(ak, String(val[ak]));
            }
          }
        }
        continue;
      }
      if (key === 'on') {
        if (typeof val === 'object') {
          for (const ev of Object.keys(val)) {
            if (typeof val[ev] === 'function') {
              node.addEventListener(ev, val[ev]);
            }
          }
        }
        continue;
      }
      node[key] = val;
    }
  }
  for (const ch of children) {
    if (Array.isArray(ch)) {
      for (const c of ch) {
        if (c === null || c === undefined || c === false) continue;
        if (c instanceof Node) node.appendChild(c);
        else node.appendChild(document.createTextNode(String(c)));
      }
      continue;
    }
    if (ch === null || ch === undefined || ch === false) continue;
    if (ch instanceof Node) node.appendChild(ch);
    else node.appendChild(document.createTextNode(String(ch)));
  }
  return node;
}

export function clear(node) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
}

function ensureToastRoot() {
  let root = document.querySelector('.toast-root');
  if (!root) {
    root = el('div', { class: 'toast-root' });
    document.body.appendChild(root);
  }
  return root;
}

export function toast(message, type = 'info', ms = 3500) {
  const allowed = ['info', 'ok', 'error'];
  const t = allowed.includes(type) ? type : 'info';
  const root = ensureToastRoot();
  const cls = t === 'info' ? 'toast' : 'toast ' + t;
  const elToast = el('div', { class: cls, role: 'status' }, String(message));
  root.appendChild(elToast);
  setTimeout(() => {
    if (elToast && elToast.parentNode) {
      elToast.parentNode.removeChild(elToast);
    }
  }, ms);
}

export function modal({ title, body, actions } = {}) {
  return new Promise((resolve) => {
    const act = Array.isArray(actions) && actions.length ? actions : [{ label: 'OK', kind: 'primary', value: true }];
    const backdrop = el('div', { class: 'modal-backdrop' });
    const modalEl = el('div', { class: 'modal', role: 'dialog', attrs: { 'aria-modal': 'true' } });
    if (title !== undefined && title !== null) {
      modalEl.appendChild(el('h3', {}, String(title)));
    }
    if (body instanceof Node) {
      modalEl.appendChild(body);
    } else if (body !== undefined && body !== null) {
      modalEl.appendChild(document.createTextNode(String(body)));
    }
    const btnRow = el('div', {});
    const buttons = [];
    for (let i = 0; i < act.length; i++) {
      const a = act[i];
      let cls = 'btn';
      if (a.kind === 'soft') cls = 'btn soft';
      else if (a.kind === 'red') cls = 'btn red';
      else cls = 'btn';
      const btn = el('button', { class: cls, type: 'button' }, String(a.label || 'OK'));
      btn.addEventListener('click', () => {
        close(a.value);
      });
      buttons.push(btn);
      btnRow.appendChild(btn);
    }
    modalEl.appendChild(btnRow);
    backdrop.appendChild(modalEl);
    document.body.appendChild(backdrop);
    let closed = false;
    const prevFocus = document.activeElement;
    function close(val) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus(); } catch (e) { /* ignore */ }
      }
      resolve(val === undefined ? null : val);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(null);
      }
    }
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null);
    });
    document.addEventListener('keydown', onKey);
    setTimeout(() => {
      if (buttons[0] && typeof buttons[0].focus === 'function') {
        try { buttons[0].focus(); } catch (e) { /* ignore */ }
      }
    }, 0);
  });
}

let spinnerCount = 0;
function ensureSpinnerOverlay() {
  let ov = document.querySelector('.spinner-overlay');
  if (!ov) {
    ov = el('div', { class: 'spinner-overlay' });
    document.body.appendChild(ov);
  }
  return ov;
}

export function spinner(large = false) {
  const s = el('div', { class: large ? 'spinner lg' : 'spinner' });
  return s;
}

export function showSpinner() {
  const ov = ensureSpinnerOverlay();
  spinnerCount++;
  if (ov.style.display === 'none') ov.style.display = '';
  return true;
}

export function hideSpinner() {
  spinnerCount = Math.max(0, spinnerCount - 1);
  if (spinnerCount === 0) {
    const ov = document.querySelector('.spinner-overlay');
    if (ov && ov.parentNode) {
      ov.parentNode.removeChild(ov);
    }
  }
}

// withSpinner accepts either a promise or an async function.
// If a function is passed it is invoked (not merely awaited), so callers
// must pass `async () => { ... }` rather than the already-awaited result.
export async function withSpinner(work) {
  showSpinner();
  try {
    const p = typeof work === 'function' ? work() : work;
    return await p;
  } finally {
    hideSpinner();
  }
}

export function formatZAR(cents) {
  const n = typeof cents === 'number' && !isNaN(cents) ? Math.round(cents) : 0;
  try {
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(n / 100);
  } catch (e) {
    return 'R ' + (n / 100).toFixed(2);
  }
}

export function formatDate(iso, style = 'datetime') {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  try {
    if (style === 'date') {
      return new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    }
    if (style === 'time') {
      return new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' }).format(d);
    }
    return new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch (e) {
    return '';
  }
}

export function formatRelativeTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [unit, interval] of units) {
    if (Math.abs(seconds) >= interval) {
      return formatter.format(Math.round(seconds / interval), unit);
    }
  }
  return formatter.format(seconds, 'second');
}

export function formatPhone(e164) {
  if (typeof e164 !== 'string') return e164;
  if (/^\+278[0-9]{8}$/.test(e164)) {
    // +27 82 123 4567
    return e164.replace(/^\+27([0-9]{2})([0-9]{3})([0-9]{4})$/, '+27 $1 $2 $3');
  }
  return e164;
}
