import { el } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';

export default (ctx) => {
  const screen = el('div', { class: 'screen' });
  const center = el('div', { class: 'page-center' });
  const inner = el('div', { class: 'page-center__inner' });

  inner.appendChild(createTopbar({
    title: 'Choose your account type',
    onBack: () => ctx.navigate('/welcome'),
  }));

  inner.appendChild(el('h2', {}, 'What type of provider are you?'));

  const individualBtn = el('button', { class: 'btn', type: 'button' }, 'Individual');
  individualBtn.addEventListener('click', () => ctx.navigate('/profile-setup?type=individual'));
  inner.appendChild(individualBtn);

  const companyBtn = el('button', { class: 'btn soft', type: 'button' }, 'Company');
  companyBtn.addEventListener('click', () => ctx.navigate('/profile-setup?type=company'));
  inner.appendChild(companyBtn);

  center.appendChild(inner);
  screen.appendChild(center);
  return screen;
};
