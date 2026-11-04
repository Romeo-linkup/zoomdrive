// driver/pages/welcome.js
import { el } from '../../shared/ui.js';
import { CONFIG } from '../../shared/config.js';
import { apiFetch } from '../../shared/api.js';
import { showError } from '../../shared/errors.js';
import { createInstallControl } from '../../shared/pwa.js';

export default (ctx) => {
  const screen = el('div', { class: 'screen' });
  const center = el('div', { class: 'page-center' });
  const inner = el('div', { class: 'page-center__inner' });

  const logo = el('img', { class: 'landing-logo', attrs: { src: '/brand/logo.svg', alt: 'ZoomDrive' } });
  inner.appendChild(logo);
  inner.appendChild(el('h1', {}, 'Roadside help, in minutes.'));
  inner.appendChild(el('p', { class: 'mu' }, 'Verified providers, fixed prices and live tracking.'));

  const signupBtn = el('button', { class: 'btn', type: 'button' }, 'Sign up');
  signupBtn.addEventListener('click', () => ctx.navigate('/email?mode=signup'));
  inner.appendChild(signupBtn);

  const loginBtn = el('button', { class: 'btn soft', type: 'button' }, 'Log in');
  loginBtn.addEventListener('click', () => ctx.navigate('/email?mode=login'));
  inner.appendChild(loginBtn);

  const install = createInstallControl(ctx);
  if (install) inner.appendChild(install);

  const guestLink = el('button', { class: 'link-btn', type: 'button' }, 'Just looking?');
  guestLink.addEventListener('click', () => ctx.navigate('/home'));
  inner.appendChild(guestLink);

  if (CONFIG.ZD_DEBUG) {
    const apiLine = el('p', { class: 'mu' }, 'API: checking...');
    inner.appendChild(apiLine);
    apiFetch('/health', { auth: false }).then((health) => {
      if (health && health.db) {
        apiLine.textContent = 'API: ' + health.db;
      } else {
        apiLine.textContent = 'API: up';
      }
    }).catch((err) => {
      showError(err);
      apiLine.textContent = 'API: unreachable';
    });
  }

  center.appendChild(inner);
  screen.appendChild(center);
  return screen;
};
