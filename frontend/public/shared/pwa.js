// shared/pwa.js
import { CONFIG } from './config.js';
import { clear, el, toast } from './ui.js';

let installPromptEvent = null;
let updateToast = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPromptEvent = event;
    window.dispatchEvent(new CustomEvent('zd:installstate'));
  });
  window.addEventListener('appinstalled', () => {
    installPromptEvent = null;
    window.dispatchEvent(new CustomEvent('zd:installstate'));
  });
}

function showUpdateToast(worker) {
  if (!worker || updateToast) return;
  const root = document.querySelector('.toast-root') || el('div', { class: 'toast-root' });
  if (!root.parentNode) document.body.appendChild(root);
  updateToast = el('div', { class: 'toast update-toast', role: 'status' });
  updateToast.appendChild(document.createTextNode('Update available'));
  const button = el('button', { type: 'button' }, 'Reload');
  button.addEventListener('click', () => {
    const reloadOnControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', reloadOnControllerChange, { once: true });
    worker.postMessage({ type: 'SKIP_WAITING' });
  });
  updateToast.appendChild(button);
  root.appendChild(updateToast);
}

function watchRegistration(registration) {
  if (registration.waiting) showUpdateToast(registration.waiting);
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateToast(registration.waiting || installing);
      }
    });
  });
}

export function registerServiceWorker(appId) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  if (typeof location === 'undefined') return;
  const isLocal = CONFIG && CONFIG.ZD_DEBUG;
  if (location.protocol !== 'https:' && !isLocal) return;
  navigator.serviceWorker.register('/' + appId + '/sw.js', { scope: '/' + appId + '/' })
    .then(watchRegistration)
    .catch((error) => {
      console.error('[ZD-ERR]', error);
    });
}

export function initInstallPrompt() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('zd:installstate'));
  }
}

function isStandalone() {
  return Boolean(
    (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
    navigator.standalone
  );
}

function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

export function createInstallControl(ctx) {
  if (isStandalone()) return null;
  const wrapper = el('div', {});

  function render() {
    clear(wrapper);
    if (isStandalone()) return;
    if (installPromptEvent) {
      const button = el('button', { class: 'btn soft', type: 'button' }, 'Install app');
      button.addEventListener('click', async () => {
        if (!installPromptEvent) return;
        const promptEvent = installPromptEvent;
        installPromptEvent = null;
        try {
          await promptEvent.prompt();
          render();
        } catch (error) {
          console.error('[ZD-ERR]', error);
          toast('Install prompt failed', 'error');
        }
      });
      wrapper.appendChild(button);
      return;
    }

    if (isIOS()) {
      let dismissed = false;
      try {
        dismissed = localStorage.getItem('zd-ios-install-dismissed') === 'true';
      } catch {
        // The instruction remains available when storage is disabled.
      }
      if (dismissed) return;
      const card = el('div', { class: 'install-card' });
      card.appendChild(el('b', {}, 'Install this app'));
      card.appendChild(el('div', {}, 'Tap the Share button, then Add to Home Screen.'));
      const dismiss = el('button', { class: 'btn soft', type: 'button' }, 'Dismiss');
      dismiss.addEventListener('click', () => {
        try {
          localStorage.setItem('zd-ios-install-dismissed', 'true');
        } catch {
          // Dismissal still applies for this page when storage is disabled.
        }
        clear(wrapper);
      });
      card.appendChild(dismiss);
      wrapper.appendChild(card);
    }
  }

  render();
  window.addEventListener('zd:installstate', render);
  if (ctx && typeof ctx.onLeave === 'function') {
    ctx.onLeave(() => window.removeEventListener('zd:installstate', render));
  }
  return wrapper;
}

export function initOfflineNotice() {
  if (typeof window === 'undefined') return () => {};
  const bar = el('div', {
    class: 'offline-bar',
    hidden: true,
    role: 'status',
    attrs: { 'aria-live': 'polite' },
  }, 'You are offline. Some features will not work.');
  document.body.appendChild(bar);

  function update() {
    bar.hidden = navigator.onLine;
  }

  function cleanup() {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
    window.removeEventListener('pagehide', cleanup);
    if (bar.parentNode) bar.parentNode.removeChild(bar);
  }

  update();
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  window.addEventListener('pagehide', cleanup, { once: true });
  return cleanup;
}
