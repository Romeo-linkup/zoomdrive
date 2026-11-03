// shared/router.js
import { APP_ID } from './config.js';
import { isAuthed } from './auth.js';
import { clear, spinner } from './ui.js';
import { clearError, clearFieldErrors, renderPageError } from './errors.js';

export function goToLogin(nextPath) {
  return '/phone?next=' + encodeURIComponent(nextPath);
}

export function consumeNext(fallback = '/home') {
  try {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const next = params.get('next');
    if (next && typeof next === 'string') {
      if (next.startsWith('/') && !next.startsWith('//') && next.indexOf(':') === -1) {
        return next;
      }
    }
  } catch (e) {
    try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ }
  }
  return fallback;
}

export function createRouter({ routes, defaultRoute = '/welcome', guard, mount, navRoot, renderNav, onRouteChange }) {
  let currentPath = '';
  let currentController = null;
  let leaveCallbacks = [];
  let redirectCount = 0;
  const MAX_REDIRECTS = 5;

  function parseHash(hash) {
    if (!hash || hash === '#') {
      return { path: '', params: {}, query: {} };
    }
    const withoutHash = hash.startsWith('#') ? hash.slice(1) : hash;
    const [pathPart, queryPart] = withoutHash.split('?');
    const path = pathPart || '';
    const query = {};
    if (queryPart) {
      try {
        const params = new URLSearchParams(queryPart);
        for (const [key, value] of params) {
          query[key] = value;
        }
      } catch (e) {
        try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ }
      }
    }
    return { path, params: {}, query };
  }

  function matchRoute(path) {
    if (!routes) return null;
    for (const pattern of Object.keys(routes)) {
      const patternParts = pattern.split('/');
      const pathParts = path.split('/');
      if (patternParts.length !== pathParts.length) continue;
      const params = {};
      let match = true;
      for (let i = 0; i < patternParts.length; i++) {
        const pp = patternParts[i];
        const pv = pathParts[i];
        if (pp.startsWith(':')) {
          params[pp.slice(1)] = pv;
        } else if (pp !== pv) {
          match = false;
          break;
        }
      }
      if (match) {
        return { route: routes[pattern], params };
      }
    }
    return null;
  }

  function cleanup() {
    leaveCallbacks.forEach(fn => {
      try { fn(); } catch (e) { try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ } }
    });
    leaveCallbacks = [];
    if (currentController) {
      try { currentController.abort(); } catch (e) { /* Abort cleanup is best-effort. */ }
      currentController = null;
    }
  }

  async function handleRoute() {
    const hash = window.location.hash;
    const { path, query } = parseHash(hash);
    if (!path) {
      navigate(defaultRoute, { replace: true });
      return;
    }
    redirectCount = 0;
    await processRoute(path, query);
  }

  async function processRoute(path, query, replace = false) {
    redirectCount++;
    if (redirectCount > MAX_REDIRECTS) {
      try { console.debug('Too many redirects'); } catch (e) { /* Optional debug output can be skipped. */ }
      return;
    }

    cleanup();
    clearError();
    clearFieldErrors(mount);

    const matched = matchRoute(path);
    if (!matched) {
      navigate(defaultRoute, { replace: true });
      return;
    }

    const { route, params } = matched;

    if (route.auth && !isAuthed()) {
      const currentPathAndQuery = path + (Object.keys(query).length ? '?' + new URLSearchParams(query).toString() : '');
      navigate(goToLogin(currentPathAndQuery), { replace: true });
      return;
    }

    const ctx = {
      path,
      params,
      query,
      app: APP_ID,
      navigate,
      onLeave(fn) {
        leaveCallbacks.push(fn);
      },
      signal: null,
    };

    currentController = new AbortController();
    ctx.signal = currentController.signal;

    if (guard) {
      try {
        const redirect = guard(route, ctx);
        if (redirect && typeof redirect === 'string') {
          navigate(redirect, { replace: true });
          return;
        }
      } catch (e) {
        try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ }
      }
    }

    currentPath = path;

    try {
      clear(mount);
      mount.appendChild(spinner());

      let renderFn = route.render;
      if (route.load) {
        const mod = await route.load();
        if (mod && mod.default) {
          renderFn = mod.default;
        }
      }

      if (!renderFn) {
        clear(mount);
        return;
      }

      const node = await renderFn(ctx);
      clear(mount);
      if (node instanceof Node) {
        mount.appendChild(node);
      }

      window.scrollTo(0, 0);
      try { mount.focus(); } catch (e) { /* Focus restoration is best-effort. */ }

      if (route.title) {
        document.title = String(route.title);
      }

      if (route.nav && navRoot && renderNav) {
        try { renderNav(route, ctx); } catch (e) { try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ } }
      } else if (navRoot) {
        clear(navRoot);
      }

      const appEl = document.querySelector('.app');
      if (appEl) {
        if (route.nav) {
          appEl.classList.remove('no-nav');
        } else {
          appEl.classList.add('no-nav');
        }
      }

      if (onRouteChange) {
        try { onRouteChange(route, ctx); } catch (e) { try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ } }
      }
    } catch (err) {
      clear(mount);
      renderPageError(mount, err, () => processRoute(path, query, replace));
    }
  }

  function navigate(path, { replace = false } = {}) {
    const hash = '#' + path;
    if (replace) {
      location.replace(hash);
    } else {
      location.hash = hash;
    }
  }

  function current() {
    return currentPath;
  }

  function start() {
    handleRoute();
    window.addEventListener('hashchange', handleRoute);
  }

  return { start, navigate, current };
}
