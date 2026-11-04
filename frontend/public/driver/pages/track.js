import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError } from '../../shared/errors.js';
import { createMap, watchMapResize } from '../../shared/map.js';
import { clear, el, formatZAR, modal, toast } from '../../shared/ui.js';
import { createStatusBadge } from '../../shared/components/status-badge.js';
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

function formatStatus(status) {
  if (status === 'accepted') return 'On the way';
  if (status === 'arrived') return 'Your provider has arrived';
  return status || 'Request';
}

function safePhoneHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? 'tel:+' + digits : '';
}

function providerDisplayName(provider) {
  if (!provider) return 'Your provider';
  const first = provider.firstName || 'Provider';
  const last = provider.lastName || '';
  return last ? first + ' ' + last.charAt(0).toUpperCase() + '.' : first;
}

function initials(provider) {
  const first = provider && provider.firstName ? provider.firstName.charAt(0) : '';
  const last = provider && provider.lastName ? provider.lastName.charAt(0) : '';
  return (first + last).toUpperCase() || '?';
}

function hasCoordinate(value) {
  return value !== null && value !== undefined && value !== ''
    && Number.isFinite(Number(value));
}

export default function render(ctx) {
  try {
    return renderTrack(ctx);
  } catch (err) {
    const screen = el('div', { class: 'screen' });
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

function renderTrack(ctx) {
  let active = true;
  let stopped = false;
  let pollTimer = null;
  let inFlight = false;
  let resumeAfterFlight = false;
  let failures = 0;
  let mapController = null;
  let mapAttempted = false;
  let currentRequest = null;
  const requestId = ctx.params.id;

  const screen = el('div', { class: 'screen' });
  const statusHeading = el('h1', {}, 'Loading request…');
  const etaText = el('p', { class: 'track-eta hidden' });
  screen.appendChild(createTopbar({ title: 'Your provider' }));
  const layout = el('div', { class: 'layout-split track-layout' });
  const mapColumn = el('div', { class: 'layout-map-column' });
  const detailsPanel = el('div', { class: 'layout-panel' });
  layout.appendChild(mapColumn);
  layout.appendChild(detailsPanel);
  detailsPanel.appendChild(statusHeading);
  detailsPanel.appendChild(etaText);
  const connectionBanner = el('div', { class: 'banner warn connection-banner hidden' }, 'Connection problem. Retrying…');
  detailsPanel.appendChild(connectionBanner);

  const mapCard = el('div', { class: 'card' });
  const mapElement = el('div', {
    class: 'zd-map',
    attrs: { role: 'application', 'aria-label': 'Request and provider locations' },
  });
  const mapLoading = el('p', { class: 'muted' }, 'Loading map…');
  mapCard.appendChild(mapElement);
  mapCard.appendChild(mapLoading);
  mapColumn.appendChild(mapCard);

  const providerCard = el('div', { class: 'card provider-card' });
  detailsPanel.appendChild(providerCard);
  const priceCard = el('div', { class: 'card line tot' });
  priceCard.appendChild(el('span', {}, 'Total'));
  const totalValue = el('b', {}, '—');
  priceCard.appendChild(totalValue);
  detailsPanel.appendChild(priceCard);

  const actions = el('div', { class: 'track-actions' });
  detailsPanel.appendChild(actions);
  const cancelButton = el('button', { class: 'btn red', type: 'button' }, 'Cancel request');
  detailsPanel.appendChild(cancelButton);
  const terminalContent = el('div');
  detailsPanel.appendChild(terminalContent);
  screen.appendChild(layout);

  function stopPolling() {
    stopped = true;
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }

  function renderCancelled(request) {
    clear(terminalContent);
    terminalContent.appendChild(el('div', { class: 'card' },
      el('h2', {}, 'Request cancelled'),
      el('p', {}, request.cancelReason || 'This request is no longer active.')
    ));
    cancelButton.classList.add('hidden');
    const row = el('div', { class: 'track-actions' });
    const again = el('button', { class: 'btn', type: 'button' }, 'Request again');
    again.addEventListener('click', () => {
      const serviceId = request.service && request.service.id;
      ctx.navigate(serviceId
        ? '/request?service=' + encodeURIComponent(serviceId)
        : '/request');
    });
    const home = el('button', { class: 'btn soft', type: 'button' }, 'Home');
    home.addEventListener('click', () => ctx.navigate('/home'));
    row.appendChild(again);
    row.appendChild(home);
    terminalContent.appendChild(row);
  }

  function finishStatus(request) {
    stopPolling();
    if (request.status === 'completed') {
      ctx.navigate('/pay/' + encodeURIComponent(request.id), { replace: true });
    } else if (request.status === 'cancelled' || request.status === 'expired') {
      renderCancelled(request);
    }
  }

  function renderProvider(provider) {
    clear(providerCard);
    if (!provider) {
      providerCard.appendChild(el('p', {}, 'Waiting for provider details…'));
      return;
    }
    const row = el('div', { class: 'pr' });
    const avatar = el('div', { class: 'av avatar-lg' });
    if (provider.photoUrl) {
      const photo = el('img', {
        class: 'provider-photo',
        attrs: { src: provider.photoUrl, alt: providerDisplayName(provider) },
      });
      photo.addEventListener('error', () => {
        clear(avatar);
        avatar.textContent = initials(provider);
        avatar.classList.remove('has-photo');
      }, { once: true });
      avatar.classList.add('has-photo');
      avatar.appendChild(photo);
    } else {
      avatar.textContent = initials(provider);
    }
    row.appendChild(avatar);
    const info = el('div', { class: 'provider-info' });
    info.appendChild(el('strong', {}, providerDisplayName(provider)));
    if (provider.companyName) info.appendChild(el('small', {}, provider.companyName));
    if (provider.verified) info.appendChild(createStatusBadge('verified'));
    const ratingCount = Number(provider.ratingCount) || 0;
    if (provider.ratingAvg === null || provider.ratingAvg === undefined || ratingCount === 0) {
      info.appendChild(el('small', {}, 'New'));
    } else {
      const rating = Number(provider.ratingAvg);
      info.appendChild(el('small', {}, (Number.isFinite(rating) ? rating.toFixed(1) : '0.0')
        + ' · ' + (Number(provider.jobsCompleted) || 0) + ' jobs'));
    }
    if (provider.vehicleDescription) info.appendChild(el('small', {}, provider.vehicleDescription));
    if (provider.plate) info.appendChild(el('small', {}, provider.plate));
    row.appendChild(info);
    providerCard.appendChild(row);
  }

  function renderActions(request) {
    clear(actions);
    const provider = request.provider;
    const phoneHref = safePhoneHref(provider && provider.phone);
    if (phoneHref) actions.appendChild(el('a', { class: 'btn soft', href: phoneHref }, 'Call'));

    const share = el('button', { class: 'btn soft', type: 'button' }, 'Share trip');
    share.addEventListener('click', async () => {
      const name = provider
        ? [provider.firstName, provider.lastName].filter(Boolean).join(' ')
        : 'your provider';
      const service = request.service && request.service.name ? request.service.name : 'roadside';
      const plate = provider && provider.plate ? provider.plate : 'not provided';
      const text = 'ZoomDrive trip: ' + service + ' help with ' + name + '. Provider plate: ' + plate + '.';
      if (navigator.share) {
        try {
          await navigator.share({ text });
        } catch (err) {
          if (err.name !== 'AbortError') toast('Trip could not be shared.', 'error');
        }
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          toast('Trip details copied', 'ok');
        } catch (err) {
          toast('Trip details could not be copied.', 'error');
        }
      } else {
        toast('Sharing and clipboard are unavailable on this device.', 'error');
      }
    });
    actions.appendChild(share);

    const safety = el('button', { class: 'btn soft', type: 'button' }, 'Safety');
    safety.addEventListener('click', () => ctx.navigate('/safety'));
    actions.appendChild(safety);
  }

  function updateMap(request) {
    if (!mapController) return;
    const provider = request.provider;
    if (provider && hasCoordinate(provider.lastLat) && hasCoordinate(provider.lastLng)) {
      const providerPosition = { lat: Number(provider.lastLat), lng: Number(provider.lastLng) };
      mapController.setProviderPin(providerPosition.lat, providerPosition.lng);
      if (hasCoordinate(request.lat) && hasCoordinate(request.lng)) {
        mapController.fitTo([
          { lat: Number(request.lat), lng: Number(request.lng) },
          providerPosition,
        ]);
      }
    }
  }

  async function initializeMap(request) {
    if (mapAttempted || !active) return;
    mapAttempted = true;
    try {
      const controller = await createMap(mapElement, {
        lat: Number(request.lat),
        lng: Number(request.lng),
      });
      if (!active) {
        controller.destroy();
        return;
      }
      mapController = controller;
      watchMapResize(mapController, ctx);
      mapLoading.remove();
      mapController.invalidate();
      if (currentRequest) updateMap(currentRequest);
    } catch (err) {
      if (!active) return;
      mapLoading.remove();
      mapElement.classList.add('zd-map-fallback');
      mapElement.textContent = 'Map unavailable. Your request location is saved.';
    }
  }

  async function cancelRequest() {
    const select = el('select', { attrs: { 'aria-label': 'Reason for cancelling' } });
    ['Provider is taking too long', 'I no longer need help', 'Other']
      .forEach((reason) => select.appendChild(el('option', { value: reason }, reason)));
    const confirmed = await modal({
      title: 'Cancel this request?',
      body: select,
      actions: [
        { label: 'Keep request', kind: 'soft', value: false },
        { label: 'Cancel request', kind: 'red', value: true },
      ],
    });
    if (!confirmed || !active) return;
    cancelButton.disabled = true;
    try {
      await apiFetch('/requests/' + encodeURIComponent(requestId) + '/cancel', {
        method: 'POST',
        body: { reason: select.value },
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

  async function applyRequest(request) {
    if (!active || !request) return;
    currentRequest = request;
    if (TERMINAL_STATUSES.includes(request.status)) {
      finishStatus(request);
      return;
    }
    statusHeading.textContent = formatStatus(request.status);
    const hasEta = request.status === 'accepted' && typeof request.etaMinutes === 'number';
    etaText.classList.toggle('hidden', !hasEta);
    if (hasEta) etaText.textContent = 'Arriving in about ' + request.etaMinutes + ' min';
    totalValue.textContent = formatZAR(request.price && request.price.totalCents);
    renderProvider(request.provider);
    renderActions(request);
    cancelButton.classList.remove('hidden');
    await initializeMap(request);
    updateMap(request);
  }

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
      if (!data.request) {
        stopPolling();
        showRequestError(screen, { code: 'ZD-REQ-001', message: 'This request could not be found.' }, ctx.navigate);
        return;
      }
      await applyRequest(data.request);
    } catch (err) {
      if (!active || ctx.signal.aborted) return;
      console.error('[ZD-ERR]', err);
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
    } else if (inFlight) {
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
    if (mapController) mapController.destroy();
    mapController = null;
  });
  poll();
  return screen;
}