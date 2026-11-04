import { apiFetch } from '../../shared/api.js';
import { showError } from '../../shared/errors.js';
import { getSession, logout } from '../../shared/auth.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, clear, formatPhone } from '../../shared/ui.js';
import { createPageError } from './pageError.js';

export default async function render(ctx) {
  try {
    return await renderMenu(ctx);
  } catch (err) {
    return createPageError(err, () => ctx.navigate(ctx.path));
  }
}

function addRow(root, { icon, title, path, soon = false, onClick }) {
  const row = el(path ? 'a' : 'button', path
    ? { class: 'item', href: '#' + path }
    : { class: 'item', type: 'button' });
  row.appendChild(el('div', { class: 'ic' }, icon));
  const text = el('div', { class: 't' }, title);
  if (soon) text.appendChild(el('small', {}, 'Soon'));
  row.appendChild(text);
  row.appendChild(el('span', { class: 'r' }, path ? '›' : soon ? 'Soon' : ''));
  if (onClick) row.addEventListener('click', onClick);
  root.appendChild(row);
}

async function renderMenu(ctx) {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Menu' }));
  const profileCard = el('div', { class: 'card pr provider-profile-menu' });
  const avatar = el('div', { class: 'av avatar-lg' }, '?');
  const profileInfo = el('div', { class: 'provider-info' });
  profileCard.appendChild(avatar);
  profileCard.appendChild(profileInfo);
  screen.appendChild(profileCard);

  const registrationRow = el('div', { class: 'item' });
  registrationRow.appendChild(el('div', { class: 'ic' }, '💳'));
  registrationRow.appendChild(el('div', { class: 't' }, 'Registration fee'));
  const feeStatus = el('span', { class: 'p' }, 'Loading…');
  registrationRow.appendChild(feeStatus);
  registrationRow.addEventListener('click', () => ctx.navigate('/registration-fee'));
  screen.appendChild(registrationRow);

  screen.appendChild(el('h3', {}, 'Account'));
  addRow(screen, { icon: '❔', title: 'Help', path: '/help' });
  addRow(screen, { icon: '🛡️', title: 'Safety', path: '/safety' });
  addRow(screen, { icon: '⚙️', title: 'Settings', path: '/settings' });
  screen.appendChild(el('h3', {}, 'More ways to earn'));
  addRow(screen, { icon: '✨', title: 'Opportunities', path: '/opportunities' });
  addRow(screen, { icon: '🤝', title: 'Referrals', path: '/referrals' });
  screen.appendChild(el('h3', {}, 'Manage'));
  addRow(screen, { icon: '🚐', title: 'Vehicle and service kit', path: '/vehicle' });
  addRow(screen, { icon: '🧰', title: 'Services offered', path: '/services' });
  addRow(screen, { icon: '📄', title: 'Documents', path: '/documents' });
  screen.appendChild(el('h3', {}, 'Money'));
  addRow(screen, { icon: '🧾', title: 'Tax info', path: '/tax-info' });
  addRow(screen, { icon: '🏦', title: 'Payout methods', path: '/payouts' });
  const logOut = el('button', { class: 'btn soft', type: 'button' }, 'Log out');
  logOut.addEventListener('click', () => logout());
  screen.appendChild(logOut);

  const session = getSession();
  function renderProfile(user, profile) {
    const firstName = user && user.firstName ? user.firstName : '';
    const lastName = user && user.lastName ? user.lastName : '';
    clear(profileInfo);
    profileInfo.appendChild(el('strong', {}, [firstName, lastName].filter(Boolean).join(' ') || 'Provider'));
    if (user && user.email) profileInfo.appendChild(el('small', {}, user.email));
    if (user && user.phone) profileInfo.appendChild(el('small', {}, formatPhone(user.phone)));
    const ratingCount = Number(profile && profile.ratingCount) || 0;
    if (profile && profile.ratingAvg !== null && profile.ratingAvg !== undefined && ratingCount > 0) {
      const rating = Number(profile.ratingAvg);
      profileInfo.appendChild(el('small', {}, (Number.isFinite(rating) ? rating.toFixed(1) : 'New') + ' rating'));
    } else {
      profileInfo.appendChild(el('small', {}, 'New'));
    }
    if (user && user.photoUrl) {
      clear(avatar);
      avatar.appendChild(el('img', { class: 'provider-photo', attrs: { src: user.photoUrl, alt: firstName || 'Provider' } }));
      avatar.classList.add('has-photo');
    } else {
      avatar.classList.remove('has-photo');
      avatar.textContent = (firstName || '?').charAt(0).toUpperCase();
    }
  }
  renderProfile(session && session.user, session && session.profile);
  addRow(screen, { icon: '✏️', title: 'Edit profile', path: '/profile-setup?edit=true' });

  try {
    const [me, fee] = await Promise.all([
      apiFetch('/auth/me', { signal: ctx.signal }),
      apiFetch('/providers/me/registration-fee', { signal: ctx.signal }),
    ]);
    renderProfile(me.user, me.profile);
    feeStatus.textContent = fee.paid ? 'Paid' : fee.waived ? 'Waived' : fee.required ? 'Unpaid' : 'Not required';
  } catch (err) {
    if (!ctx.signal.aborted) showError(err);
    feeStatus.textContent = 'Unavailable';
  }
  return screen;
}