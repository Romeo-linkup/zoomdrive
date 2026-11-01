// driver/pages/activity.js
import { el } from '../../shared/ui.js';
import { isAuthed } from '../../shared/auth.js';
import { goToLogin } from '../../shared/router.js';

export default (ctx) => {
  const screen = el('div', { class: 'screen' });

  if (!isAuthed()) {
    const empty = el('div', { class: 'empty' });
    empty.appendChild(el('div', { class: 'ico' }, '📋'));
    empty.appendChild(el('div', {}, 'Sign in to see your activity'));
    const btn = el('button', { class: 'btn', type: 'button' }, 'Log in or sign up');
    btn.addEventListener('click', () => ctx.navigate(goToLogin('/activity')));
    empty.appendChild(btn);
    screen.appendChild(empty);
  } else {
    const empty = el('div', { class: 'empty' });
    empty.appendChild(el('div', { class: 'ico' }, '📋'));
    empty.appendChild(el('div', {}, 'No trips yet'));
    empty.appendChild(el('p', { class: 'mu' }, 'Your past requests will appear here.'));
    screen.appendChild(empty);
  }

  return screen;
};
