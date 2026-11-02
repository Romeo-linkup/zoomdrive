import { getSession } from '../../shared/auth.js';
import { el } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';

export default (ctx) => {
  const screen = el('div', { class: 'screen' });
  const session = getSession();
  const status = session && session.providerStatus ? session.providerStatus : 'pending';

  screen.appendChild(createTopbar({
    title: 'Application status',
    onBack: () => ctx.navigate('/documents'),
  }));

  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', {}, status === 'rejected' ? 'Profile update needed' : 'Profile under review'));
  card.appendChild(el('p', {}, status === 'rejected'
    ? 'Your details were rejected. Please fix the highlighted issue and resubmit.'
    : 'We are reviewing your details. You will be notified once the profile is approved.'));

  if (status === 'rejected') {
    const fixBtn = el('button', { class: 'btn', type: 'button' }, 'Fix and resubmit');
    fixBtn.addEventListener('click', () => ctx.navigate('/profile-setup'));
    card.appendChild(fixBtn);
  }

  screen.appendChild(card);
  return screen;
};
