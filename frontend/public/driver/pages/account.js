// driver/pages/account.js
import { el, modal } from '../../shared/ui.js';
import { apiFetch } from '../../shared/api.js';
import { isAuthed, getUser, logout } from '../../shared/auth.js';
import { createBrandBar } from '../../shared/components/topbar.js';
import { formatPhone } from '../../shared/ui.js';
import { renderPageError, showError } from '../../shared/errors.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    await renderAccount(ctx, screen);
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderAccount(ctx, screen) {
  let active = true;
  ctx.onLeave(() => {
    active = false;
  });
  screen.appendChild(createBrandBar('driver'));

  if (!isAuthed()) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('p', {}, 'Create a profile to request help'));
    const signupBtn = el('button', { class: 'btn', type: 'button' }, 'Sign up');
    signupBtn.addEventListener('click', () => ctx.navigate('/email?mode=signup'));
    card.appendChild(signupBtn);
    const loginBtn = el('button', { class: 'btn soft', type: 'button' }, 'Log in');
    loginBtn.addEventListener('click', () => ctx.navigate('/email?mode=login'));
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
    if (user && user.email) {
      info.appendChild(el('small', {}, user.email));
    }
    if (user && user.phone) {
      info.appendChild(el('small', {}, formatPhone(user.phone)));
    }
    header.appendChild(info);
    screen.appendChild(header);

    const verifyBanner = el('div', { class: 'banner warn' });
    verifyBanner.appendChild(el('span', {}, 'Verify your identity · Soon'));
    screen.appendChild(verifyBanner);

    const actions = [
      { label: 'Notifications', path: '/inbox' },
      { label: 'Edit profile', path: '/profile-setup?edit=true' },
      { label: 'Payment', path: '/payment' },
      { label: 'Saved places', path: '/saved-places' },
      { label: 'Support', path: '/support' },
      { label: 'Safety', path: '/safety' },
      { label: 'Settings', path: '/settings' },
      { label: 'Promotions', placeholder: true },
      { label: 'Fleet Profile', placeholder: true },
    ];

    let notificationBadge = null;
    actions.forEach((a) => {
      const item = a.placeholder
        ? el('div', { class: 'item' })
        : el('button', { class: 'item', type: 'button' });
      item.appendChild(el('div', { class: 'ic' }, '→'));
      item.appendChild(el('div', { class: 't' }, a.label));
      if (a.placeholder) item.appendChild(el('span', { class: 'badge off' }, 'Soon'));
      if (a.label === 'Notifications') {
        notificationBadge = el('span', { class: 'badge off hidden' });
        item.appendChild(notificationBadge);
      }
      if (a.path) {
        item.addEventListener('click', () => ctx.navigate(a.path));
      }
      screen.appendChild(item);
    });

    apiFetch('/notifications?unreadOnly=true&page=1', { signal: ctx.signal }).then((data) => {
      if (!active || !notificationBadge) return;
      const unreadCount = Number(data.unreadCount) || 0;
      notificationBadge.textContent = String(unreadCount);
      notificationBadge.classList.toggle('hidden', unreadCount === 0);
    }).catch((err) => {
      if (active && !ctx.signal.aborted) showError(err);
    });

    try {
      const plus = await apiFetch('/drivers/me/plus', { signal: ctx.signal });
      if (plus.enabled) {
        const plusItem = el('button', { class: 'item', type: 'button' });
        plusItem.appendChild(el('div', { class: 'ic' }, '✨'));
        plusItem.appendChild(el('div', { class: 't' }, 'ZoomDrive Plus'));
        plusItem.addEventListener('click', () => ctx.navigate('/plus'));
        screen.appendChild(plusItem);
      }
    } catch (err) {
      if (ctx.signal && ctx.signal.aborted) return screen;
      showError(err);
    }

    const logoutBtn = el('button', { class: 'btn red', type: 'button' }, 'Log out');
    logoutBtn.addEventListener('click', async () => {
      const confirmed = await modal({
        title: 'Log out?',
        body: 'You will need your email and a new code to sign back in.',
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
}
