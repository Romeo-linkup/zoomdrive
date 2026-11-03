// Environment config. This is the ONLY file allowed to mention localhost (check rule 4).
const host = window.location.hostname;
const IS_LOCAL = host === 'localhost' || host === '127.0.0.1';
const IS_LAN = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);

// Set the real production API origin in task P14.2.
const PROD_API_ORIGIN = 'https://zoomdrive.onrender.com';

const apiOrigin = IS_LOCAL ? 'http://localhost:4000' : IS_LAN ? `http://${host}:4000` : PROD_API_ORIGIN;

// Which app is running: set on <body data-app="driver|provider|admin"> in each index.html.
export const APP_ID = (document.body && document.body.dataset.app) || 'landing';
export const SUPPORT_EMAIL = 'support@zoomdrive.co.za'; // Placeholder until the domain is confirmed.

export const CONFIG = Object.freeze({
  APP_VERSION: '0.4.0',
  API_BASE: `${apiOrigin}/api/v1`,
  ZD_DEBUG: IS_LOCAL || IS_LAN,
  APPS: Object.freeze({
    driver: Object.freeze({ id: 'driver', name: 'ZoomDrive', path: '/driver/' }),
    provider: Object.freeze({ id: 'provider', name: 'ZoomDrive Partner', path: '/provider/' }),
    admin: Object.freeze({ id: 'admin', name: 'ZoomDrive Admin', path: '/admin/' }),
  }),
  // Driver and provider apps share one origin, so each keeps its own token key.
  TOKEN_KEY: `zd_token_${APP_ID}`,
});
