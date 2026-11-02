import { el } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';

export default (ctx) => {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({
    title: 'Choose your account type',
    onBack: () => ctx.navigate('/welcome'),
  }));

  screen.appendChild(el('h2', {}, 'What type of provider are you?'));

  const individualBtn = el('button', { class: 'btn', type: 'button' }, 'Individual');
  individualBtn.addEventListener('click', () => ctx.navigate('/profile-setup?type=individual'));
  screen.appendChild(individualBtn);

  const companyBtn = el('button', { class: 'btn soft', type: 'button' }, 'Company');
  companyBtn.addEventListener('click', () => ctx.navigate('/profile-setup?type=company'));
  screen.appendChild(companyBtn);

  return screen;
};
