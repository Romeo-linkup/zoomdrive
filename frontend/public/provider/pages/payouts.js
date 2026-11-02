import { el } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { createPageError } from './pageError.js';

export default async function render(ctx) {
  try {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(createTopbar({ title: 'Payout methods', onBack: () => ctx.navigate('/menu') }));
    const card = el('div', { class: 'card' });
    card.appendChild(el('h2', {}, 'Payout methods arrive with payments'));
    const addButton = el('button', { class: 'btn', type: 'button', attrs: { disabled: 'disabled' } }, 'Add payout method');
    card.appendChild(addButton);
    screen.appendChild(card);
    return screen;
  } catch (err) {
    return createPageError(err, () => ctx.navigate(ctx.path));
  }
}