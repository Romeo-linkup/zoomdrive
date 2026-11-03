import { apiFetch } from '../shared/api.js';
import { showError } from '../shared/errors.js';

let lastFetchAt = 0;
let cachedUnreadCount = null;

export function renderProviderUnreadBadge(navRoot) {
  if (!navRoot) return;
  const inboxButton = navRoot.querySelector('.nav-item[data-path="/inbox"]');
  if (!inboxButton) return;

  const icon = inboxButton.querySelector('.ico');
  const existingDot = icon && icon.querySelector('.notification-nav-dot');
  inboxButton.setAttribute('aria-label', cachedUnreadCount > 0
    ? 'Inbox, ' + cachedUnreadCount + ' unread notifications'
    : 'Inbox');

  if (cachedUnreadCount > 0 && icon && !existingDot) {
    const dot = document.createElement('span');
    dot.className = 'dot notification-nav-dot';
    dot.setAttribute('aria-hidden', 'true');
    icon.appendChild(dot);
  } else if (cachedUnreadCount <= 0 && existingDot) {
    existingDot.remove();
  }
}

export function setProviderUnreadCount(count) {
  const number = Number(count);
  cachedUnreadCount = Number.isFinite(number) ? Math.max(0, number) : 0;
  renderProviderUnreadBadge(document.getElementById('nav-root'));
}

export async function refreshProviderUnreadCount() {
  const now = Date.now();
  if (now - lastFetchAt < 60000) return;
  lastFetchAt = now;
  try {
    const data = await apiFetch('/notifications?unreadOnly=true&page=1');
    setProviderUnreadCount(data.unreadCount);
  } catch (err) {
    showError(err);
  }
}
