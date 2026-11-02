export const DURBAN = Object.freeze({ lat: -29.8587, lng: 31.0218 });

function mapGeolocationError(error) {
  if (!error) return 'UNAVAILABLE';
  if (error.code === 1) return 'DENIED';
  if (error.code === 2) return 'UNAVAILABLE';
  if (error.code === 3) return 'TIMEOUT';
  return 'UNAVAILABLE';
}

export function getPosition({ timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject({ code: 'UNSUPPORTED' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      (error) => reject({ code: mapGeolocationError(error) }),
      { enableHighAccuracy: true, timeout: timeoutMs }
    );
  });
}