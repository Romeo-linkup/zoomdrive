// shared/components/topbar.js
import { el } from '../ui.js';

export function createTopbar({ title, onBack, right }) {
  const topbar = el('div', { class: 'topbar' });
  if (onBack) {
    const backBtn = el('button', { class: 'icon-btn', attrs: { 'aria-label': 'Back' } }, '←');
    backBtn.addEventListener('click', onBack);
    topbar.appendChild(backBtn);
  }
  if (title !== undefined && title !== null) {
    topbar.appendChild(el('div', { class: 'title' }, String(title)));
  }
  if (right) {
    topbar.appendChild(right);
  }
  return topbar;
}

export function createBrandBar(appId) {
  const topbar = el('div', { class: 'topbar' });
  const img = el('img', { class: 'brand-img', attrs: { src: '/brand/logo.svg', alt: 'ZoomDrive' } });
  topbar.appendChild(img);
  if (appId === 'provider') {
    const badge = el('span', { class: 'badge dark' }, 'PARTNER');
    topbar.appendChild(badge);
  }
  return topbar;
}
