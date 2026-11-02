import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError } from '../../shared/errors.js';
import { createMap } from '../../shared/map.js';
import { createStatusBadge } from '../../shared/components/status-badge.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, clear, formatZAR, modal } from '../../shared/ui.js';
import { createPageError } from './pageError.js';
import * as heartbeat from '../heartbeat.js';

const TERMINAL_STATUSES = ['completed', 'cancelled', 'expired'];

export default async function render(ctx) {
  try {
    return await renderJob(ctx);
  } catch (err) {
    return createPageError(err, () => ctx.navigate(ctx.path));
  }
}

async function renderJob(ctx) {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Current job', onBack: () => ctx.navigate('/home') }));
  const mapCard = el('div', { class: 'card' });
  const mapElement = el('div', { class: 'zd-map job-map' }, 'Loading map…');
  mapCard.appendChild(mapElement);
  screen.appendChild(mapCard);
  const content = el('div');
  screen.appendChild(content);
  let active = true;
  let stopped = false;
  let inFlight = false;
  let pollTimer = null;
  let paymentPollCount = 0;
  let cashRecordingOff = false;
  let mapController = null;
  let mapLoading = false;
  let currentRequest = null;
  const requestId = ctx.params.id;

  function stopPolling() {
    stopped = true;
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  function schedulePoll(delay) {
    if (!active || stopped || document.hidden) return;
    if (pollTimer !== null) clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, delay);
  }

  function homeButton() {
    const button = el('button', { class: 'btn', type: 'button' }, 'Home');
    button.addEventListener('click', () => ctx.navigate('/home'));
    return button;
  }

  function showCodedPageError(err) {
    stopPolling();
    mapCard.hidden = true;
    clear(content);
    renderPageError(content, err, () => {
      stopped = false;
      document.addEventListener('visibilitychange', onVisibilityChange);
      poll();
    });
    content.appendChild(homeButton());
    if (mapController) mapController.destroy();
    mapController = null;
  }

  function requestError(err) {
    if (err && (err.code === 'ZD-REQ-005' || err.code === 'ZD-REQ-007')) {
      refreshThenShowError(err);
      return true;
    }
    return false;
  }

  async function refreshThenShowError(err) {
    stopPolling();
    try {
      const data = await apiFetch('/requests/' + encodeURIComponent(requestId), { signal: ctx.signal });
      currentRequest = data.request || currentRequest;
    } catch (refreshError) {
      if (!ctx.signal.aborted) showError(refreshError);
    }
    if (active && !ctx.signal.aborted) showCodedPageError(err);
  }

  async function renderMap(request) {
    if (!request) return;
    const position = heartbeat.getLastPosition();
    if (mapController) {
      if (position) mapController.setProviderPin(position.lat, position.lng);
      return;
    }
    if (mapLoading) return;
    const lat = Number(request.lat);
    const lng = Number(request.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      mapElement.textContent = 'Location is not available for this job.';
      return;
    }
    mapLoading = true;
    try {
      mapController = await createMap(mapElement, { lat, lng, draggablePin: false });
      if (!active || (currentRequest && TERMINAL_STATUSES.includes(currentRequest.status))) {
        mapController.destroy();
        mapController = null;
        return;
      }
      if (position) mapController.setProviderPin(position.lat, position.lng);
      mapElement.textContent = '';
      mapController.invalidate();
    } catch (err) {
      if (active) mapElement.textContent = 'Map unavailable. Use the navigation links below.';
    } finally {
      mapLoading = false;
    }
  }

  function renderTerminal(request) {
    const completed = request.status === 'completed';
    const paymentStatus = request.payment && request.payment.status;
    if (!completed || paymentStatus === 'paid') stopPolling();
    mapCard.hidden = true;
    if (mapController) mapController.destroy();
    mapController = null;
    clear(content);
    const card = el('div', { class: 'card' });
    if (completed) {
      const price = request.price || {};
      const commission = Math.max(0, Number(price.totalCents) - Number(price.providerEarningCents));
      card.appendChild(el('h2', {}, 'Job complete'));
      card.appendChild(el('p', { class: 'provider-earning' }, 'You earn ' + formatZAR(price.providerEarningCents)));
      if (paymentStatus === 'paid') {
        if (request.payment.method === 'card') {
          card.appendChild(el('p', {}, 'Paid by card. ' + formatZAR(price.providerEarningCents) + ' was added to your balance.'));
        } else {
          const method = request.payment.method === 'cash' ? 'cash' : 'EFT';
          card.appendChild(el('p', {}, 'Recorded as ' + method + '. ' + formatZAR(commission) + ' will be deducted from your balance.'));
        }
      } else {
        card.appendChild(el('p', {}, 'Waiting for payment'));
        if (cashRecordingOff) {
          card.appendChild(el('p', { class: 'banner warn' }, 'Cash recording is switched off. Ask the driver to pay by card.'));
        } else {
          const received = el('button', { class: 'btn', type: 'button' }, 'Cash or EFT received');
          received.addEventListener('click', () => recordOfflinePayment(commission));
          card.appendChild(received);
        }
      }
    } else {
      card.appendChild(el('h2', {}, request.status === 'expired' ? 'Offer expired' : 'Job cancelled'));
      card.appendChild(el('p', {}, request.cancelReason || 'This job is no longer active.'));
    }
    card.appendChild(homeButton());
    content.appendChild(card);
  }

  async function recordOfflinePayment(commission) {
    const confirmedMethod = await modal({
      title: 'Cash or EFT received',
      body: el('div', {},
        el('p', {}, 'R' + (commission / 100).toFixed(2) + ' platform commission will be deducted from your balance.')
      ),
      actions: [
        { label: 'Cancel', kind: 'soft', value: false },
        { label: 'Cash', kind: 'primary', value: 'cash' },
        { label: 'EFT', kind: 'primary', value: 'eft' },
      ],
    });
    if (!confirmedMethod || !active) return;
    try {
      const result = await apiFetch('/requests/' + encodeURIComponent(requestId) + '/record-payment', {
        method: 'POST',
        body: { method: confirmedMethod },
        signal: ctx.signal,
      });
      if (!active || !currentRequest) return;
      currentRequest.payment = result.payment;
      renderTerminal(currentRequest);
    } catch (err) {
      if (!active || ctx.signal.aborted) return;
      if (err.code === 'ZD-PAY-009') {
        cashRecordingOff = true;
        if (currentRequest) renderTerminal(currentRequest);
      } else if (err.code === 'ZD-PAY-008') {
        try {
          const data = await apiFetch('/requests/' + encodeURIComponent(requestId), { signal: ctx.signal });
          if (active && data.request) renderRequest(data.request);
        } catch (reloadError) {
          if (active && !ctx.signal.aborted) showError(reloadError);
        }
      } else {
        showError(err);
      }
    }
  }

  function renderRequest(request) {
    currentRequest = request;
    if (TERMINAL_STATUSES.includes(request.status)) {
      renderTerminal(request);
      return;
    }
    mapCard.hidden = false;
    clear(content);

    const statusCard = el('div', { class: 'card' });
    statusCard.appendChild(el('h2', {}, (request.service && request.service.icon ? request.service.icon + ' ' : '') + (request.service && request.service.name ? request.service.name : 'Roadside job')));
    statusCard.appendChild(createStatusBadge(request.status));
    if (request.addressText) statusCard.appendChild(el('p', {}, request.addressText));
    if (request.notes) statusCard.appendChild(el('p', {}, request.notes));
    if (request.distanceKm !== null && request.distanceKm !== undefined && Number.isFinite(Number(request.distanceKm))) {
      statusCard.appendChild(el('p', {}, Number(request.distanceKm).toFixed(1) + ' km away'));
    }
    content.appendChild(statusCard);

    const driver = request.driver;
    if (driver && (request.status === 'accepted' || request.status === 'arrived')) {
      const driverCard = el('div', { class: 'card pr' });
      const avatar = el('div', { class: 'av avatar-lg' });
      if (driver.photoUrl) {
        avatar.appendChild(el('img', {
          class: 'provider-photo',
          attrs: { src: driver.photoUrl, alt: driver.firstName || 'Driver' },
        }));
        avatar.classList.add('has-photo');
      } else {
        avatar.textContent = (driver.firstName || '?').charAt(0).toUpperCase();
      }
      driverCard.appendChild(avatar);
      const info = el('div', { class: 'provider-info' });
      info.appendChild(el('strong', {}, driver.firstName || 'Driver'));
      if (driver.phone) {
        const cleaned = String(driver.phone).trim();
        const phone = (cleaned.startsWith('+') ? '+' : '') + cleaned.replace(/\D/g, '');
        if (phone.replace(/\D/g, '')) info.appendChild(el('a', { href: 'tel:' + phone }, 'Call driver'));
      }
      driverCard.appendChild(info);
      content.appendChild(driverCard);
    }

    const price = request.price || {};
    const priceCard = el('div', { class: 'card' });
    priceCard.appendChild(el('div', { class: 'line' }, el('span', {}, 'Total'), el('b', {}, formatZAR(price.totalCents))));
    priceCard.appendChild(el('div', { class: 'line tot' }, el('span', {}, 'You earn'), el('b', { class: 'provider-earning' }, formatZAR(price.providerEarningCents))));
    content.appendChild(priceCard);

    const actions = el('div', { class: 'job-actions' });
    const lat = Number(request.lat);
    const lng = Number(request.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const destination = encodeURIComponent(lat + ',' + lng);
      actions.appendChild(el('a', {
        class: 'btn',
        href: 'https://www.google.com/maps/dir/?api=1&destination=' + destination + '&travelmode=driving',
        target: '_blank',
        rel: 'noopener',
      }, 'Navigate'));
      actions.appendChild(el('a', {
        class: 'link-btn',
        href: 'https://waze.com/ul?ll=' + encodeURIComponent(lat + ',' + lng) + '&navigate=yes',
        target: '_blank',
        rel: 'noopener',
      }, 'Waze'));
    }
    if (request.status === 'accepted') {
      const arrived = el('button', { class: 'btn blue', type: 'button' }, 'I have arrived');
      arrived.addEventListener('click', () => updateJob('arrived'));
      actions.appendChild(arrived);
    }
    if (request.status === 'arrived') {
      const complete = el('button', { class: 'btn', type: 'button' }, 'Complete job');
      complete.addEventListener('click', confirmComplete);
      actions.appendChild(complete);
    }
    if (request.status === 'accepted' || request.status === 'arrived') {
      const cancel = el('button', { class: 'btn red', type: 'button' }, 'Cancel');
      cancel.addEventListener('click', cancelJob);
      actions.appendChild(cancel);
    }
    content.appendChild(actions);
    renderMap(request);
  }

  async function updateJob(action) {
    try {
      const data = await apiFetch('/requests/' + encodeURIComponent(requestId) + '/' + action, {
        method: 'POST',
        signal: ctx.signal,
      });
      if (active && data.request) {
        renderRequest(data.request);
        if (data.request.status === 'completed' && data.request.payment && data.request.payment.status !== 'paid') {
          schedulePoll(15000);
        }
      }
    } catch (err) {
      if (!requestError(err)) showError(err);
    }
  }

  async function confirmComplete() {
    const confirmed = await modal({
      title: 'Complete this job?',
      body: 'Confirm that the job is finished.',
      actions: [
        { label: 'Not yet', kind: 'soft', value: false },
        { label: 'Complete job', kind: 'primary', value: true },
      ],
    });
    if (confirmed && active) await updateJob('complete');
  }

  async function cancelJob() {
    const select = el('select', { attrs: { 'aria-label': 'Cancellation reason' } });
    ['Vehicle problem', 'Cannot reach the driver', 'Other']
      .forEach((reason) => select.appendChild(el('option', { value: reason }, reason)));
    const confirmed = await modal({
      title: 'Cancel this job?',
      body: select,
      actions: [
        { label: 'Keep job', kind: 'soft', value: false },
        { label: 'Cancel job', kind: 'red', value: true },
      ],
    });
    if (!confirmed || !active) return;
    try {
      const data = await apiFetch('/requests/' + encodeURIComponent(requestId) + '/cancel', {
        method: 'POST',
        body: { reason: select.value },
        signal: ctx.signal,
      });
      if (active && data.request) renderRequest(data.request);
    } catch (err) {
      if (!requestError(err)) showError(err);
    }
  }

  async function poll() {
    pollTimer = null;
    if (!active || stopped || document.hidden || inFlight) return;
    const countedPaymentPoll = Boolean(currentRequest && currentRequest.status === 'completed'
      && (!currentRequest.payment || currentRequest.payment.status !== 'paid'));
    if (countedPaymentPoll) {
      if (paymentPollCount >= 20) {
        stopPolling();
        return;
      }
      paymentPollCount += 1;
    }
    inFlight = true;
    try {
      const data = await apiFetch('/requests/' + encodeURIComponent(requestId), { signal: ctx.signal });
      if (!active || ctx.signal.aborted) return;
      if (!data.request) {
        showCodedPageError({ code: 'ZD-REQ-001', message: 'This job could not be found.' });
        return;
      }
      renderRequest(data.request);
      if (data.request.status === 'completed' && (!data.request.payment || data.request.payment.status !== 'paid')) {
        if (!countedPaymentPoll) paymentPollCount += 1;
        if (paymentPollCount >= 20) stopPolling();
      }
    } catch (err) {
      if (!active || ctx.signal.aborted) return;
      if (!requestError(err)) showError(err);
    } finally {
      inFlight = false;
      if (active && !stopped && !document.hidden) {
        const delay = currentRequest && currentRequest.status === 'completed' ? 15000 : 5000;
        schedulePoll(delay);
      }
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      if (pollTimer !== null) clearTimeout(pollTimer);
      pollTimer = null;
    } else if (active && !stopped) {
      if (pollTimer !== null) clearTimeout(pollTimer);
      pollTimer = setTimeout(poll, 0);
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange);
  ctx.onLeave(() => {
    active = false;
    stopPolling();
    if (mapController) mapController.destroy();
    mapController = null;
  });
  poll();
  return screen;
}