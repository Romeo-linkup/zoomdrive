import { el } from '../../shared/ui.js';
import { CONFIG } from '../../shared/config.js';
import { createInstallControl } from '../../shared/pwa.js';
import { logout } from '../../shared/auth.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { renderPageError } from '../../shared/errors.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    return await renderSettings(ctx, screen);
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderSettings(ctx, screen) {
  screen.appendChild(createTopbar({ title: 'Settings', onBack: () => ctx.navigate('/menu') }));

  const about = el('div', { class: 'card' });
  about.appendChild(el('h2', {}, 'About'));
  about.appendChild(el('p', {}, 'ZoomDrive Partner app'));
  about.appendChild(el('p', { class: 'mu' }, 'App version ' + CONFIG.APP_VERSION));
  screen.appendChild(about);

  const install = createInstallControl(ctx);
  if (install) {
    screen.appendChild(install);
  }

  const actions = el('div', { class: 'card' });
  actions.appendChild(el('h2', {}, 'Account'));

  const editProfile = el('a', { class: 'item', href: '#/profile-setup?edit=true', attrs: { 'aria-label': 'Edit profile' } });
  editProfile.appendChild(el('div', { class: 'ic' }, '✏️'));
  editProfile.appendChild(el('div', { class: 't' }, 'Edit profile'));
  editProfile.appendChild(el('span', { class: 'r' }, '›'));
  actions.appendChild(editProfile);

  const logOut = el('button', { class: 'item', type: 'button', attrs: { 'aria-label': 'Log out' } });
  logOut.appendChild(el('div', { class: 'ic' }, '🚪'));
  logOut.appendChild(el('div', { class: 't' }, 'Log out'));
  logOut.addEventListener('click', () => logout());
  actions.appendChild(logOut);
  screen.appendChild(actions);

  return screen;
}
