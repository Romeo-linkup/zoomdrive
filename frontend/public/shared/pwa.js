// shared/pwa.js
import { CONFIG } from './config.js';
import { el } from './ui.js';

let installPromptEvent = null;

export function registerServiceWorker(appId) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  if (typeof location === 'undefined') return;
  const isLocal = CONFIG && CONFIG.ZD_DEBUG;
  if (location.protocol !== 'https:' && !isLocal) return;
  try {
    navigator.serviceWorker.register('/' + appId + '/sw.js', { scope: '/' + appId + '/' }).catch((e) => {
      try { console.debug(e); } catch (e2) {}
    });
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
  }
}

export function initInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPromptEvent = e;
    try { window.dispatchEvent(new CustomEvent('zd:installstate')); } catch (e2) {}
  });
  window.addEventListener('appinstalled', () => {
    installPromptEvent = null;
    try { window.dispatchEvent(new CustomEvent('zd:installstate')); } catch (e2) {}
  });
}

function isStandalone() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (navigator.standalone) return true;
  } catch (e) {}
  return false;
}

function isIOS() {
  try {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua)) return true;
  } catch (e) {}
  return false;
}

export function createInstallControl() {
  if (isStandalone()) return null;
  const wrapper = el('div', {});

  function render() {
    clear(wrapper);
    if (isStandalone()) {
      return;
    }
    if (installPromptEvent) {
      const btn = el('button', { class: 'btn soft', type: 'button' }, 'Install app');
      btn.addEventListener('click', () => {
        if (installPromptEvent) {
          installPromptEvent.prompt().then(() => {
            installPromptEvent = null;
            try { window.dispatchEvent(new CustomEvent('zd:installstate')); } catch (e2) {}
            render();
          }).catch(() => {
            try { console.debug('Install prompt failed'); } catch (e2) {}
          });
        }
      });
      wrapper.appendChild(btn);
    } else if (isIOS()) {
      const card = el('div', { class: 'install-card' });
      card.appendChild(el('b', {}, 'Install this app'));
      card.appendChild(el('div', {}, 'Tap the Share button, then "Add to Home Screen".'));
      wrapper.appendChild(card);
    }
  }

  render();
  try {
    window.addEventListener('zd:installstate', render);
  } catch (e) {
    try { console.debug(e); } catch (e2) {}
  }

  return wrapper;
}

export function initOfflineNotice() {
  if (typeof window === 'undefined') return;
  const bar = el('div', { class: 'offline-bar', hidden: true }, "You're offline. Some features may not work.");
  document.body.appendChild(bar);

  function update() {
    try {
      if (navigator.onLine) {
        bar.hidden = true;
      } else {
        bar.hidden = false;
      }
    } catch (e) {}
  }

  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
}
