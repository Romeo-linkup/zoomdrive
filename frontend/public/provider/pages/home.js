import { apiFetch } from '../../shared/api.js';
import { showError } from '../../shared/errors.js';
import { getPosition } from '../../shared/geo.js';
import { createMap, watchMapResize } from '../../shared/map.js';
import { el, clear, formatZAR, toast, withSpinner } from '../../shared/ui.js';
import { getSession } from '../../shared/auth.js';
import { createPageError } from './pageError.js';
import * as heartbeat from '../heartbeat.js';
import { refreshProviderUnreadCount } from '../notificationsBadge.js';

export default async function render(ctx) {
  try {
    return await renderHome(ctx);
  } catch (err) {
    return createPageError(err, () => ctx.navigate(ctx.path));
  }
}

async function renderHome(ctx) {
  refreshProviderUnreadCount();
  const screen = el('div', { class: 'screen' });
  screen.appendChild(el('h1', {}, "You're offline"));
  const stateText = screen.lastChild;
  const connectionMessage = el('div', { class: 'banner warn', hidden: true });
  screen.appendChild(connectionMessage);

  const feeBanner = el('div', { class: 'banner warn', hidden: true });
  feeBanner.appendChild(el('span', {}, 'Pay your one-time registration fee to start receiving jobs'));
  const feeButton = el('button', { class: 'btn', type: 'button' }, 'Pay registration fee');
  feeButton.addEventListener('click', () => ctx.navigate('/registration-fee'));
  feeBanner.appendChild(feeButton);
  screen.appendChild(feeBanner);

  const activeJobBanner = el('div', { class: 'banner', hidden: true });
  activeJobBanner.appendChild(el('span', {}, 'Job in progress'));
  const resumeButton = el('button', { class: 'btn', type: 'button' }, 'Resume');
  resumeButton.addEventListener('click', () => {
    if (activeJobId) ctx.navigate('/job/' + encodeURIComponent(activeJobId));
  });
  activeJobBanner.appendChild(resumeButton);
  screen.appendChild(activeJobBanner);

  const mapCard = el('div', { class: 'card' });
  mapCard.appendChild(el('h2', {}, 'Your location'));
  const mapElement = el('div', { class: 'zd-map' });
  const mapLoadingEl = el('p', { class: 'muted' }, 'Location map will appear when available.');
  mapCard.appendChild(mapElement);
  mapCard.appendChild(mapLoadingEl);
  screen.appendChild(mapCard);

  const opportunities = el('div', { class: 'card' });
  opportunities.appendChild(el('h2', {}, 'Opportunities'));
  opportunities.appendChild(el('p', {}, 'More ways to earn are coming soon.'));
  screen.appendChild(opportunities);

  const offerRoot = el('div');
  screen.appendChild(offerRoot);

  const onlineButton = el('button', { class: 'btn blue', type: 'button' }, 'Go Online');
  screen.appendChild(onlineButton);
  const mapLayout = el('div', { class: 'layout-split provider-home-layout' });
  const mapColumn = el('div', { class: 'layout-map-column' });
  const detailsPanel = el('div', { class: 'layout-panel' });
  mapColumn.appendChild(mapCard);
  [stateText, connectionMessage, feeBanner, activeJobBanner, opportunities, offerRoot, onlineButton]
    .forEach((node) => detailsPanel.appendChild(node));
  mapLayout.appendChild(mapColumn);
  mapLayout.appendChild(detailsPanel);
  clear(screen);
  screen.appendChild(mapLayout);
  let mapController = null;
  let mapLoading = false;
  let pendingMapPosition = null;
  let offerTimer = null;
  let countdownTimer = null;
  let activeJobId = null;
  let offers = [];
  let online = heartbeat.isOnline();
  let busy = false;
  let active = true;
  let inFlight = false;

  function renderOnlineState(state = {}) {
    online = state.isOnline === true;
    stateText.textContent = online ? "You're online" : "You're offline";
    onlineButton.textContent = online ? 'Go Offline' : 'Go Online';
    onlineButton.classList.toggle('blue', !online);
    if (state.message) {
      connectionMessage.textContent = state.message;
      connectionMessage.hidden = false;
    } else {
      connectionMessage.hidden = true;
    }
    if (online) scheduleOffers(0);
    else {
      clearOfferTimer();
      clear(offerRoot);
      offers = [];
    }
  }

  function clearOfferTimer() {
    if (offerTimer !== null) clearTimeout(offerTimer);
    offerTimer = null;
  }

  function clearCountdown() {
    if (countdownTimer !== null) clearTimeout(countdownTimer);
    countdownTimer = null;
  }

  function renderOffer() {
    clearCountdown();
    clear(offerRoot);
    const offer = offers[0];
    if (!offer) return;
    const card = el('div', { class: 'card offer-card' });
    const title = el('h2', {}, (offer.service && offer.service.icon ? offer.service.icon + ' ' : '') + (offer.service && offer.service.name ? offer.service.name : 'New job'));
    card.appendChild(title);
    if (offer.distanceKm !== null && offer.distanceKm !== undefined && Number.isFinite(Number(offer.distanceKm))) {
      card.appendChild(el('p', {}, Number(offer.distanceKm).toFixed(1) + ' km away'));
    }
    if (offer.addressText) card.appendChild(el('p', {}, offer.addressText));
    if (offer.driver && offer.driver.firstName) {
      card.appendChild(el('p', {}, 'Driver: ' + offer.driver.firstName));
      const ratingCount = Number(offer.driver.ratingCount) || 0;
      const ratingValue = offer.driver.ratingAvg;
      if (ratingValue === null || ratingValue === undefined || ratingCount === 0) {
        card.appendChild(el('p', {}, 'Driver rating: New'));
      } else {
        const rating = Number(ratingValue);
        card.appendChild(el('p', {}, 'Driver rating: ' + (Number.isFinite(rating) ? rating.toFixed(1) : 'New')));
      }
    }
    const earning = el('p', { class: 'provider-earning' }, 'You earn ' + formatZAR(offer.earningCents));
    card.appendChild(earning);
    const countdown = el('p', { class: 'mu' });
    card.appendChild(countdown);
    if (offers.length > 1) card.appendChild(el('p', { class: 'mu' }, '+' + (offers.length - 1) + ' more'));
    const buttons = el('div', { class: 'offer-actions' });
    const accept = el('button', { class: 'btn', type: 'button' }, 'Accept');
    const decline = el('button', { class: 'btn soft', type: 'button' }, 'Decline');
    accept.addEventListener('click', () => acceptOffer(offer));
    decline.addEventListener('click', () => declineOffer(offer));
    buttons.appendChild(accept);
    buttons.appendChild(decline);
    card.appendChild(buttons);
    offerRoot.appendChild(card);

    function updateCountdown() {
      if (!active || !card.isConnected) return;
      const remaining = new Date(offer.expiresAt).getTime() - Date.now();
      if (!Number.isFinite(remaining) || remaining <= 0) {
        countdown.textContent = 'Offer expired';
        accept.disabled = true;
        return;
      }
      countdown.textContent = 'Expires in ' + Math.ceil(remaining / 1000) + ' seconds';
      countdownTimer = setTimeout(updateCountdown, 1000);
    }
    updateCountdown();
  }

  async function fetchOffers() {
    if (!active || !online || document.hidden || inFlight) return;
    inFlight = true;
    try {
      const data = await apiFetch('/providers/me/offers', { signal: ctx.signal });
      if (!active || ctx.signal.aborted) return;
      offers = Array.isArray(data.offers) ? data.offers : [];
      renderOffer();
    } catch (err) {
      if (active && !ctx.signal.aborted) showError(err);
    } finally {
      inFlight = false;
      if (active && online && !document.hidden) scheduleOffers(5000);
    }
  }

  function scheduleOffers(delay = 5000) {
    if (!active || !online || document.hidden || offerTimer !== null) return;
    offerTimer = setTimeout(() => {
      offerTimer = null;
      fetchOffers();
    }, delay);
  }

  async function acceptOffer(offer) {
    if (busy) return;
    busy = true;
    try {
      await withSpinner(apiFetch('/requests/' + encodeURIComponent(offer.requestId) + '/accept', {
        method: 'POST',
        signal: ctx.signal,
      }));
      if (active) ctx.navigate('/job/' + encodeURIComponent(offer.requestId));
    } catch (err) {
      if (err.code === 'ZD-REQ-006') {
        toast('Someone else took this job', 'info');
        await fetchOffers();
      } else if (err.code === 'ZD-REQ-009') {
        await loadActiveJob(true);
      } else if (err.code === 'ZD-PROV-005') {
        ctx.navigate('/pending');
      } else {
        showError(err);
      }
    } finally {
      busy = false;
    }
  }

  async function declineOffer(offer) {
    if (busy) return;
    busy = true;
    try {
      await apiFetch('/requests/' + encodeURIComponent(offer.requestId) + '/decline', {
        method: 'POST',
        signal: ctx.signal,
      });
      offers = offers.filter((item) => item.requestId !== offer.requestId);
      renderOffer();
      scheduleOffers(0);
    } catch (err) {
      showError(err);
    } finally {
      busy = false;
    }
  }

  async function loadActiveJob(openJob = false) {
    try {
      const data = await apiFetch('/providers/me/jobs', { signal: ctx.signal });
      const activeJob = (data.active || [])[0];
      if (activeJob && activeJob.id !== undefined) {
        activeJobId = activeJob.id;
        activeJobBanner.hidden = false;
        if (openJob) ctx.navigate('/job/' + encodeURIComponent(activeJobId));
      }
    } catch (err) {
      if (!ctx.signal.aborted) showError(err);
    }
  }

  async function renderLocation(position) {
    if (!position || !active) return;
    if (mapController) {
      mapController.setPin(Number(position.lat), Number(position.lng));
      return;
    }
    if (mapLoading) {
      pendingMapPosition = { lat: Number(position.lat), lng: Number(position.lng) };
      return;
    }
    mapLoading = true;
    try {
      mapController = await createMap(mapElement, {
        lat: Number(position.lat),
        lng: Number(position.lng),
        draggablePin: false,
      });
      watchMapResize(mapController, ctx, mapElement);
      if (!active) {
        mapController.destroy();
        mapController = null;
        return;
      }
      if (pendingMapPosition) {
        mapController.setPin(pendingMapPosition.lat, pendingMapPosition.lng);
        pendingMapPosition = null;
      }
      mapLoadingEl.remove();
      mapController.invalidate();
    } catch (err) {
      if (active) {
        mapLoadingEl.remove();
        mapElement.textContent = 'Map unavailable. Your location is still used for job offers.';
      }
    } finally {
      mapLoading = false;
    }
  }

  async function loadState() {
    const session = getSession();
    const basePosition = heartbeat.getLastPosition() || (session && session.profile
      && session.profile.baseLat !== null && session.profile.baseLng !== null
      ? { lat: session.profile.baseLat, lng: session.profile.baseLng }
      : null);
    if (basePosition) renderLocation(basePosition);

    try {
      const state = await apiFetch('/providers/me/registration-fee', { signal: ctx.signal });
      feeBanner.hidden = !state.required;
    } catch (err) {
      if (!ctx.signal.aborted) showError(err);
    }
    await loadActiveJob();
    if (heartbeat.isOnline()) {
      renderOnlineState({ isOnline: true });
      return;
    }
    if (!navigator.permissions || typeof navigator.permissions.query !== 'function') return;
    let permission;
    try {
      permission = await navigator.permissions.query({ name: 'geolocation' });
    } catch (err) {
      return;
    }
    if (permission.state !== 'granted' || !active) return;
    try {
      const position = await getPosition();
      if (!active) return;
      await renderLocation(position);
      const result = await apiFetch('/providers/me/heartbeat', {
        method: 'POST',
        body: { lat: position.lat, lng: position.lng },
        signal: ctx.signal,
      });
      if (result.isOnline === true && active) {
        heartbeat.startOnline(position);
      }
    } catch (err) {
      if (active && !ctx.signal.aborted && !['DENIED', 'UNAVAILABLE', 'TIMEOUT', 'UNSUPPORTED'].includes(err.code)) {
        if (err.code === 'ZD-PROV-005') {
          ctx.navigate('/pending');
          return;
        }
        showError(err);
      }
    }
  }

  async function toggleOnline() {
    if (busy) return;
    busy = true;
    onlineButton.disabled = true;
    try {
      if (online) {
        await apiFetch('/providers/me/online', {
          method: 'POST',
          body: { online: false },
          signal: ctx.signal,
        });
        await heartbeat.stopOnline({ notifyServer: false });
        return;
      }
      let position;
      try {
        position = await getPosition();
      } catch (err) {
        if (err.code === 'DENIED') {
          toast('Location permission is needed to receive jobs', 'error');
          return;
        }
        throw err;
      }
      await withSpinner(apiFetch('/providers/me/online', {
        method: 'POST',
        body: { online: true, lat: position.lat, lng: position.lng },
        signal: ctx.signal,
      }));
      if (!active) return;
      await renderLocation(position);
      heartbeat.startOnline(position);
    } catch (err) {
      if (err.code === 'ZD-PROV-006') ctx.navigate('/registration-fee');
      else if (err.code === 'ZD-PROV-005') ctx.navigate('/pending');
      else showError(err);
    } finally {
      busy = false;
      if (active) onlineButton.disabled = false;
    }
  }
  onlineButton.addEventListener('click', toggleOnline);

  function onVisibilityChange() {
    if (document.hidden) {
      clearOfferTimer();
      clearCountdown();
    } else {
      scheduleOffers(0);
      renderOffer();
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  const unsubscribe = heartbeat.onChange(renderOnlineState);

  ctx.onLeave(() => {
    active = false;
    clearOfferTimer();
    clearCountdown();
    document.removeEventListener('visibilitychange', onVisibilityChange);
    unsubscribe();
    if (mapController) mapController.destroy();
    mapController = null;
  });

  renderOnlineState({ isOnline: online });
  await loadState();
  return screen;
}