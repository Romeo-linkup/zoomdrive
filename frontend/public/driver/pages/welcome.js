// driver/pages/welcome.js
import { el } from '../../shared/ui.js';
import { CONFIG, APP_ID } from '../../shared/config.js';
import { apiFetch } from '../../shared/api.js';
import { showError } from '../../shared/errors.js';
import { createBrandBar } from '../../shared/components/topbar.js';

export default (ctx) => {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createBrandBar(APP_ID));
  const logo = el('img', { class: 'landing-logo', attrs: { src: '/brand/logo.svg', alt: 'ZoomDrive' } });
  screen.appendChild(logo);
  screen.appendChild(el('h1', {}, 'Roadside help, in minutes.'));
  screen.appendChild(el('p', { class: 'mu' }, 'Verified providers, fixed prices and live tracking.'));

  const signupBtn = el('button', { class: 'btn', type: 'button' }, 'Sign up');
  signupBtn.addEventListener('click', () => ctx.navigate('/phone?mode=signup'));
  screen.appendChild(signupBtn);

  const loginBtn = el('button', { class: 'btn soft', type: 'button' }, 'Log in');
  loginBtn.addEventListener('click', () => ctx.navigate('/phone?mode=login'));
  screen.appendChild(loginBtn);

  const guestLink = el('button', { class: 'link-btn', type: 'button' }, 'Just looking?');
  guestLink.addEventListener('click', () => ctx.navigate('/home'));
  screen.appendChild(guestLink);

  if (CONFIG.ZD_DEBUG) {
    const apiLine = el('p', { class: 'mu' }, 'API: checking...');
    screen.appendChild(apiLine);
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

  return screen;
};
