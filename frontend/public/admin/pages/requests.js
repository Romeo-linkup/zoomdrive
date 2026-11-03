import { apiFetch } from '../../shared/api.js';
import { clearError, renderPageError, showError } from '../../shared/errors.js';
import { createStatusBadge } from '../../shared/components/status-badge.js';
import { clear, el, formatDate, formatZAR, modal, toast, withSpinner } from '../../shared/ui.js';

const STATUSES = [
  ['all', 'All statuses'],
  ['searching', 'Searching'],
  ['accepted', 'Accepted'],
  ['arrived', 'Arrived'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
  ['expired', 'Expired'],
];

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    if (ctx.params.id) {
      await renderRequestDetail(ctx, screen);
    } else {
      await renderRequestList(ctx, screen);
    }
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderRequestList(ctx, screen) {
  const heading = el('div', { class: 'page-head' });
  heading.appendChild(el('h1', {}, 'Requests'));
  screen.appendChild(heading);
  const filters = el('div', { class: 'filters' });
  const status = el('select', { attrs: { 'aria-label': 'Filter requests by status' } });
  STATUSES.forEach(([value, label]) => status.appendChild(el('option', { value }, label)));
  const initialStatus = ctx.query.status || 'all';
  status.value = STATUSES.some(([value]) => value === initialStatus) ? initialStatus : 'all';
  const search = el('input', {
    type: 'search',
    placeholder: 'Search driver, phone or request ID',
    attrs: { 'aria-label': 'Search requests' },
  });
  search.value = ctx.query.q || '';
  filters.appendChild(status);
  filters.appendChild(search);
  screen.appendChild(filters);

  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'tbl' });
  const head = el('thead');
  const header = el('tr');
  ['Request', 'Service', 'Driver', 'Provider', 'Total', 'Status', 'Offers', 'Created'].forEach((label) => {
    header.appendChild(el('th', {}, label));
  });
  head.appendChild(header);
  const tbody = el('tbody');
  table.appendChild(head);
  table.appendChild(tbody);
  wrap.appendChild(table);
  screen.appendChild(wrap);
  const pager = el('div', { class: 'pager' });
  screen.appendChild(pager);

  let currentPage = 1;
  let pageSize = 25;
  let total = 0;
  let searchTimer = null;
  let requestState = status.value;

  function renderRows(requests) {
    clear(tbody);
    if (!requests.length) {
      tbody.appendChild(emptyRow(8, 'No requests found.'));
      return;
    }
    requests.forEach((request) => {
      const row = el('tr', { class: 'clickable' });
      row.addEventListener('click', () => ctx.navigate('/requests/' + encodeURIComponent(request.id)));
      row.appendChild(el('td', {}, '#' + request.id));
      row.appendChild(el('td', {}, (request.service && request.service.icon ? request.service.icon + ' ' : '') +
        (request.service ? request.service.name : 'Unknown service')));
      row.appendChild(el('td', {}, [request.driver.firstName, request.driver.lastName].filter(Boolean).join(' ')));
      const providerCell = el('td', {}, request.provider
        ? [request.provider.firstName, request.provider.lastName].filter(Boolean).join(' ')
        : 'Unassigned');
      if (request.assignedByAdmin) providerCell.appendChild(el('small', { class: 'admin-inline-marker' }, 'Admin assigned'));
      row.appendChild(providerCell);
      row.appendChild(el('td', {}, formatZAR(request.totalCents)));
      const statusCell = el('td');
      statusCell.appendChild(createStatusBadge(request.status));
      if (request.noProvidersOffered) {
        statusCell.appendChild(el('span', { class: 'badge rejected admin-inline-marker' }, 'No providers offered'));
      }
      row.appendChild(statusCell);
      row.appendChild(el('td', {}, String(request.offersSent)));
      row.appendChild(el('td', {}, formatDate(request.createdAt, 'datetime')));
      tbody.appendChild(row);
    });
  }

  function renderPager() {
    clear(pager);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const previous = el('button', { class: 'btn soft', type: 'button' }, 'Previous');
    previous.disabled = currentPage <= 1;
    previous.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage -= 1;
        load();
      }
    });
    const next = el('button', { class: 'btn soft', type: 'button' }, 'Next');
    next.disabled = currentPage >= pageCount;
    next.addEventListener('click', () => {
      if (currentPage < pageCount) {
        currentPage += 1;
        load();
      }
    });
    pager.appendChild(previous);
    pager.appendChild(el('span', {}, 'Page ' + currentPage + ' of ' + pageCount + ' (' + total + ' total)'));
    pager.appendChild(next);
  }

  async function load() {
    clearError();
    const params = new URLSearchParams();
    params.set('status', requestState);
    params.set('page', String(currentPage));
    if (search.value.trim()) params.set('q', search.value.trim());
    try {
      const data = await apiFetch('/admin/requests?' + params.toString(), { signal: ctx.signal });
      if (ctx.signal.aborted) return;
      pageSize = data.pageSize || pageSize;
      currentPage = data.page || currentPage;
      total = data.total || 0;
      renderRows(Array.isArray(data.requests) ? data.requests : []);
      renderPager();
    } catch (err) {
      if (!ctx.signal.aborted) {
        showError(err);
        renderRows([]);
        total = 0;
        renderPager();
      }
    }
  }

  status.addEventListener('change', () => {
    requestState = status.value;
    currentPage = 1;
    load();
  });
  search.addEventListener('input', () => {
    if (searchTimer !== null) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTimer = null;
      currentPage = 1;
      load();
    }, 400);
  });
  ctx.onLeave(() => {
    if (searchTimer !== null) clearTimeout(searchTimer);
  });
  await load();
}

async function renderRequestDetail(ctx, screen) {
  const requestId = encodeURIComponent(ctx.params.id);
  const back = el('a', { href: '#/requests', class: 'link-btn' }, '← Requests');
  screen.appendChild(back);
  const content = el('div');
  screen.appendChild(content);
  let refreshTimer = null;
  let active = true;
  let busy = false;
  let currentDetail = null;
  let currentTimeline = [];

  function isActiveRequest(request) {
    return request && ['searching', 'accepted', 'arrived'].includes(request.status);
  }

  function stopRefresh() {
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleRefresh() {
    stopRefresh();
    if (!active || busy || !isActiveRequest(currentDetail && currentDetail.request)) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      loadDetail(true);
    }, 10000);
  }

  async function loadDetail(isPoll = false) {
    clearError();
    try {
      const [data, timeline] = await Promise.all([
        apiFetch('/admin/requests/' + requestId, { signal: ctx.signal }),
        apiFetch('/admin/requests/' + requestId + '/timeline', { signal: ctx.signal }),
      ]);
      if (!active || ctx.signal.aborted) return;
      currentDetail = data;
      currentTimeline = Array.isArray(timeline.events) ? timeline.events : [];
      renderDetail(data, currentTimeline);
    } catch (err) {
      if (!active || ctx.signal.aborted) return;
      showError(err);
      if (!isPoll) renderPageError(content, err, () => loadDetail(false));
    } finally {
      scheduleRefresh();
    }
  }

  function renderDetail(data, timeline) {
    clear(content);
    const request = data.request;
    const summary = el('section', { class: 'card admin-request-summary' });
    const title = el('h1', {}, '#' + request.id + ' · ' +
      (request.service ? request.service.name : 'Request'));
    summary.appendChild(title);
    summary.appendChild(createStatusBadge(request.status));
    summary.appendChild(el('p', {}, request.addressText || 'Address not provided'));
    const timeInfo = el('dl', { class: 'kv' });
    appendKv(timeInfo, 'Created', formatDate(request.createdAt, 'datetime'));
    appendKv(timeInfo, 'Expires', formatDate(request.expiresAt, 'datetime'));
    appendKv(timeInfo, 'Accepted', formatDate(request.acceptedAt, 'datetime'));
    appendKv(timeInfo, 'Arrived', formatDate(request.arrivedAt, 'datetime'));
    appendKv(timeInfo, 'Completed', formatDate(request.completedAt, 'datetime'));
    appendKv(timeInfo, 'Driver', [request.driver && request.driver.firstName,
      request.driver && request.driver.lastName].filter(Boolean).join(' '));
    appendKv(timeInfo, 'Provider', request.provider
      ? [request.provider.firstName, request.provider.lastName].filter(Boolean).join(' ')
      : 'Unassigned');
    summary.appendChild(timeInfo);

    const price = request.price || {};
    const commissionCents = request.commissionCents !== undefined
      ? request.commissionCents
      : price.commissionCents;
    const priceCard = el('section', { class: 'card' });
    priceCard.appendChild(el('h2', {}, 'Price and payment'));
    const priceInfo = el('dl', { class: 'kv' });
    appendKv(priceInfo, 'Total', formatZAR(request.totalCents !== undefined ? request.totalCents : price.totalCents));
    appendKv(priceInfo, 'Commission', commissionCents === undefined ? '—' : formatZAR(commissionCents));
    appendKv(priceInfo, 'Commission rate', (request.commissionPct !== undefined
      ? request.commissionPct : price.commissionPct) === undefined
      ? '—' : String(request.commissionPct !== undefined ? request.commissionPct : price.commissionPct) + '%');
    appendKv(priceInfo, 'Provider earning', price.providerEarningCents === undefined
      ? '—' : formatZAR(price.providerEarningCents));
    const payment = request.payment;
    appendKv(priceInfo, 'Payment status', payment ? payment.status : 'Not created');
    appendKv(priceInfo, 'Payment method', payment ? payment.method : '—');
    appendKv(priceInfo, 'Paid at', payment && payment.paidAt ? formatDate(payment.paidAt, 'datetime') : '—');
    priceCard.appendChild(priceInfo);
    content.appendChild(summary);
    content.appendChild(priceCard);

    renderOffers(data.offers || [], content);
    renderCandidates(data.candidates || [], request, content);
    renderActions(request, content);
    renderTimeline(timeline, content);
  }

  function renderOffers(offers, parent) {
    const section = el('section', { class: 'card' });
    section.appendChild(el('h2', {}, 'Offers'));
    const wrap = el('div', { class: 'table-wrap' });
    const table = el('table', { class: 'tbl' });
    appendTableHeader(table, ['Provider', 'Status', 'Offered', 'Responded']);
    const tbody = el('tbody');
    if (!offers.length) {
      tbody.appendChild(emptyRow(4, 'No offers have been sent.'));
    } else {
      offers.forEach((offer) => {
        const row = el('tr');
        row.appendChild(el('td', {}, [offer.firstName, offer.lastName].filter(Boolean).join(' ')));
        row.appendChild(el('td', {}, offer.status));
        row.appendChild(el('td', {}, formatDate(offer.offeredAt, 'datetime')));
        row.appendChild(el('td', {}, offer.respondedAt ? formatDate(offer.respondedAt, 'datetime') : '—'));
        tbody.appendChild(row);
      });
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    parent.appendChild(section);
  }

  function renderCandidates(candidates, request, parent) {
    const section = el('section', { class: 'card' });
    section.appendChild(el('h2', {}, 'Candidates'));
    const wrap = el('div', { class: 'table-wrap' });
    const table = el('table', { class: 'tbl' });
    const labels = ['Provider', 'Online', 'Availability', 'Distance'];
    if (request.status === 'searching') labels.push('Action');
    appendTableHeader(table, labels);
    const tbody = el('tbody');
    const sorted = candidates.slice().sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return (a.distanceKm === null ? Number.POSITIVE_INFINITY : a.distanceKm) -
        (b.distanceKm === null ? Number.POSITIVE_INFINITY : b.distanceKm);
    });
    if (!sorted.length) {
      tbody.appendChild(emptyRow(labels.length, 'No eligible providers found.'));
    } else {
      sorted.forEach((candidate) => {
        const row = el('tr');
        row.appendChild(el('td', {}, [candidate.firstName, candidate.lastName].filter(Boolean).join(' ')));
        row.appendChild(el('td', {}, candidate.isOnline ? 'Online' : 'Offline'));
        row.appendChild(el('td', {}, candidate.isBusy ? 'Busy' : 'Available'));
        row.appendChild(el('td', {}, candidate.distanceKm === null
          ? '—' : Number(candidate.distanceKm).toFixed(1) + ' km'));
        if (request.status === 'searching') {
          const action = el('td');
          const assign = el('button', { class: 'btn soft', type: 'button' }, 'Assign');
          assign.disabled = busy || candidate.isBusy;
          assign.addEventListener('click', () => assignProvider(candidate));
          action.appendChild(assign);
          row.appendChild(action);
        }
        tbody.appendChild(row);
      });
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    parent.appendChild(section);
  }

  function renderActions(request, parent) {
    const actions = el('div', { class: 'action-bar' });
    if (['searching', 'accepted', 'arrived'].includes(request.status)) {
      const cancel = el('button', { class: 'btn red', type: 'button' }, 'Cancel request');
      cancel.disabled = busy;
      cancel.addEventListener('click', cancelRequest);
      actions.appendChild(cancel);
    }
    if (request.status === 'completed' && request.payment && request.payment.status === 'pending') {
      const paid = el('button', { class: 'btn', type: 'button' }, 'Mark as paid');
      paid.disabled = busy;
      paid.addEventListener('click', markPaid);
      actions.appendChild(paid);
    }
    if (actions.childNodes.length) parent.appendChild(actions);
  }

  function renderTimeline(events, parent) {
    const section = el('section', { class: 'card admin-timeline' });
    const heading = el('div', { class: 'admin-timeline-heading' });
    heading.appendChild(el('h2', {}, 'Timeline'));
    const copy = el('button', { class: 'btn soft', type: 'button' }, 'Copy timeline');
    copy.addEventListener('click', copyTimeline);
    heading.appendChild(copy);
    section.appendChild(heading);

    const ordered = events.slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    if (!ordered.length) {
      section.appendChild(el('p', { class: 'mu' }, 'No timeline events.'));
    } else {
      const list = el('ol', { class: 'admin-timeline-list' });
      ordered.forEach((event) => {
        const item = el('li');
        const source = ['audit', 'offer', 'rating', 'ledger'].includes(event.source) ? event.source : 'event';
        item.appendChild(el('time', {}, formatDate(event.at, 'datetime') || '—'));
        item.appendChild(el('span', { class: 'badge admin-timeline-source' }, source));
        item.appendChild(el('strong', {}, event.label || 'Event'));
        item.appendChild(el('span', {}, event.actor || '—'));
        const detail = formatTimelineDetail(event.detail);
        if (detail) item.appendChild(el('span', { class: 'admin-timeline-detail' }, detail));
        list.appendChild(item);
      });
      section.appendChild(list);
    }
    parent.appendChild(section);
  }

  async function copyTimeline() {
    const ordered = currentTimeline.slice().sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const text = ordered.map((event) => [
      formatDate(event.at, 'datetime') || '—',
      event.label || 'Event',
      event.actor || '—',
      formatTimelineDetail(event.detail),
    ].join(' | ')).join('\n');
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
      } else {
        const input = el('textarea');
        input.value = text;
        input.style.position = 'fixed';
        input.style.left = '-9999px';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        input.remove();
        if (!copied) throw new Error('Clipboard copy was rejected');
      }
      if (active && !ctx.signal.aborted) toast('Timeline copied', 'ok');
    } catch {
      if (active && !ctx.signal.aborted) {
        showError({ code: 'ZD-UI-001', message: 'Unable to copy the timeline.' });
      }
    }
  }

  async function assignProvider(candidate) {
    const confirmed = await modal({
      title: 'Assign provider?',
      body: 'Assign ' + [candidate.firstName, candidate.lastName].filter(Boolean).join(' ') +
        ' to request #' + ctx.params.id + '?',
      actions: [
        { label: 'Cancel', kind: 'soft', value: false },
        { label: 'Assign', kind: 'primary', value: true },
      ],
    });
    if (!confirmed || busy) return;
    await postAction('/admin/requests/' + requestId + '/assign', {
      providerId: candidate.providerId,
    }, 'Provider assigned');
  }

  async function cancelRequest() {
    const reason = el('textarea', { attrs: { maxlength: '200', placeholder: 'Reason for cancelling this request' } });
    const confirmed = await modal({
      title: 'Cancel request',
      body: reason,
      actions: [
        { label: 'Keep request', kind: 'soft', value: false },
        { label: 'Cancel request', kind: 'red', value: true },
      ],
    });
    if (!confirmed || busy) return;
    const text = reason.value.trim();
    if (text.length < 3) {
      showError({ code: 'ZD-VAL-001', message: 'Enter a cancellation reason of at least 3 characters.' });
      return;
    }
    await postAction('/admin/requests/' + requestId + '/cancel', { reason: text }, 'Request cancelled');
  }

  async function markPaid() {
    const body = el('div');
    const method = selectControl('Payment method', [['cash', 'Cash'], ['eft', 'EFT']]);
    const receivedBy = selectControl('Payment received by', [
      ['provider', 'Driver paid the provider directly'],
      ['platform', 'Driver paid ZoomDrive'],
    ]);
    const note = el('textarea', {
      attrs: { maxlength: '200', placeholder: 'Payment note (at least 3 characters)' },
    });
    body.appendChild(method.wrapper);
    body.appendChild(receivedBy.wrapper);
    body.appendChild(note);
    const confirmed = await modal({
      title: 'Mark request as paid',
      body,
      actions: [
        { label: 'Cancel', kind: 'soft', value: false },
        { label: 'Mark as paid', kind: 'primary', value: true },
      ],
    });
    if (!confirmed || busy) return;
    const text = note.value.trim();
    if (text.length < 3) {
      showError({ code: 'ZD-VAL-001', message: 'Enter a payment note of at least 3 characters.' });
      return;
    }
    await postAction('/admin/requests/' + requestId + '/mark-paid', {
      method: method.select.value,
      receivedBy: receivedBy.select.value,
      note: text,
    }, 'Payment recorded');
  }

  async function postAction(path, body, successMessage) {
    if (busy) return;
    busy = true;
    stopRefresh();
    clearError();
    try {
      await withSpinner(apiFetch(path, {
        method: 'POST',
        body,
        signal: ctx.signal,
      }));
      if (!active || ctx.signal.aborted) return;
      toast(successMessage, 'ok');
      busy = false;
      await loadDetail(false);
    } catch (err) {
      if (!active || ctx.signal.aborted) return;
      showError(err);
      busy = false;
      await loadDetail(false);
    } finally {
      busy = false;
      scheduleRefresh();
    }
  }

  function selectControl(label, options) {
    const wrapper = el('div', { class: 'field' });
    const select = el('select', { attrs: { 'aria-label': label } });
    options.forEach(([value, text]) => select.appendChild(el('option', { value }, text)));
    wrapper.appendChild(el('label', {}, label));
    wrapper.appendChild(select);
    return { wrapper, select };
  }

  ctx.onLeave(() => {
    active = false;
    stopRefresh();
  });
  await loadDetail(false);
}

function appendKv(list, label, value) {
  list.appendChild(el('dt', {}, label));
  list.appendChild(el('dd', {}, value || '—'));
}

function formatTimelineDetail(detail) {
  if (!detail || typeof detail !== 'object') return '';
  if (Number.isInteger(detail.stars) && detail.stars >= 1 && detail.stars <= 5) {
    return detail.stars + ' stars';
  }
  if (detail.amountCents !== undefined && detail.amountCents !== null
      && Number.isFinite(Number(detail.amountCents))) {
    return formatZAR(Number(detail.amountCents));
  }
  return '';
}

function appendTableHeader(table, labels) {
  const head = el('thead');
  const row = el('tr');
  labels.forEach((label) => row.appendChild(el('th', {}, label)));
  head.appendChild(row);
  table.appendChild(head);
}

function emptyRow(columns, message) {
  const row = el('tr');
  row.appendChild(el('td', { attrs: { colspan: columns } }, message));
  return row;
}