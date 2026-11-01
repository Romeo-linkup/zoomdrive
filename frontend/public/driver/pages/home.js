// driver/pages/home.js
import { el } from '../../shared/ui.js';
import { isAuthed } from '../../shared/auth.js';
import { createBrandBar } from '../../shared/components/topbar.js';
import { goToLogin } from '../../shared/router.js';

export default (ctx) => {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createBrandBar('driver'));

  if (!isAuthed()) {
    const banner = el('div', { class: 'banner' });
    banner.appendChild(el('b', {}, 'Browsing as a guest'));
    const link = el('button', { class: 'link-btn', type: 'button' }, 'Create a profile');
    link.addEventListener('click', () => ctx.navigate('/phone?mode=signup'));
    banner.appendChild(link);
    screen.appendChild(banner);
  }

  screen.appendChild(el('h1', {}, "Stuck? We'll come to you."));

  const whereBtn = el('button', { class: 'item', type: 'button' });
  whereBtn.appendChild(el('div', { class: 'ic' }, '📍'));
  whereBtn.appendChild(el('div', { class: 't' }, 'Where are you?'));
  screen.appendChild(whereBtn);

  function startRequest() {
    if (!isAuthed()) {
      ctx.navigate(goToLogin('/request'));
    } else {
      ctx.navigate('/request');
    }
  }

  whereBtn.addEventListener('click', startRequest);

  const tiles = el('div', { class: 'tiles' });
  // P9.2 will replace this static list with GET /services
  const services = [
    { emoji: '🛞', name: 'Flat tyre' },
    { emoji: '🔋', name: 'Jump-start' },
    { emoji: '🧰', name: 'Essentials' },
    { emoji: '🚛', name: 'Towing' },
  ];
  services.forEach((s) => {
    const tile = el('button', { class: 'tile', type: 'button' });
    tile.appendChild(el('span', {}, s.emoji));
    tile.appendChild(document.createTextNode(s.name));
    tile.addEventListener('click', startRequest);
    tiles.appendChild(tile);
  });
  screen.appendChild(tiles);

  const fleetCard = el('div', { class: 'card' });
  fleetCard.appendChild(el('h3', {}, 'Fleet profile'));
  fleetCard.appendChild(el('p', {}, 'Coming soon'));
  screen.appendChild(fleetCard);

  return screen;
};
