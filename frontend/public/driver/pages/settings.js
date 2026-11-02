import { APP_ID, CONFIG } from '../../shared/config.js';
import { el } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';

export default function render(ctx) {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Settings', onBack: () => ctx.navigate('/account') }));

  const profile = el('section', { class: 'settings-section' });
  profile.appendChild(el('h2', {}, 'Profile'));
  const profileLink = el('button', { class: 'item', type: 'button' });
  profileLink.appendChild(el('div', { class: 'ic' }, '👤'));
  profileLink.appendChild(el('div', { class: 't' }, 'Edit profile'));
  profileLink.appendChild(el('span', { class: 'r' }, '›'));
  profileLink.addEventListener('click', () => ctx.navigate('/profile-setup'));
  profile.appendChild(profileLink);
  screen.appendChild(profile);

  const notifications = el('section', { class: 'settings-section' });
  notifications.appendChild(el('h2', {}, 'Notifications'));
  const notificationRow = el('div', { class: 'item settings-notification' });
  notificationRow.appendChild(el('div', { class: 't' }, 'Push notifications'));
  notificationRow.appendChild(el('span', { class: 'badge off' }, 'Coming soon'));
  notificationRow.appendChild(el('input', {
    type: 'checkbox',
    disabled: true,
    attrs: { 'aria-label': 'Push notifications coming soon' },
  }));
  notifications.appendChild(notificationRow);
  screen.appendChild(notifications);

  const privacy = el('section', { class: 'settings-section' });
  privacy.appendChild(el('h2', {}, 'Privacy'));
  privacy.appendChild(el('p', {}, 'Account deletion is handled on request. Contact support.'));
  const supportLink = el('button', { class: 'link-btn', type: 'button' }, 'Contact support');
  supportLink.addEventListener('click', () => ctx.navigate('/support'));
  privacy.appendChild(supportLink);
  screen.appendChild(privacy);

  const app = el('section', { class: 'settings-section' });
  app.appendChild(el('h2', {}, 'App'));
  app.appendChild(el('p', {}, (CONFIG.APPS[APP_ID] && CONFIG.APPS[APP_ID].name) || 'ZoomDrive'));
  app.appendChild(el('small', {}, 'Version ' + CONFIG.APP_VERSION));
  screen.appendChild(app);
  return screen;
}