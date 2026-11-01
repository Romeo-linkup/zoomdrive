// driver/app.js
import { APP_ID, CONFIG } from '../shared/config.js';
import { initErrors, showError } from '../shared/errors.js';
import { registerServiceWorker, initInstallPrompt, createInstallControl, initOfflineNotice } from '../shared/pwa.js';
import { isAuthed, refreshMe, getSession } from '../shared/auth.js';
import { apiFetch } from '../shared/api.js';
import { createRouter } from '../shared/router.js';
import { createBrandBar, createTopbar } from '../shared/components/topbar.js';
import { createBottomNav } from '../shared/components/bottom-nav.js';
import { el, clear } from '../shared/ui.js';

initErrors();
registerServiceWorker(APP_ID);
initInstallPrompt();
initOfflineNotice();

if (isAuthed()) {
  refreshMe().catch(() => {
    location.hash = '#/welcome';
  });
}

if (!location.hash && isAuthed()) {
  location.hash = '#/home';
}

const navItems = [
  { path: '/home', label: 'Home', icon: '🏠' },
  { path: '/activity', label: 'Activity', icon: '📋' },
  { path: '/account', label: 'Account', icon: '👤' },
];

const router = createRouter({
  routes: {
    '/welcome': {
      path: '/welcome',
      load: () => import('./pages/welcome.js'),
      title: 'ZoomDrive',
    },
    '/phone': {
      path: '/phone',
      load: () => import('./pages/phone.js'),
    },
    '/otp': {
      path: '/otp',
      load: () => import('./pages/otp.js'),
    },
    '/profile-setup': {
      path: '/profile-setup',
      load: () => import('./pages/profileSetup.js'),
      auth: true,
    },
    '/home': {
      path: '/home',
      load: () => import('./pages/home.js'),
      nav: true,
    },
    '/activity': {
      path: '/activity',
      load: () => import('./pages/activity.js'),
      nav: true,
    },
    '/account': {
      path: '/account',
      load: () => import('./pages/account.js'),
      nav: true,
    },
    '/request': {
      path: '/request',
      auth: true,
      needsProfile: true,
      nav: false,
      render: () => {
        const screen = el('div', { class: 'screen' });
        screen.appendChild(createTopbar({
          title: 'Request help',
          onBack: () => router.navigate('/home'),
        }));
        const card = el('div', { class: 'card' });
        card.appendChild(el('h2', {}, 'Requesting help arrives in a later update (Phase 9).'));
        const backBtn = el('button', { class: 'btn soft', type: 'button' }, 'Back to home');
        backBtn.addEventListener('click', () => router.navigate('/home'));
        card.appendChild(backBtn);
        screen.appendChild(card);
        return screen;
      },
    },
  },
  defaultRoute: '/welcome',
  mount: document.getElementById('view'),
  navRoot: document.getElementById('nav-root'),
  guard(route, ctx) {
    if (isAuthed()) {
      if (route.path === '/welcome' || (route.path === '/phone' && ctx.query.mode !== 'login')) {
        return '/home';
      }
      if (route.path === '/otp') {
        return '/home';
      }
      if (route.needsProfile) {
        const session = getSession();
        if (!session || !session.profileComplete) {
          return '/profile-setup?next=' + encodeURIComponent(ctx.path);
        }
      }
    }
  },
  renderNav(route, ctx) {
    if (route.nav) {
      clear(this.navRoot);
      this.navRoot.appendChild(createBottomNav({ items: navItems, current: ctx.path }));
    }
  },
});

if (!location.hash && isAuthed()) {
  location.hash = '#/home';
}

router.start();
