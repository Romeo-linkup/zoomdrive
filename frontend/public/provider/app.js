import { APP_ID, CONFIG } from '../shared/config.js';
import { initErrors, showError } from '../shared/errors.js';
import { registerServiceWorker, initInstallPrompt, createInstallControl, initOfflineNotice } from '../shared/pwa.js';
import { getSession, isAuthed, refreshMe } from '../shared/auth.js';
import { apiFetch } from '../shared/api.js';
import { createRouter } from '../shared/router.js';
import { createBrandBar } from '../shared/components/topbar.js';
import { createBottomNav } from '../shared/components/bottom-nav.js';
import { el, clear } from '../shared/ui.js';
import { renderProviderUnreadBadge } from './notificationsBadge.js';
import { onboardingRoute } from './onboarding.js';
import './heartbeat.js';
import { capturePaymentReturn } from './paymentReturn.js';

initErrors();
registerServiceWorker(APP_ID);
initInstallPrompt();
initOfflineNotice();
capturePaymentReturn();

const navItems = [
  { path: '/home', label: 'Home', icon: '🏠' },
  { path: '/earnings', label: 'Earnings', icon: '💰' },
  { path: '/inbox', label: 'Inbox', icon: '📬' },
  { path: '/menu', label: 'Menu', icon: '☰' },
];
const navRoot = document.getElementById('nav-root');

const router = createRouter({
  routes: {
    '/welcome': {
      render: async (ctx) => {
        const screen = el('div', { class: 'screen' });
        screen.appendChild(createBrandBar(APP_ID));
        const logo = el('img', { class: 'landing-logo', attrs: { src: '/brand/logo.svg', alt: 'ZoomDrive' } });
        screen.appendChild(logo);
        screen.appendChild(el('h1', {}, 'Become a ZoomDrive Partner.'));
        screen.appendChild(el('p', { class: 'mu' }, 'Sign up, complete onboarding, and start helping nearby drivers.'));

        const signUp = el('button', { class: 'btn', type: 'button' }, 'Sign up');
        signUp.addEventListener('click', () => router.navigate('/email?mode=signup'));
        screen.appendChild(signUp);
        const logIn = el('button', { class: 'btn soft', type: 'button' }, 'Log in');
        logIn.addEventListener('click', () => router.navigate('/email?mode=login'));
        screen.appendChild(logIn);

        if (CONFIG.ZD_DEBUG) {
          const apiLine = el('p', { class: 'mu' }, 'API: checking...');
          screen.appendChild(apiLine);
          try {
            const health = await apiFetch('/health', { auth: false });
            apiLine.textContent = health && health.db
              ? 'API: ' + health.db
              : 'API: up';
          } catch (err) {
            showError(err);
            apiLine.textContent = 'API: unreachable';
          }
        }

        const install = createInstallControl(ctx);
        if (install) screen.appendChild(install);
        screen.appendChild(el('p', { class: 'mu' }, 'App version ' + CONFIG.APP_VERSION));
        return screen;
      },
      narrow: true,
    },
    '/email': { path: '/email', load: () => import('./pages/email.js'), narrow: true },
    '/otp': { path: '/otp', load: () => import('./pages/otp.js'), narrow: true },
    '/type': { path: '/type', load: () => import('./pages/providerType.js'), auth: true, onboarding: true, narrow: true },
    '/profile-setup': { path: '/profile-setup', load: () => import('./pages/profileSetup.js'), auth: true, onboarding: true, narrow: true },
    '/documents': { path: '/documents', load: () => import('./pages/documents.js'), auth: true, narrow: true },
    '/pending': { path: '/pending', load: () => import('./pages/pending.js'), auth: true, onboarding: true, narrow: true },
    '/home': { path: '/home', load: () => import('./pages/home.js'), auth: true, approved: true, nav: true },
    '/job/:id': { path: '/job/:id', load: () => import('./pages/job.js'), auth: true, approved: true, desktopNav: true, navPath: '/home' },
    '/earnings': { path: '/earnings', load: () => import('./pages/earnings.js'), auth: true, approved: true, nav: true },
    '/inbox': { path: '/inbox', load: () => import('./pages/inbox.js'), auth: true, approved: true, nav: true },
    '/menu': { path: '/menu', load: () => import('./pages/menu.js'), auth: true, approved: true, nav: true },
    '/services': { path: '/services', load: () => import('./pages/services.js'), auth: true, approved: true, desktopNav: true, navPath: '/menu', narrow: true },
    '/vehicle': { path: '/vehicle', load: () => import('./pages/vehicle.js'), auth: true, approved: true, desktopNav: true, navPath: '/menu', narrow: true },
    '/payouts': { path: '/payouts', load: () => import('./pages/payouts.js'), auth: true, approved: true, desktopNav: true, navPath: '/menu', narrow: true },
    '/registration-fee': { path: '/registration-fee', load: () => import('./pages/registrationFee.js'), auth: true, approved: true, desktopNav: true, navPath: '/home', narrow: true },
  },
  defaultRoute: '/welcome',
  mount: document.getElementById('view'),
  navRoot,
  guard(route, ctx) {
    const session = getSession();
    if (isAuthed() && route.path === '/welcome') {
      return onboardingRoute(session);
    }
    if (route.approved && (!session || session.providerStatus !== 'approved')) {
      return onboardingRoute(session);
    }
    if (route.onboarding && session && session.providerStatus === 'approved'
      && !(route.path === '/profile-setup' && ctx.query.edit === 'true')) {
      return '/home';
    }
  },
  renderNav(route, ctx) {
    if (!navRoot) return;
    clear(navRoot);
    if (route.nav || route.desktopNav) {
      navRoot.appendChild(createBottomNav({ items: navItems, current: route.navPath || ctx.path }));
      renderProviderUnreadBadge(navRoot);
    }
  },
});

window.addEventListener('zd:apierror', (event) => {
  if (event.detail && event.detail.code === 'ZD-PROV-006') {
    router.navigate('/registration-fee');
  }
});

async function start() {
  if (isAuthed()) {
    try {
      await refreshMe();
    } catch (err) {
      showError(err);
    }
  }
  router.start();
}

start();
