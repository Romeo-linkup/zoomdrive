// driver/pages/home.js
import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError } from '../../shared/errors.js';
import { el, clear, formatZAR, toast } from '../../shared/ui.js';
import { isAuthed } from '../../shared/auth.js';
import { createBrandBar } from '../../shared/components/topbar.js';
import { getPosition } from '../../shared/geo.js';

const POSITION_KEY = 'zd_driver_pos';

function locationMessage(code) {
  if (code === 'DENIED') return 'Location permission is off. You can still pick your spot on the map.';
  if (code === 'TIMEOUT') return 'Location took too long. You can still pick your spot on the map.';
  if (code === 'UNSUPPORTED') return "Location isn't available on this device. You can still pick your spot on the map.";
  return "We couldn't find your location. You can still pick your spot on the map.";
}

function savePosition(position) {
  try {
    sessionStorage.setItem(POSITION_KEY, JSON.stringify({
      lat: position.lat,
      lng: position.lng,
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

export default function render(ctx) {
  try {
    return renderHome(ctx);
  } catch (err) {
    const screen = el('div', { class: 'screen' });
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

function renderHome(ctx) {
  let active = true;
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createBrandBar('driver'));
  const paymentDueBanner = el('div', { class: 'banner warn hidden' });
  screen.appendChild(paymentDueBanner);
  const activeRequestBanner = el('div', { class: 'card hidden' });
  screen.appendChild(activeRequestBanner);

  if (!isAuthed()) {
    const banner = el('div', { class: 'banner' });
    banner.appendChild(el('b', {}, 'Browsing as a guest'));
    const link = el('button', { class: 'link-btn', type: 'button' }, 'Create a profile');
    link.addEventListener('click', () => ctx.navigate('/email?mode=signup'));
    banner.appendChild(link);
    screen.appendChild(banner);
  }

  screen.appendChild(el('h1', {}, 'Stuck? We’ll come to you.'));

  const whereCard = el('div', { class: 'card' });
  const whereHead = el('div', { class: 'pr' });
  whereHead.appendChild(el('h3', {}, 'Where are you?'));
  const gpsBtn = el('button', { class: 'btn soft', type: 'button' }, 'Use GPS');
  gpsBtn.style.width = 'auto';
  gpsBtn.style.margin = '0 0 0 auto';
  gpsBtn.style.padding = '10px 14px';
  whereHead.appendChild(gpsBtn);
  whereCard.appendChild(whereHead);

  const currentLocation = el('button', { class: 'item', type: 'button' });
  currentLocation.appendChild(el('div', { class: 'ic' }, '📍'));
  const currentText = el('div', { class: 't' });
  currentText.appendChild(el('span', {}, 'Current location'));
  currentText.appendChild(el('small', {}, 'Use your location or choose a saved place'));
  currentLocation.appendChild(currentText);
  currentLocation.appendChild(el('span', { class: 'r' }, '›'));
  whereCard.appendChild(currentLocation);
  screen.appendChild(whereCard);

  const savedPlaces = el('div', { class: 'card-list' });
  screen.appendChild(savedPlaces);

  async function useGps() {
    gpsBtn.disabled = true;
    try {
      const position = await getPosition();
      if (!active) return;
      savePosition(position);
      ctx.navigate('/request');
    } catch (err) {
      if (active) toast(locationMessage(err && err.code), 'info');
    } finally {
      if (active) gpsBtn.disabled = false;
    }
  }

  gpsBtn.addEventListener('click', useGps);
  currentLocation.addEventListener('click', useGps);

  const tiles = el('div', { class: 'tiles' });
  screen.appendChild(el('h2', {}, 'What do you need?'));
  screen.appendChild(tiles);

  const servicesRetry = el('button', { class: 'btn soft hidden', type: 'button' }, 'Retry');
  screen.appendChild(servicesRetry);

  function showServiceSkeletons() {
    clear(tiles);
    for (let i = 0; i < 4; i += 1) {
      tiles.appendChild(el('div', { class: 'zd-skeleton', attrs: { 'aria-hidden': 'true' } }));
    }
  }

  function renderServices(services) {
    clear(tiles);
    for (const service of services) {
      const tile = el('button', { class: 'tile', type: 'button' });
      tile.appendChild(el('span', {}, service.icon || '🛠️'));
      tile.appendChild(el('span', {}, service.name));
      tile.appendChild(el('small', {}, formatZAR(service.basePriceCents)));
      tile.addEventListener('click', () => {
        ctx.navigate('/request?service=' + encodeURIComponent(service.id));
      });
      tiles.appendChild(tile);
    }

    const schedule = el('button', {
      class: 'tile',
      type: 'button',
      attrs: { 'aria-disabled': 'true' },
    });
    schedule.disabled = true;
    schedule.appendChild(el('span', {}, '🗓️'));
    schedule.appendChild(document.createTextNode('Schedule'));
    schedule.appendChild(el('small', {}, 'Soon'));
    tiles.appendChild(schedule);
  }

  async function loadServices() {
    servicesRetry.classList.add('hidden');
    showServiceSkeletons();
    try {
      const data = await apiFetch('/services', { auth: false, signal: ctx.signal });
      if (!active) return;
      renderServices(data.services || []);
    } catch (err) {
      if (!active || ctx.signal.aborted) return;
      clear(tiles);
      servicesRetry.classList.remove('hidden');
      showError(err);
    }
  }
  servicesRetry.addEventListener('click', loadServices);
  showServiceSkeletons();
  loadServices();

  async function loadActiveRequest() {
    if (!isAuthed()) return;
    try {
      const data = await apiFetch('/requests', { signal: ctx.signal });
      if (!active) return;
      const paymentDue = (data.requests || []).find((request) =>
        request.status === 'completed' && request.paymentStatus === 'pending'
      );
      clear(paymentDueBanner);
      paymentDueBanner.classList.toggle('hidden', !paymentDue);
      if (paymentDue) {
        paymentDueBanner.appendChild(el('span', {}, 'Payment due'));
        const payNow = el('button', { class: 'link-btn', type: 'button' }, 'Pay now');
        payNow.addEventListener('click', () => ctx.navigate('/pay/' + encodeURIComponent(paymentDue.id)));
        paymentDueBanner.appendChild(payNow);
      }
      const current = (data.requests || []).find((request) =>
        ['searching', 'accepted', 'arrived'].includes(request.status)
      );
      if (!current) return;
      clear(activeRequestBanner);
      activeRequestBanner.classList.remove('hidden');
      activeRequestBanner.classList.add('active-request');
      activeRequestBanner.appendChild(el('b', {}, 'You have a request in progress'));
      const resume = el('button', { class: 'btn', type: 'button' }, 'Resume');
      resume.addEventListener('click', () => ctx.navigate(resumePath(current)));
      activeRequestBanner.appendChild(resume);
    } catch (err) {
      if (active && !ctx.signal.aborted) showError(err);
    }
  }
  loadActiveRequest();

  async function loadSavedPlaces() {
    if (!isAuthed()) return;
    try {
      const data = await apiFetch('/drivers/me/saved-places', { signal: ctx.signal });
      if (!active) return;
      clear(savedPlaces);
      if (!data.places || data.places.length === 0) return;
      savedPlaces.appendChild(el('h3', {}, 'Saved places'));
      for (const place of data.places) {
        const row = el('button', { class: 'item', type: 'button' });
        row.appendChild(el('div', { class: 'ic' }, '📌'));
        const text = el('div', { class: 't' });
        text.appendChild(el('span', {}, place.label));
        text.appendChild(el('small', {}, place.address || ''));
        row.appendChild(text);
        row.appendChild(el('span', { class: 'r' }, '›'));
        row.addEventListener('click', () => {
          savePosition(place);
          ctx.navigate('/request');
        });
        savedPlaces.appendChild(row);
      }
    } catch (err) {
      if (active && !ctx.signal.aborted) showError(err);
    }
  }
  loadSavedPlaces();

  const fleetCard = el('div', { class: 'card' });
  fleetCard.appendChild(el('h3', {}, 'Fleet profile'));
  fleetCard.appendChild(el('span', { class: 'badge off' }, 'Soon'));
  screen.appendChild(fleetCard);

  ctx.onLeave(() => {
    active = false;
  });

  return screen;
}
