// shared/components/bottom-nav.js
import { el, clear } from '../ui.js';

export function createBottomNav({ items, current }) {
  const nav = el('nav', { class: 'nav', attrs: { 'aria-label': 'Main' } });
  items.forEach((item) => {
    const btn = el('button', { class: 'nav-item', attrs: { 'aria-label': item.label } });
    if (item.path === current) {
      btn.classList.add('on');
      btn.setAttribute('aria-current', 'page');
    }
    btn.addEventListener('click', () => {
      location.hash = '#' + item.path;
    });
    const ico = el('span', { class: 'ico' }, item.icon);
    btn.appendChild(ico);
    btn.appendChild(document.createTextNode(item.label));
    nav.appendChild(btn);
  });
  return nav;
}

export function setActive(navEl, path) {
  if (!navEl) return;
  const items = navEl.querySelectorAll('.nav-item');
  items.forEach((btn) => {
    btn.classList.remove('on');
    btn.removeAttribute('aria-current');
  });
  const active = Array.from(items).find((btn) => {
    const onClick = btn.onclick;
    if (onClick) {
      const pathAttr = '#' + path;
      return onClick.toString().includes(pathAttr);
    }
    return false;
  });
  if (active) {
    active.classList.add('on');
    active.setAttribute('aria-current', 'page');
  }
}
