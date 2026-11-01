// driver/app.js
import { APP_ID, CONFIG } from '../shared/config.js';
import { initErrors } from '../shared/errors.js';
import { registerServiceWorker, initInstallPrompt, createInstallControl, initOfflineNotice } from '../shared/pwa.js';
import { isAuthed, refreshMe } from '../shared/auth.js';
import { apiFetch, showError } from '../shared/api.js';
import { createRouter } from '../shared/router.js';
import { createBrandBar, createBottomNav } from '../shared/components/topbar.js';
import { el, clear } from '../shared/ui.js';

initErrors();
registerServiceWorker(APP_ID);
initInstallPrompt();
initOfflineNotice();

if (isAuthed()) {
  refreshMe().catch(() => {});
}

const navItems = [
  { path: '/home', label: 'Home', icon: '🏠' },
  { path: '/activity', label: 'Activity', icon: '📋' },
  { path: '/account', label: 'Account', icon: '👤' },
];

const router = createRouter({
  routes: {
    '/welcome': {
      render: async () => {
        const screen = el('div', { class: 'screen' });
        screen.appendChild(createBrandBar(APP_ID));
        const logo = el('img', { class: 'landing-logo', attrs: { src: '/brand/logo.svg', alt: 'ZoomDrive' } });
        screen.appendChild(logo);
        screen.appendChild(el('h1', {}, 'Roadside help, in minutes.'));
        screen.appendChild(el('p', { class: 'mu' }, 'The app shell is ready. Sign-up arrives in the next phase.'));

        const card = el('div', { class: 'card' });
        const apiLine = el('div', {}, 'API status: checking...');
        card.appendChild(apiLine);
        screen.appendChild(card);

        try {
          const health = await apiFetch('/health', { auth: false });
          if (health && health.db) {
            apiLine.textContent = 'Connected to API · v' + (health.version || CONFIG.APP_VERSION) + ' · database ' + health.db;
          } else {
            apiLine.textContent = 'Connected to API · v' + (health.version || CONFIG.APP_VERSION);
          }
        } catch (err) {
          showError(err);
          apiLine.textContent = 'API unreachable';
        }

        const install = createInstallControl();
        if (install) {
          screen.appendChild(install);
        }

        screen.appendChild(el('p', { class: 'mu' }, 'App version ' + CONFIG.APP_VERSION));

        return screen;
      },
    },
  },
  defaultRoute: '/welcome',
  mount: document.getElementById('view'),
  navRoot: document.getElementById('nav-root'),
  renderNav(route, ctx) {
    if (route.nav) {
      clear(this.navRoot);
      this.navRoot.appendChild(createBottomNav({ items: navItems, current: ctx.path }));
    }
  },
});

router.start();
