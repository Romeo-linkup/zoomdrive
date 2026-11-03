import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError } from '../../shared/errors.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, formatRelativeTime } from '../../shared/ui.js';
import { refreshProviderUnreadCount, setProviderUnreadCount } from '../notificationsBadge.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    await renderInbox(ctx, screen);
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderInbox(ctx, screen) {
  let active = true;
  let loading = false;
  let page = 0;
  let pageSize = 0;
  let total = 0;
  let unreadCount = 0;
  let retryPage = 1;
  const notifications = [];
  const listeners = new AbortController();
  let rowListeners = new AbortController();
  screen.appendChild(createTopbar({ title: 'Inbox' }));
  const markAll = el('button', { class: 'btn soft', type: 'button' }, 'Mark all read');
  const list = el('div');
  const empty = el('div', { class: 'empty hidden' }, 'No notifications yet');
  const loadMore = el('button', { class: 'btn soft hidden', type: 'button' }, 'Load more');
  const retry = el('button', { class: 'btn soft hidden', type: 'button' }, 'Retry');
  screen.appendChild(markAll);
  screen.appendChild(list);
  screen.appendChild(empty);
  screen.appendChild(loadMore);
  screen.appendChild(retry);

  async function navigateFor(notification) {
    const requestId = notification.data && notification.data.requestId;
    if (!requestId || notification.kind !== 'offer_received') return;
    try {
      const data = await apiFetch('/providers/me/offers', { signal: ctx.signal });
      if (!active || ctx.signal.aborted) return;
      const isActive = (data.offers || []).some((offer) => String(offer.requestId) === String(requestId));
      if (isActive) ctx.navigate('/job/' + encodeURIComponent(requestId));
    } catch (err) {
      if (active && !ctx.signal.aborted) showError(err);
    }
  }

  function renderRows() {
    rowListeners.abort();
    rowListeners = new AbortController();
    list.textContent = '';
    notifications.forEach((notification) => {
      const row = el('button', { class: 'item notification-row', type: 'button' });
      const text = el('div', { class: 't' });
      text.appendChild(el('span', {}, notification.title || 'Notification'));
      text.appendChild(el('small', {}, notification.body || ''));
      text.appendChild(el('small', {}, formatRelativeTime(notification.createdAt)));
      row.appendChild(text);
      let unreadDot = null;
      if (!notification.readAt) {
        unreadDot = el('span', {
          class: 'dot notification-unread-dot',
          attrs: { 'aria-label': 'Unread notification' },
        });
        row.appendChild(unreadDot);
      }
      row.addEventListener('click', async () => {
        if (!active) return;
        const wasUnread = !notification.readAt;
        notification.readAt = notification.readAt || new Date().toISOString();
        if (wasUnread) unreadCount = Math.max(0, unreadCount - 1);
        setProviderUnreadCount(unreadCount);
        if (unreadDot) unreadDot.remove();
        try {
          await apiFetch('/notifications/' + encodeURIComponent(notification.id) + '/read', {
            method: 'POST',
            signal: ctx.signal,
          });
        } catch {
          if (!active || ctx.signal.aborted) return;
        }
        if (active) await navigateFor(notification);
      }, { signal: rowListeners.signal });
      list.appendChild(row);
    });
    empty.classList.toggle('hidden', notifications.length > 0 || !page);
    loadMore.classList.toggle('hidden', !(page > 0 && page * pageSize < total));
    loadMore.disabled = loading;
    markAll.disabled = unreadCount === 0;
  }

  async function loadPage(nextPage) {
    if (loading || !active) return;
    loading = true;
    retry.classList.add('hidden');
    loadMore.disabled = true;
    retryPage = nextPage;
    try {
      const data = await apiFetch('/notifications?page=' + encodeURIComponent(nextPage), { signal: ctx.signal });
      if (!active) return;
      page = Number(data.page) || nextPage;
      pageSize = Number(data.pageSize) || (Array.isArray(data.notifications) ? data.notifications.length : 0);
      total = Number(data.total) || 0;
      unreadCount = Number(data.unreadCount) || 0;
      setProviderUnreadCount(unreadCount);
      if (nextPage === 1) notifications.length = 0;
      (data.notifications || []).forEach((notification) => notifications.push(notification));
    } catch (err) {
      if (!active || ctx.signal.aborted) return;
      showError(err);
      retry.classList.remove('hidden');
    } finally {
      loading = false;
      if (active) renderRows();
    }
  }

  markAll.addEventListener('click', async () => {
    if (!active || unreadCount === 0) return;
    markAll.disabled = true;
    try {
      await apiFetch('/notifications/read-all', { method: 'POST', signal: ctx.signal });
      if (!active) return;
      notifications.forEach((notification) => {
        notification.readAt = notification.readAt || new Date().toISOString();
      });
      list.querySelectorAll('.notification-unread-dot').forEach((dot) => dot.remove());
      unreadCount = 0;
      setProviderUnreadCount(unreadCount);
      markAll.disabled = true;
    } catch (err) {
      if (active && !ctx.signal.aborted) showError(err);
      markAll.disabled = unreadCount === 0;
    }
  }, { signal: listeners.signal });
  loadMore.addEventListener('click', () => loadPage(page + 1), { signal: listeners.signal });
  retry.addEventListener('click', () => loadPage(retryPage), { signal: listeners.signal });
  ctx.onLeave(() => {
    active = false;
    listeners.abort();
    rowListeners.abort();
    refreshProviderUnreadCount();
  });
  await loadPage(1);
}