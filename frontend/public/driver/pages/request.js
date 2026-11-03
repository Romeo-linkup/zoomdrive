import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError } from '../../shared/errors.js';
import { DURBAN, getPosition } from '../../shared/geo.js';
import { createMap, watchMapResize } from '../../shared/map.js';
import { clear, el, formatZAR, modal, spinner, toast } from '../../shared/ui.js';
import { isAuthed } from '../../shared/auth.js';
import { goToLogin } from '../../shared/router.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { createField } from '../../shared/components/field.js';

const POSITION_KEY = 'zd_driver_pos';
const ACTIVE_STATUSES = ['searching', 'accepted', 'arrived'];

function readPosition() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(POSITION_KEY) || 'null');
    if (saved && Number.isFinite(Number(saved.lat)) && Number.isFinite(Number(saved.lng))) {
      return { lat: Number(saved.lat), lng: Number(saved.lng) };
    }
  } catch (err) {
    return null;
  }
  return null;
}

function savePosition(nextPosition) {
  try {
    sessionStorage.setItem(POSITION_KEY, JSON.stringify({
      lat: nextPosition.lat,
      lng: nextPosition.lng,
    }));
  } catch (err) {
    toast('Your location could not be saved on this device.', 'error');
  }
}

function resumePath(request) {
  return request.status === 'searching'
    ? '/searching/' + request.id
    : '/track/' + request.id;
}

function locationMessage(code) {
  if (code === 'DENIED') return 'Location permission is off. You can still pick your spot on the map.';
  if (code === 'TIMEOUT') return 'Location took too long. You can still pick your spot on the map.';
  if (code === 'UNSUPPORTED') return "Location isn't available on this device. You can still pick your spot on the map.";
  return "We couldn't find your location. You can still pick your spot on the map.";
}

export default function render(ctx) {
  try {
    return renderRequest(ctx);
  } catch (err) {
    const screen = el('div', { class: 'screen' });
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

function renderRequest(ctx) {
  let active = true;
  if (!isAuthed()) {
    ctx.navigate(goToLogin('/request'));
    return el('div', { class: 'screen' });
  }

  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({
    title: 'Request help',
    onBack: () => ctx.navigate('/home'),
  }));
  const steps = el('div', { class: 'steps', attrs: { 'aria-label': 'Step 2 of 3' } });
  steps.appendChild(el('i', {}));
  steps.appendChild(el('i', { class: 'on' }));
  steps.appendChild(el('i', {}));
  screen.appendChild(steps);
  screen.appendChild(el('p', { class: 'muted' }, 'Step 2 of 3 · Confirm your request'));

  const mapCard = el('div', { class: 'card' });
  const mapHead = el('div', { class: 'pr' });
  mapHead.appendChild(el('h3', {}, 'Your location'));
  const gpsButton = el('button', { class: 'btn soft', type: 'button' }, 'Use GPS');
  gpsButton.style.width = 'auto';
  gpsButton.style.margin = '0 0 0 auto';
  gpsButton.style.padding = '10px 14px';
  mapHead.appendChild(gpsButton);
  mapCard.appendChild(mapHead);
  const mapElement = el('div', {
    class: 'zd-map',
    attrs: { role: 'application', 'aria-label': 'Map with draggable location pin' },
  }, 'Loading map…');
  mapCard.appendChild(mapElement);
  const locationHint = el('div', { class: 'banner warn hidden' });
  locationHint.appendChild(el('span', {}, 'Drag the pin to your exact spot'));
  mapCard.appendChild(locationHint);
  const quoteError = el('div', { class: 'err hidden', role: 'alert' });
  mapCard.appendChild(quoteError);
  mapCard.classList.add('layout-map-column');
  const requestLayout = el('div', { class: 'layout-split request-layout' });
  const detailsPanel = el('div', { class: 'layout-panel' });
  requestLayout.appendChild(mapCard);
  requestLayout.appendChild(detailsPanel);
  screen.appendChild(requestLayout);

  const addressField = createField({
    name: 'addressText',
    label: 'Where exactly? (optional)',
    placeholder: 'Street, landmark or extra directions',
    maxlength: 200,
  });
  detailsPanel.appendChild(addressField.el);

  detailsPanel.appendChild(el('h3', {}, 'Choose a service'));
  const serviceTiles = el('div', { class: 'tiles' });
  detailsPanel.appendChild(serviceTiles);
  const serviceRetry = el('button', { class: 'btn soft hidden', type: 'button' }, 'Retry services');
  detailsPanel.appendChild(serviceRetry);

  const priceCard = el('div', { class: 'card' });
  priceCard.appendChild(el('h3', {}, 'Your estimate'));
  const priceContent = el('div', {}, 'Choose a service to see the fixed total.');
  priceCard.appendChild(priceContent);
  detailsPanel.appendChild(priceCard);

  const changedBanner = el('div', { class: 'banner warn hidden' });
  detailsPanel.appendChild(changedBanner);

  const paymentRow = el('div', { class: 'item' });
  paymentRow.appendChild(el('div', { class: 'ic' }, '💳'));
  paymentRow.appendChild(el('div', { class: 't' }, 'Pay after the job'));
  detailsPanel.appendChild(paymentRow);
  const promoRow = el('div', { class: 'item' });
  promoRow.appendChild(el('div', { class: 'ic' }, '🎟️'));
  promoRow.appendChild(el('div', { class: 't' }, 'Add promo code'));
  detailsPanel.appendChild(promoRow);

  const notesField = el('div', { class: 'field', dataset: { field: 'notes' } });
  notesField.appendChild(el('label', {}, 'Notes (optional)'));
  const notesInput = el('textarea', {
    maxLength: 200,
    rows: 3,
    attrs: { maxlength: '200', placeholder: 'Anything else the provider should know?' },
  });
  notesField.appendChild(notesInput);
  detailsPanel.appendChild(notesField);

  const requestButton = el('button', { class: 'btn', type: 'button' }, 'Request help');
  requestButton.disabled = true;
  detailsPanel.appendChild(requestButton);

  let services = [];
  let selectedService = null;
  let position = readPosition();
  let mapController = null;
  let quote = null;
  let quoteSequence = 0;
  let quoteTimer = null;
  let submitting = false;

  function showQuoteError(message) {
    quoteError.textContent = message;
    quoteError.classList.remove('hidden');
    requestButton.disabled = true;
  }

  function clearQuoteError() {
    quoteError.textContent = '';
    quoteError.classList.add('hidden');
  }

  function renderPrice() {
    clear(priceContent);
    if (!quote) {
      priceContent.appendChild(el('p', {}, 'Getting your fixed-price estimate…'));
      return;
    }

    priceContent.appendChild(el('div', { class: 'line' },
      el('span', {}, quote.serviceName || selectedService.name),
      el('b', {}, formatZAR(quote.servicePriceCents))
    ));
    priceContent.appendChild(el('div', { class: 'line' },
      el('span', {}, 'Distance fee'),
      el('b', {}, formatZAR(quote.distanceFeeCents))
    ));
    priceContent.appendChild(el('div', { class: 'line tot' },
      el('span', {}, 'Fixed total'),
      el('b', {}, formatZAR(quote.totalCents))
    ));
    priceContent.appendChild(el('p', {}, 'Price never changes after you confirm.'));
    if (typeof quote.etaMinutes === 'number') {
      priceContent.appendChild(el('p', {}, 'About ' + quote.etaMinutes + ' min away'));
    } else if (quote.providersNearby === 0) {
      priceContent.appendChild(el('p', {}, 'No providers nearby right now. You can still request and we will try to find help.'));
    }
  }

  async function fetchQuote() {
    if (!active || !selectedService || !position) return;
    const sequence = ++quoteSequence;
    quote = null;
    clearQuoteError();
    changedBanner.classList.add('hidden');
    renderPrice();
    requestButton.disabled = true;
    try {
      const data = await apiFetch('/requests/quote', {
        method: 'POST',
        body: {
          serviceId: selectedService.id,
          lat: position.lat,
          lng: position.lng,
        },
        signal: ctx.signal,
      });
      if (!active || sequence !== quoteSequence) return;
      quote = data;
      renderPrice();
      requestButton.disabled = submitting || !quote;
    } catch (err) {
      if (!active || sequence !== quoteSequence || ctx.signal.aborted) return;
      if (err.code === 'ZD-REQ-004') {
        showQuoteError(err.message);
        renderPrice();
        return;
      }
      if (err.code === 'ZD-REQ-002') {
        showQuoteError(err.message);
        const previousId = selectedService.id;
        const loaded = await loadServices();
        if (loaded && active && selectedService && selectedService.id !== previousId) fetchQuote();
        return;
      }
      renderPrice();
      showError(err);
    }
  }

  function scheduleQuote() {
    if (quoteTimer) clearTimeout(quoteTimer);
    quoteTimer = setTimeout(() => {
      quoteTimer = null;
      fetchQuote();
    }, 300);
  }

  function renderServices() {
    clear(serviceTiles);
    services.forEach((service) => {
      const tile = el('button', { class: 'tile', type: 'button' });
      if (selectedService && selectedService.id === service.id) tile.classList.add('sel');
      tile.setAttribute('aria-pressed', selectedService && selectedService.id === service.id ? 'true' : 'false');
      tile.appendChild(el('span', {}, service.icon || '🛠️'));
      tile.appendChild(document.createTextNode(service.name));
      tile.addEventListener('click', () => {
        if (selectedService && selectedService.id === service.id) return;
        selectedService = service;
        changedBanner.classList.add('hidden');
        renderServices();
        fetchQuote();
      });
      serviceTiles.appendChild(tile);
    });
  }

  async function loadServices() {
    serviceRetry.classList.add('hidden');
    try {
      const data = await apiFetch('/services', { auth: false, signal: ctx.signal });
      if (!active) return false;
      services = data.services || [];
      const requestedId = ctx.query.service;
      selectedService = services.find((service) => service.id === requestedId)
        || services.find((service) => selectedService && service.id === selectedService.id)
        || services[0]
        || null;
      renderServices();
      if (!services.length) showQuoteError('No services are available right now.');
      return true;
    } catch (err) {
      if (!active || ctx.signal.aborted) return false;
      serviceRetry.classList.remove('hidden');
      showError(err);
      return false;
    }
  }
  serviceRetry.addEventListener('click', async () => {
    if (await loadServices() && selectedService && position) fetchQuote();
  });

  async function useGps() {
    gpsButton.disabled = true;
    try {
      const nextPosition = await getPosition();
      if (!active) return;
      position = { lat: nextPosition.lat, lng: nextPosition.lng };
      savePosition(position);
      if (mapController) mapController.setPin(position.lat, position.lng);
      locationHint.classList.add('hidden');
      fetchQuote();
    } catch (err) {
      if (active) toast(locationMessage(err && err.code), 'info');
    } finally {
      if (active) gpsButton.disabled = false;
    }
  }
  gpsButton.addEventListener('click', useGps);

  function setFallback() {
    mapElement.classList.add('zd-map-fallback');
    clear(mapElement);
    mapElement.appendChild(el('p', {}, 'Map unavailable. Enter your location below.'));
    const fallbackGps = el('button', { class: 'btn soft', type: 'button' }, 'Use GPS');
    fallbackGps.addEventListener('click', useGps);
    mapElement.appendChild(fallbackGps);
  }

  async function initializeLocation() {
    if (!position) {
      try {
        position = await getPosition();
        if (!active) return;
        savePosition(position);
      } catch (err) {
        if (!active) return;
        position = { lat: DURBAN.lat, lng: DURBAN.lng };
        locationHint.classList.remove('hidden');
      }
    }
    try {
      const controller = await createMap(mapElement, {
        lat: position.lat,
        lng: position.lng,
        draggablePin: true,
        onPinMove(nextPosition) {
          position = nextPosition;
          savePosition(position);
          scheduleQuote();
        },
      });
      if (!active) {
        controller.destroy();
        return;
      }
      mapController = controller;
      watchMapResize(mapController, ctx);
      mapElement.textContent = '';
      mapController.invalidate();
    } catch (err) {
      if (!active) return;
      setFallback();
    }
    if (active && selectedService) fetchQuote();
  }

  function renderChangedPrice(totalCents) {
    clear(changedBanner);
    changedBanner.appendChild(el('span', {},
      'The price changed to ' + formatZAR(totalCents) + '. Tap Request help again to confirm.'
    ));
    changedBanner.classList.remove('hidden');
  }

  async function resumeActiveRequest() {
    const data = await apiFetch('/requests', { signal: ctx.signal });
    const current = (data.requests || []).find((request) => ACTIVE_STATUSES.includes(request.status));
    if (!current) return false;
    const resume = await modal({
      title: 'You already have a request in progress',
      actions: [
        { label: 'Not now', kind: 'soft', value: false },
        { label: 'Resume', kind: 'primary', value: true },
      ],
    });
    if (resume && active) ctx.navigate(resumePath(current));
    return true;
  }

  async function submitRequest() {
    if (submitting || !quote || !selectedService || !position || quoteError.textContent) return;
    submitting = true;
    requestButton.disabled = true;
    clear(requestButton);
    requestButton.appendChild(spinner());
    requestButton.appendChild(document.createTextNode('Sending…'));
    try {
      const data = await apiFetch('/requests', {
        method: 'POST',
        body: {
          serviceId: selectedService.id,
          lat: position.lat,
          lng: position.lng,
          addressText: addressField.getValue(),
          notes: notesInput.value.trim(),
          expectedTotalCents: quote.totalCents,
        },
        signal: ctx.signal,
      });
      if (!active) return;
      const request = data.request || data;
      const offersSent = Number.isFinite(data.offersSent) ? data.offersSent : 0;
      ctx.navigate('/searching/' + encodeURIComponent(request.id) + '?offers=' + encodeURIComponent(offersSent));
    } catch (err) {
      if (!active || ctx.signal.aborted) return;
      if (err.code === 'ZD-REQ-008') {
        if (Number.isFinite(err.details && err.details.newTotalCents)) {
          quote = { ...quote, totalCents: err.details.newTotalCents };
          renderPrice();
          renderChangedPrice(quote.totalCents);
        } else {
          await fetchQuote();
          if (quote) renderChangedPrice(quote.totalCents);
        }
      } else if (err.code === 'ZD-REQ-003') {
        try {
          const found = await resumeActiveRequest();
          if (!found && active) showError(err);
        } catch (lookupError) {
          if (active && !ctx.signal.aborted) showError(lookupError);
        }
      } else if (err.code === 'ZD-PAY-006') {
        const body = el('div', {}, 'Please pay your previous job total of ' +
          formatZAR(err.details && err.details.totalCents) + ' before requesting help again.');
        const payNow = await modal({
          title: 'Please pay for your last job first',
          body,
          actions: [
            { label: 'Cancel', kind: 'soft', value: false },
            { label: 'Pay now', kind: 'primary', value: true },
          ],
        });
        if (payNow && active && err.details && err.details.requestId) {
          ctx.navigate('/pay/' + encodeURIComponent(err.details.requestId));
        }
      } else if (err.code === 'ZD-USR-001') {
        ctx.navigate('/profile-setup');
      } else {
        showError(err);
      }
    } finally {
      submitting = false;
      if (active) {
        clear(requestButton);
        requestButton.textContent = 'Request help';
        requestButton.disabled = !quote || !!quoteError.textContent;
      }
    }
  }
  requestButton.addEventListener('click', submitRequest);

  ctx.onLeave(() => {
    active = false;
    quoteSequence += 1;
    if (quoteTimer) clearTimeout(quoteTimer);
    quoteTimer = null;
    if (mapController) mapController.destroy();
    mapController = null;
  });

  loadServices().then((loaded) => {
    if (loaded && position && selectedService) fetchQuote();
  });
  initializeLocation();
  return screen;
}