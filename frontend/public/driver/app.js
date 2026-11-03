// driver/app.js
import { APP_ID } from '../shared/config.js';
import { initErrors, showError } from '../shared/errors.js';
import { registerServiceWorker, initInstallPrompt, initOfflineNotice } from '../shared/pwa.js';
import { isAuthed, refreshMe, getSession } from '../shared/auth.js';
import { createRouter } from '../shared/router.js';
import { createBottomNav } from '../shared/components/bottom-nav.js';
import { clear, toast } from '../shared/ui.js';

initErrors();
registerServiceWorker(APP_ID);
initInstallPrompt();
initOfflineNotice();

const paymentReturnParams = new URLSearchParams(location.search);
const paymentReference = paymentReturnParams.get('reference') || paymentReturnParams.get('trxref');
const rideReference = paymentReference && paymentReference.match(/^zd_ride_(\d+)_/);
if (rideReference) {
  history.replaceState(history.state, '', location.pathname + location.hash);
  location.hash = '#/pay/' + encodeURIComponent(rideReference[1]) + '?check=1';
  toast('Checking your payment...', 'info');
} else if (paymentReference && paymentReference.startsWith('zd_plus_')) {
  history.replaceState(history.state, '', location.pathname + location.hash);
  location.hash = '#/plus';
  const nextHistoryState = history.state && typeof history.state === 'object' ? { ...history.state } : {};
  nextHistoryState.plusPaymentReturn = true;
  history.replaceState(nextHistoryState, '', location.pathname + location.hash);
  toast('Checking your payment...', 'info');
}

if (isAuthed()) {
  refreshMe().catch((err) => {
    showError(err);
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
const navRoot = document.getElementById('nav-root');

const router = createRouter({
  routes: {
    '/welcome': {
      path: '/welcome',
      load: () => import('./pages/welcome.js'),
      title: 'ZoomDrive',
      narrow: true,
    },
    '/email': {
      path: '/email',
      load: () => import('./pages/email.js'),
      narrow: true,
    },
    '/otp': {
      path: '/otp',
      load: () => import('./pages/otp.js'),
      narrow: true,
    },
    '/profile-setup': {
      path: '/profile-setup',
      load: () => import('./pages/profileSetup.js'),
      auth: true,
      narrow: true,
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
    '/inbox': {
      path: '/inbox',
      load: () => import('./pages/inbox.js'),
      auth: true,
      nav: false,
      desktopNav: true,
      navPath: '/account',
    },
    '/plus': {
      path: '/plus',
      load: () => import('./pages/plus.js'),
      auth: true,
      nav: true,
      navPath: '/account',
      narrow: true,
    },
    '/saved-places': {
      path: '/saved-places',
      load: () => import('./pages/savedPlaces.js'),
      auth: true,
      nav: true,
      navPath: '/account',
    },
    '/payment': {
      path: '/payment',
      load: () => import('./pages/paymentMethods.js'),
      auth: true,
      nav: true,
      navPath: '/account',
    },
    '/safety': {
      path: '/safety',
      load: () => import('./pages/safety.js'),
      nav: true,
      navPath: '/account',
    },
    '/support': {
      path: '/support',
      load: () => import('./pages/support.js'),
      nav: true,
      navPath: '/account',
    },
    '/settings': {
      path: '/settings',
      load: () => import('./pages/settings.js'),
      auth: true,
      nav: true,
      navPath: '/account',
    },
    '/request': {
      path: '/request',
      needsProfile: true,
      nav: false,
      desktopNav: true,
      navPath: '/home',
      load: () => import('./pages/request.js'),
    },
    '/searching/:id': {
      path: '/searching/:id',
      load: () => import('./pages/searching.js'),
      auth: true,
      nav: false,
      desktopNav: true,
      navPath: '/home',
    },
    '/track/:id': {
      path: '/track/:id',
      load: () => import('./pages/track.js'),
      auth: true,
      nav: false,
      desktopNav: true,
      navPath: '/home',
    },
    '/rate/:id': {
      path: '/rate/:id',
      load: () => import('./pages/rate.js'),
      auth: true,
      nav: false,
      desktopNav: true,
      navPath: '/activity',
      narrow: true,
    },
    '/pay/:id': {
      path: '/pay/:id',
      load: () => import('./pages/pay.js'),
      auth: true,
      nav: false,
      desktopNav: true,
      navPath: '/activity',
      narrow: true,
    },
  },
  defaultRoute: '/welcome',
  mount: document.getElementById('view'),
  navRoot: document.getElementById('nav-root'),
  guard(route, ctx) {
    if (isAuthed()) {
      if (route.path === '/welcome' || (route.path === '/email' && ctx.query.mode !== 'login')) {
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
    if (route.nav || route.desktopNav) {
      clear(navRoot);
      navRoot.appendChild(createBottomNav({ items: navItems, current: route.navPath || ctx.path }));
    }
  },
});

if (!location.hash && isAuthed()) {
  location.hash = '#/home';
}

router.start();
