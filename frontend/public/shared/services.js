// shared/services.js
import { apiFetch } from './api.js';

let cachedServices = null;

export async function loadServices() {
  if (cachedServices) return cachedServices;
  try {
    cachedServices = await apiFetch('/services');
    return cachedServices;
  } catch (e) {
    cachedServices = null;
    throw e;
  }
}

export function serviceEmoji(service) {
  const map = {
    'flat_tyre': '🛞',
    'jump_start': '🔋',
    'essentials': '🧰',
    'towing': '🚛',
    'fuel': '⛽',
  };
  return map[service] || '🔧';
}
