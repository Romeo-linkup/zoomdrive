// driver/pages/account.js
import { el, modal, toast } from '../../shared/ui.js';
import { isAuthed, getUser, logout } from '../../shared/auth.js';
import { goToLogin } from '../../shared/router.js';
import { createBrandBar } from '../../shared/components/topbar.js';
import { formatPhone } from '../../shared/ui.js';

export default (ctx) => {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createBrandBar('driver'));

  if (!isAuthed()) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('p', {}, 'Create a profile to request help'));
    const signupBtn = el('button', { class: 'btn', type: 'button' }, 'Sign up');
    signupBtn.addEventListener('click', () => ctx.navigate('/phone?mode=signup'));
    card.appendChild(signupBtn);
    const loginBtn = el('button', { class: 'btn soft', type: 'button' }, 'Log in');
    loginBtn.addEventListener('click', () => ctx.navigate('/phone?mode=login'));
    card.appendChild(loginBtn);
    screen.appendChild(card);
  } else {
    const user = getUser();
    const header = el('div', { class: 'pr' });
    const avatar = el('div', { class: 'av avatar-lg' });
    if (user && user.photoUrl) {
      avatar.style.backgroundImage = 'url("' + user.photoUrl + '")';
    } else {
      const initials = (user && user.firstName && user.lastName) 
        ? (user.firstName.charAt(0) + user.lastName.charAt(0)).toUpperCase()
        : '?';
      avatar.textContent = initials;
    }
    header.appendChild(avatar);
    const info = el('div', { class: 't' });
    const name = user && user.firstName && user.lastName
      ? user.firstName + ' ' + user.lastName
      : 'Driver';
    info.appendChild(el('div', {}, name));
    if (user && user.phone) {
      info.appendChild(el('small', {}, formatPhone(user.phone)));
    }
    header.appendChild(info);
    screen.appendChild(header);

    const verifyBanner = el('div', { class: 'banner warn' });
    verifyBanner.appendChild(el('span', {}, 'Verify your identity'));
    screen.appendChild(verifyBanner);

    const actions = [
      { label: 'Profile', path: '/profile-setup' },
      { label: 'Payment', handler: () => toast('Coming soon') },
      { label: 'Saved places', handler: () => toast('Coming soon') },
      { label: 'Support', handler: () => toast('Coming soon') },
      { label: 'Safety', handler: () => toast('Coming soon') },
      { label: 'Settings', handler: () => toast('Coming soon') },
      { label: 'Promotions', handler: () => toast('Coming soon') },
    ];

    actions.forEach((a) => {
      const item = el('button', { class: 'item', type: 'button' });
      item.appendChild(el('div', { class: 'ic' }, '→'));
      item.appendChild(el('div', { class: 't' }, a.label));
      if (a.path) {
        item.addEventListener('click', () => ctx.navigate(a.path));
      } else if (a.handler) {
        item.addEventListener('click', a.handler);
      }
      screen.appendChild(item);
    });

    const logoutBtn = el('button', { class: 'btn red', type: 'button' }, 'Log out');
    logoutBtn.addEventListener('click', async () => {
      const confirmed = await modal({
        title: 'Log out?',
        body: 'You will need your phone number and a new code to sign back in.',
        actions: [
          { label: 'Cancel', kind: 'soft', value: false },
          { label: 'Log out', kind: 'red', value: true },
        ],
      });
      if (confirmed) {
        await logout();
      }
    });
    screen.appendChild(logoutBtn);
  }

  return screen;
};
