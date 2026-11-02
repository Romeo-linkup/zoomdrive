import { apiFetch } from '../../shared/api.js';
import { showError } from '../../shared/errors.js';
import { clear, el, formatDate, formatZAR, modal } from '../../shared/ui.js';
import { isAuthed } from '../../shared/auth.js';
import { goToLogin } from '../../shared/router.js';
import { createBrandBar } from '../../shared/components/topbar.js';
import { createStatusBadge } from '../../shared/components/status-badge.js';

const ACTIVE_STATUSES = ['searching', 'accepted', 'arrived'];
const TERMINAL_STATUSES = ['completed', 'cancelled', 'expired'];

function displayStatus(status) {
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'expired') return 'Expired';
  if (ACTIVE_STATUSES.includes(status)) return 'In progress';
  return status || 'Unknown';
}

function statusBadge(status) {
  let badge;
  if (status === 'completed') badge = createStatusBadge('approved');
  else if (ACTIVE_STATUSES.includes(status)) badge = createStatusBadge('pending');
  else badge = createStatusBadge('offline');
  badge.textContent = displayStatus(status);
  return badge;
}

function requestPath(request) {
  return request.status === 'searching'
    ? '/searching/' + encodeURIComponent(request.id)
    : '/track/' + encodeURIComponent(request.id);
}

function makeRequestRow(request, onClick) {
  const row = el('button', { class: 'item request-row', type: 'button' });
  row.appendChild(el('div', { class: 'ic' }, request.service && request.service.icon ? request.service.icon : '🚗'));
  const info = el('div', { class: 't' });
  info.appendChild(el('span', {}, request.service && request.service.name ? request.service.name : 'Roadside assistance'));
  info.appendChild(el('small', {}, formatDate(request.completedAt || request.createdAt)));
  row.appendChild(info);
  const detail = el('div', { class: 'request-row-detail' });
  detail.appendChild(statusBadge(request.status));
  detail.appendChild(el('small', {}, formatZAR(request.totalCents)));
  row.appendChild(detail);
  row.addEventListener('click', onClick);
  return row;
}

export default function render(ctx) {
  let active = true;
  let page = 0;
  let pageSize = 0;
  let total = 0;
  let loading = false;
  let failedPage = null;
  const activeRequests = [];
  const pastRequests = [];
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createBrandBar('driver'));

  if (!isAuthed()) {
    const empty = el('div', { class: 'empty' });
    empty.appendChild(el('div', { class: 'ico' }, '📋'));
    empty.appendChild(el('div', {}, 'Sign in to see your activity'));
    const btn = el('button', { class: 'btn', type: 'button' }, 'Log in or sign up');
    btn.addEventListener('click', () => ctx.navigate(goToLogin('/activity')));
    empty.appendChild(btn);
    screen.appendChild(empty);
    return screen;
  }

  screen.appendChild(el('h1', {}, 'Activity'));
  const inProgressSection = el('section', { class: 'activity-section hidden' });
  inProgressSection.appendChild(el('h2', {}, 'In progress'));
  const inProgressList = el('div');
  inProgressSection.appendChild(inProgressList);
  screen.appendChild(inProgressSection);

  const upcomingSection = el('section', { class: 'activity-section' });
  upcomingSection.appendChild(el('h2', {}, 'Upcoming'));
  const upcomingEmpty = el('div', { class: 'empty upcoming-empty' });
  upcomingEmpty.appendChild(el('div', {}, 'No trips yet'));
  upcomingEmpty.appendChild(el('p', { class: 'mu' }, 'Your past requests will appear here.'));
  upcomingSection.appendChild(upcomingEmpty);
  screen.appendChild(upcomingSection);

  const pastSection = el('section', { class: 'activity-section' });
  pastSection.appendChild(el('h2', {}, 'Past'));
  const pastList = el('div');
  pastSection.appendChild(pastList);
  const emptyPast = el('div', { class: 'empty hidden' }, 'No requests yet');
  pastSection.appendChild(emptyPast);
  const loadMore = el('button', { class: 'btn soft hidden', type: 'button' }, 'Load more');
  pastSection.appendChild(loadMore);
  screen.appendChild(pastSection);

  const retry = el('button', { class: 'btn soft hidden', type: 'button' }, 'Retry');
  screen.appendChild(retry);

  function renderRequestLists() {
    clear(inProgressList);
    clear(pastList);
    inProgressSection.classList.toggle('hidden', activeRequests.length === 0);
    activeRequests.forEach((request) => {
      inProgressList.appendChild(makeRequestRow(request, () => ctx.navigate(requestPath(request))));
    });
    pastRequests.forEach((request) => {
      pastList.appendChild(makeRequestRow(request, () => openRequestDetails(request)));
    });
    emptyPast.classList.toggle('hidden', pastRequests.length > 0 || loading);
    const hasMore = page > 0 && page * pageSize < total;
    loadMore.classList.toggle('hidden', !hasMore);
    loadMore.disabled = loading;
  }

  function openRequestDetails(request) {
    const body = el('div', { class: 'request-detail-skeleton' },
      el('div', { class: 'zd-skeleton', attrs: { 'aria-hidden': 'true' } })
    );
    modal({
      title: 'Request details',
      body,
      actions: [{ label: 'Close', kind: 'soft', value: false }],
    });
    apiFetch('/requests/' + encodeURIComponent(request.id), { signal: ctx.signal }).then((data) => {
      if (!active) return;
      const detail = data.request;
      clear(body);
      body.appendChild(el('div', { class: 'line' },
        el('span', {}, 'Service'),
        el('b', {}, detail.service && detail.service.name ? detail.service.name : 'Roadside assistance')
      ));
      body.appendChild(el('div', { class: 'line' }, el('span', {}, 'Status'), statusBadge(detail.status)));
      body.appendChild(el('div', { class: 'line' },
        el('span', {}, 'Address'),
        el('b', {}, detail.addressText || 'Not provided')
      ));
      body.appendChild(el('div', { class: 'line' },
        el('span', {}, 'Total'),
        el('b', {}, formatZAR(detail.price && detail.price.totalCents))
      ));
      body.appendChild(el('div', { class: 'line' },
        el('span', {}, 'Service price'),
        el('b', {}, formatZAR(detail.price && detail.price.servicePriceCents))
      ));
      body.appendChild(el('div', { class: 'line' },
        el('span', {}, 'Distance fee'),
        el('b', {}, formatZAR(detail.price && detail.price.distanceFeeCents))
      ));
      body.appendChild(el('div', { class: 'line' },
        el('span', {}, 'Date'),
        el('b', {}, formatDate(detail.completedAt || detail.createdAt))
      ));
      if (detail.provider && detail.provider.firstName) {
        body.appendChild(el('div', { class: 'line' }, el('span', {}, 'Provider'), el('b', {}, detail.provider.firstName)));
      }
    }).catch((err) => {
      if (!active || ctx.signal.aborted) return;
      clear(body);
      body.appendChild(el('p', {}, 'Request details could not be loaded.'));
      showError(err);
    });
  }

  async function loadPage(nextPage) {
    if (loading || !active) return;
    loading = true;
    retry.classList.add('hidden');
    loadMore.disabled = true;
    try {
      const data = await apiFetch('/requests?page=' + encodeURIComponent(nextPage), { signal: ctx.signal });
      if (!active) return;
      page = data.page;
      pageSize = data.pageSize;
      total = data.total;
      failedPage = null;
      (data.requests || []).forEach((request) => {
        if (ACTIVE_STATUSES.includes(request.status)) {
          if (!activeRequests.some((item) => item.id === request.id)) activeRequests.push(request);
        } else if (TERMINAL_STATUSES.includes(request.status)) {
          if (!pastRequests.some((item) => item.id === request.id)) pastRequests.push(request);
        }
      });
    } catch (err) {
      if (!active || ctx.signal.aborted) return;
      failedPage = nextPage;
      retry.classList.remove('hidden');
      showError(err);
    } finally {
      loading = false;
      if (active) renderRequestLists();
    }
  }

  loadMore.addEventListener('click', () => loadPage(page + 1));
  retry.addEventListener('click', () => loadPage(failedPage || 1));
  ctx.onLeave(() => {
    active = false;
  });
  loadPage(1);
  return screen;
}
