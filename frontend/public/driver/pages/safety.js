import { el } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';

export default function render(ctx) {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Safety', onBack: () => ctx.navigate('/account') }));
  const before = el('section', { class: 'card' });
  before.appendChild(el('h2', {}, 'Before you request'));
  before.appendChild(el('p', {}, 'Stay somewhere safe and visible.'));
  before.appendChild(el('p', {}, 'Turn on your hazard lights.'));
  screen.appendChild(before);
  const arrival = el('section', { class: 'card' });
  arrival.appendChild(el('h2', {}, 'When your provider arrives'));
  arrival.appendChild(el('p', {}, 'Check the name, photo and plate in the app before you open the door.'));
  screen.appendChild(arrival);
  const emergency = el('section', { class: 'card' });
  emergency.appendChild(el('h2', {}, 'Emergency numbers'));
  emergency.appendChild(el('p', {}, 'Police: ', el('a', { href: 'tel:10111' }, '10111')));
  emergency.appendChild(el('p', {}, 'Ambulance: ', el('a', { href: 'tel:10177' }, '10177')));
  emergency.appendChild(el('p', {}, 'The national emergency number from a mobile is 112.'));
  screen.appendChild(emergency);
  return screen;
}