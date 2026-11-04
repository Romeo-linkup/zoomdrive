import { el } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { renderPageError } from '../../shared/errors.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    return await renderSafety(ctx, screen);
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderSafety(ctx, screen) {
  screen.appendChild(createTopbar({ title: 'Safety', onBack: () => ctx.navigate('/menu') }));
  screen.appendChild(el('h1', {}, 'Roadside safety'));

  const before = el('section', { class: 'card' });
  before.appendChild(el('h2', {}, 'Before you start'));
  before.appendChild(el('p', {}, 'Turn on your hazard lights and park well clear of moving traffic.'));
  before.appendChild(el('p', {}, 'Stay on the side of the road away from passing vehicles.'));
  screen.appendChild(before);

  const verify = el('section', { class: 'card' });
  verify.appendChild(el('h2', {}, 'Verify the job'));
  verify.appendChild(el('p', {}, 'Confirm the driver name and number plate match what is shown in the app before you approach.'));
  screen.appendChild(verify);

  const location = el('section', { class: 'card' });
  location.appendChild(el('h2', {}, 'Share your location'));
  location.appendChild(el('p', {}, 'Keep location sharing on so the driver and ZoomDrive can see where you are while you are on a job.'));
  screen.appendChild(location);

  const unsafe = el('section', { class: 'card' });
  unsafe.appendChild(el('h2', {}, 'If you feel unsafe'));
  unsafe.appendChild(el('p', {}, 'Return to your vehicle, lock the doors, and call emergency services. Do not approach the vehicle or the driver.'));
  screen.appendChild(unsafe);

  const emergency = el('section', { class: 'card' });
  emergency.appendChild(el('h2', {}, 'Emergency numbers'));
  emergency.appendChild(el('p', {}, 'Police: ', el('a', { href: 'tel:10111' }, '10111')));
  emergency.appendChild(el('p', {}, 'Ambulance: ', el('a', { href: 'tel:10177' }, '10177')));
  emergency.appendChild(el('p', {}, 'From a mobile you can also dial 112.'));
  screen.appendChild(emergency);

  return screen;
}
