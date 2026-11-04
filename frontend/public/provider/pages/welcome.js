import { el } from '../../shared/ui.js';
import { CONFIG } from '../../shared/config.js';
import { apiFetch } from '../../shared/api.js';
import { showError } from '../../shared/errors.js';

export default (ctx) => {
  const screen = el('div', { class: 'screen' });
  const center = el('div', { class: 'page-center' });
  const inner = el('div', { class: 'page-center__inner' });

  const topbar = el('div', { class: 'topbar' });
  const badge = el('span', { class: 'badge dark' }, 'PARTNER');
  topbar.appendChild(badge);
  inner.appendChild(topbar);

  const logo = el('img', { class: 'landing-logo', attrs: { src: '/brand/logo.svg', alt: 'ZoomDrive' } });
  inner.appendChild(logo);
  inner.appendChild(el('h1', {}, 'Become a ZoomDrive Partner.'));
  inner.appendChild(el('p', { class: 'mu' }, 'Sign up, complete onboarding, and start helping nearby drivers.'));

  const signupBtn = el('button', { class: 'btn', type: 'button' }, 'Sign up');
  signupBtn.addEventListener('click', () => ctx.navigate('/email?mode=signup'));
  inner.appendChild(signupBtn);

  const loginBtn = el('button', { class: 'btn soft', type: 'button' }, 'Log in');
  loginBtn.addEventListener('click', () => ctx.navigate('/email?mode=login'));
  inner.appendChild(loginBtn);

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
