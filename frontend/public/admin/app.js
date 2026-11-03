// admin/app.js
import { initErrors, showError } from '../shared/errors.js';
import { isAuthed, clearToken } from '../shared/auth.js';
import { apiFetch } from '../shared/api.js';
import { createRouter } from '../shared/router.js';
import { el, clear } from '../shared/ui.js';

initErrors();

let admin = null;

function renderAdminHeader(path) {
  const navRoot = document.getElementById('nav-root');
  if (!navRoot) return;
  clear(navRoot);

  const header = el('header', { class: 'admin-top' });
  const brand = el('span', { class: 'brand' }, 'ZOOM');
  brand.appendChild(el('b', {}, 'DRIVE'));
  brand.appendChild(document.createTextNode(' Admin'));
  header.appendChild(brand);

  const tabs = el('div', { class: 'admin-tabs' });
  const tabLinks = [
    { path: '/overview', label: 'Overview' },
    { path: '/providers', label: 'Providers' },
    { path: '/users', label: 'Users' },
    { path: '/services', label: 'Services' },
    { path: '/pricing', label: 'Pricing' },
    { path: '/payouts', label: 'Payouts' },
    { path: '/requests', label: 'Requests' },
    { path: '/revenue', label: 'Revenue' },
    { path: '/audit', label: 'Audit log' },
    { path: '/settings', label: 'Settings' },
  ];

  for (const tab of tabLinks) {
    const isOn = path.startsWith(tab.path);
    const a = el('a', { href: '#/' + tab.path, class: isOn ? 'on' : '' }, tab.label);
    tabs.appendChild(a);
  }
  header.appendChild(tabs);

  const who = el('div', { class: 'admin-who' });
  who.appendChild(el('span', {}, admin ? admin.email : ''));
  const logoutBtn = el('button', { class: 'btn soft-style small', type: 'button' }, 'Log out');
  logoutBtn.addEventListener('click', () => {
    clearToken();
    admin = null;
    location.hash = '#/login';
  });
  who.appendChild(logoutBtn);
  header.appendChild(who);
  navRoot.appendChild(header);
}

export function setAdmin(adminData) {
  admin = adminData;
  const path = location.hash.slice(1).split('?')[0];
  if (admin && path && path !== '/login') {
    renderAdminHeader(path);
  }
}

export function getAdmin() {
  return admin;
}

async function fetchAdmin() {
  try {
    const data = await apiFetch('/admin/auth/me', { method: 'GET', auth: true });
    admin = data.admin;
  } catch (e) {
    if (e && e.code === 'ZD-AUTH-001') {
      admin = null;
    } else {
      throw e;
    }
  }
}

if (isAuthed()) {
  fetchAdmin().catch((err) => {
    admin = null;
    showError(err);
  });
}

const router = createRouter({
  routes: {
    '/login': {
      path: '/login',
      load: () => import('./login.js'),
      title: 'Admin sign in',
    },
    '/overview': {
      path: '/overview',
      load: () => import('./pages/overview.js'),
      nav: true,
    },
    '/providers': {
      path: '/providers',
      load: () => import('./pages/providers.js'),
      nav: true,
    },
    '/providers/:userId': {
      path: '/providers/:userId',
      load: () => import('./pages/providerDetail.js'),
      nav: true,
    },
    '/payouts': {
      path: '/payouts',
      load: () => import('./pages/payouts.js'),
      nav: true,
    },
    '/payouts/:providerId': {
      path: '/payouts/:providerId',
      load: () => import('./pages/payouts.js'),
      nav: true,
    },
    '/requests': {
      path: '/requests',
      load: () => import('./pages/requests.js'),
      nav: true,
    },
    '/requests/:id': {
      path: '/requests/:id',
      load: () => import('./pages/requests.js'),
      nav: true,
    },
    '/revenue': {
      path: '/revenue',
      load: () => import('./pages/revenue.js'),
      nav: true,
    },
    '/audit': {
      path: '/audit',
      load: () => import('./pages/audit.js'),
      nav: true,
    },
    '/users': {
      path: '/users',
      load: () => import('./pages/users.js'),
      nav: true,
    },
    '/services': {
      path: '/services',
      load: () => import('./pages/services.js'),
      nav: true,
    },
    '/pricing': {
      path: '/pricing',
      load: () => import('./pages/pricing.js'),
      nav: true,
    },
    '/settings': {
      path: '/settings',
      load: () => import('./pages/settings.js'),
      nav: true,
    },
  },
  defaultRoute: '/login',
  mount: document.getElementById('view'),
  navRoot: document.getElementById('nav-root'),
  guard(route, ctx) {
    if (!isAuthed() && route.path !== '/login') {
      return '/login';
    }
    if (isAuthed() && route.path === '/login') {
      return '/overview';
    }
  },
  renderNav(route, ctx) {
    if (route.nav) {
      renderAdminHeader(ctx.path);
    }
  },
});

router.start();
