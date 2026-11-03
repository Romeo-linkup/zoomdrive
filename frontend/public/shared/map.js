let leafletPromise = null;
const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js';

function addStylesheet() {
  if (document.querySelector('link[href="' + LEAFLET_CSS + '"]')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LEAFLET_CSS;
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => {
      if (link.parentNode) link.parentNode.removeChild(link);
      reject(new Error('Map failed to load'));
    }, { once: true });
    document.head.appendChild(link);
  });
}

export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;

  leafletPromise = new Promise((resolve, reject) => {
    let script = null;
    const fail = (removeScript) => {
      if (removeScript && script && script.parentNode) script.parentNode.removeChild(script);
      leafletPromise = null;
      reject(new Error('Map failed to load'));
    };

    addStylesheet().then(() => {
      if (window.L) {
        resolve(window.L);
        return;
      }
      const existing = document.querySelector('script[src="' + LEAFLET_JS + '"]');
      script = existing || document.createElement('script');
      script.addEventListener('error', () => fail(!existing), { once: true });
      script.addEventListener('load', () => {
        if (window.L) resolve(window.L);
        else fail(!existing);
      }, { once: true });
      if (!existing) {
        script.src = LEAFLET_JS;
        script.async = true;
        document.head.appendChild(script);
      }
    }).catch((error) => {
      console.error('[ZD-ERR]', error);
      fail(false);
    });
  });

  return leafletPromise;
}

export async function createMap(element, {
  lat,
  lng,
  zoom = 14,
  draggablePin = false,
  onPinMove,
} = {}) {
  const L = await loadLeaflet();
  const map = L.map(element).setView([lat, lng], zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);

  const makeIcon = (emoji, className) => L.divIcon({
    className: 'zd-pin ' + className,
    html: '<span aria-hidden="true">' + emoji + '</span>',
    iconSize: [36, 42],
    iconAnchor: [18, 38],
  });
  let pin = L.marker([lat, lng], {
    icon: makeIcon('📍', 'zd-pin-driver'),
    draggable: draggablePin,
  }).addTo(map);
  let providerPin = null;
  let moveTimer = null;
  let destroyed = false;

  function notifyPinMove(position) {
    if (!onPinMove || destroyed) return;
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      moveTimer = null;
      if (!destroyed) onPinMove({ lat: position.lat, lng: position.lng });
    }, 400);
  }

  if (draggablePin) {
    pin.on('dragend', () => {
      notifyPinMove(pin.getLatLng());
    });
    map.on('click', (event) => {
      pin.setLatLng(event.latlng);
      notifyPinMove(event.latlng);
    });
  }

  return {
    setPin(nextLat, nextLng) {
      pin.setLatLng([nextLat, nextLng]);
      map.panTo([nextLat, nextLng]);
    },
    getPin() {
      const position = pin.getLatLng();
      return { lat: position.lat, lng: position.lng };
    },
    setProviderPin(nextLat, nextLng) {
      if (!providerPin) {
        providerPin = L.marker([nextLat, nextLng], {
          icon: makeIcon('🚐', 'zd-pin-provider'),
        }).addTo(map);
      } else {
        providerPin.setLatLng([nextLat, nextLng]);
      }
    },
    fitTo(points) {
      const validPoints = (points || [])
        .filter((point) => point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)))
        .map((point) => [Number(point.lat), Number(point.lng)]);
      if (validPoints.length) map.fitBounds(L.latLngBounds(validPoints), { padding: [24, 24] });
    },
    invalidate() {
      if (!destroyed) map.invalidateSize();
    },
    destroy() {
      destroyed = true;
      if (moveTimer) clearTimeout(moveTimer);
      moveTimer = null;
      map.off();
      map.remove();
      pin = null;
      providerPin = null;
    },
  };
}

export function watchMapResize(controller, ctx) {
  let resizeTimer = null;
  const invalidate = () => {
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      controller.invalidate();
    }, 150);
  };
  window.addEventListener('resize', invalidate);
  window.addEventListener('orientationchange', invalidate);
  invalidate();
  ctx.onLeave(() => {
    window.removeEventListener('resize', invalidate);
    window.removeEventListener('orientationchange', invalidate);
    if (resizeTimer !== null) clearTimeout(resizeTimer);
    resizeTimer = null;
  });
}