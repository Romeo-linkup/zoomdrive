import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError } from '../../shared/errors.js';
import { clear, el, formatZAR, modal, toast } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';

const TERMINAL_STATUSES = ['completed', 'cancelled', 'expired'];

function isNotFound(err) {
  return err && (err.status === 404 || ['ZD-REQ-001', 'ZD-REQ-007'].includes(err.code));
}

function showRequestError(screen, err, navigate) {
  clear(screen);
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', {}, 'Request unavailable'));
  card.appendChild(el('p', {}, err.message || 'This request could not be found.'));
  const home = el('button', { class: 'btn', type: 'button' }, 'Home');
  home.addEventListener('click', () => navigate('/home'));
  card.appendChild(home);
  screen.appendChild(card);
}

export default function render(ctx) {
  try {
    return renderSearching(ctx);
  } catch (err) {
    const screen = el('div', { class: 'screen' });
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

function renderSearching(ctx) {
  let active = true;
  let stopped = false;
  let pollTimer = null;
  let countdownTimer = null;
  let inFlight = false;
  let resumeAfterFlight = false;
  let failures = 0;
  let currentRequest = null;
  let lastStatus = null;
  const requestId = ctx.params.id;
  const initialOffers = ctx.query.offers === undefined || ctx.query.offers.trim() === ''
    ? null
    : Number(ctx.query.offers);

  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Finding help', onBack: () => ctx.navigate('/home') }));
  const connectionBanner = el('div', { class: 'banner warn connection-banner hidden' }, 'Connection problem. Retrying…');
  screen.appendChild(connectionBanner);
  const content = el('div');
  screen.appendChild(content);
  const searchingCard = el('div', { class: 'card searching-card' });
  const pulse = el('div', { class: 'zd-search-pulse', attrs: { 'aria-hidden': 'true' } });
  searchingCard.appendChild(pulse);
  searchingCard.appendChild(el('h1', {}, 'Finding help nearby'));
  const serviceName = el('p', {}, 'Loading your request…');
  searchingCard.appendChild(serviceName);
  const countdownLabel = el('div', { class: 'countdown-label' }, 'Time left to find help');
  searchingCard.appendChild(countdownLabel);
  const countdown = el('div', { class: 'big countdown' }, '0:00');
  searchingCard.appendChild(countdown);
  const noProviders = el('div', { class: 'banner warn hidden' });
  noProviders.appendChild(el('span', {}, 'No providers nearby right now. We are still looking and our team can help.'));
  searchingCard.appendChild(noProviders);
  const totalLine = el('div', { class: 'line tot' }, el('span', {}, 'Fixed total'), el('b', {}, ''));
  searchingCard.appendChild(totalLine);
  const cancelButton = el('button', { class: 'btn red', type: 'button' }, 'Cancel request');
  searchingCard.appendChild(cancelButton);
  content.appendChild(searchingCard);

  function stopPolling() {
    stopped = true;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    if (countdownTimer) clearTimeout(countdownTimer);
    countdownTimer = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  function finishStatus(request) {
    stopPolling();
    if (request.status === 'accepted' || request.status === 'arrived') {
      ctx.navigate('/track/' + encodeURIComponent(request.id), { replace: true });
    } else if (request.status === 'completed') {
      ctx.navigate('/pay/' + encodeURIComponent(request.id), { replace: true });
    } else if (request.status === 'cancelled') {
      toast('Request cancelled', 'info');
      ctx.navigate('/home', { replace: true });
    } else if (request.status === 'expired') {
      renderExpired(request);
    }
  }

  function renderExpired(request) {
    clear(content);
    const card = el('div', { class: 'card' });
    card.appendChild(el('h2', {}, 'No help was available'));
    card.appendChild(el('p', {}, 'This request has expired. You can try again or return home.'));
    const again = el('button', { class: 'btn', type: 'button' }, 'Try again');
    again.addEventListener('click', () => {
      const serviceId = request.service && request.service.id;
      ctx.navigate(serviceId
        ? '/request?service=' + encodeURIComponent(serviceId)
        : '/request');
    });
    const home = el('button', { class: 'btn soft', type: 'button' }, 'Home');
    home.addEventListener('click', () => ctx.navigate('/home'));
    card.appendChild(again);
    card.appendChild(home);
    content.appendChild(card);
  }

  function renderCountdown() {
    if (!active || stopped || !currentRequest) return;
    const expiresAt = new Date(currentRequest.expiresAt).getTime();
    const remaining = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now()) : 0;
    const seconds = Math.floor(remaining / 1000);
    countdown.textContent = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');

    const createdAt = new Date(currentRequest.createdAt).getTime();
    const elapsed = Number.isFinite(createdAt) ? Date.now() - createdAt : 0;
    if (currentRequest.status === 'searching'
      && (initialOffers === 0 || (lastStatus === currentRequest.status && elapsed >= 30000))) {
      noProviders.classList.remove('hidden');
    } else {
      noProviders.classList.add('hidden');
    }
    countdownTimer = setTimeout(renderCountdown, 1000);
  }

  async function cancelRequest() {
    const confirmed = await modal({
      title: 'Cancel this request?',
      body: 'We will stop looking for a provider.',
      actions: [
        { label: 'Keep looking', kind: 'soft', value: false },
        { label: 'Cancel request', kind: 'red', value: true },
      ],
    });
    if (!confirmed || !active) return;
    cancelButton.disabled = true;
    try {
      await apiFetch('/requests/' + encodeURIComponent(requestId) + '/cancel', {
        method: 'POST',
        body: { reason: 'Cancelled by driver' },
        signal: ctx.signal,
      });
      if (!active) return;
      stopPolling();
      toast('Request cancelled', 'info');
      ctx.navigate('/home');
    } catch (err) {
      if (active && !ctx.signal.aborted) showError(err);
    } finally {
      if (active) cancelButton.disabled = false;
    }
  }
  cancelButton.addEventListener('click', cancelRequest);

  async function poll() {
    pollTimer = null;
    if (!active || stopped || document.hidden) return;
    if (inFlight) {
      resumeAfterFlight = true;
      return;
    }
    inFlight = true;
    try {
      const data = await apiFetch('/requests/' + encodeURIComponent(requestId), { signal: ctx.signal });
      if (!active || ctx.signal.aborted) return;
      failures = 0;
      connectionBanner.classList.add('hidden');
      currentRequest = data.request;
      if (!currentRequest) {
        const error = { code: 'ZD-REQ-001', message: 'This request could not be found.' };
        stopPolling();
        showRequestError(screen, error, ctx.navigate);
        return;
      }
      if (TERMINAL_STATUSES.includes(currentRequest.status)) {
        finishStatus(currentRequest);
        return;
      }
      if (lastStatus !== currentRequest.status) lastStatus = currentRequest.status;
      serviceName.textContent = currentRequest.service && currentRequest.service.name
        ? currentRequest.service.name
        : 'Your request';
      const total = currentRequest.price && currentRequest.price.totalCents;
      totalLine.lastChild.textContent = formatZAR(total);
      if (!countdownTimer) renderCountdown();
    } catch (err) {
      if (!active || ctx.signal.aborted) return;
      if (isNotFound(err)) {
        stopPolling();
        showRequestError(screen, err, ctx.navigate);
        return;
      }
      failures += 1;
      if (failures >= 3) connectionBanner.classList.remove('hidden');
    } finally {
      inFlight = false;
      if (active && !stopped && !document.hidden) {
        const delay = resumeAfterFlight ? 0 : 5000;
        resumeAfterFlight = false;
        pollTimer = setTimeout(poll, delay);
      }
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = null;
      return;
    }
    if (inFlight) {
      resumeAfterFlight = true;
    } else if (active && !stopped) {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(poll, 0);
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  ctx.onLeave(() => {
    active = false;
    stopPolling();
  });
  poll();
  return screen;
}
