import { el } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';

export default function render(ctx) {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Payment methods', onBack: () => ctx.navigate('/account') }));
  const card = el('div', { class: 'card' });
  card.appendChild(el('h2', {}, 'Payment methods'));
  card.appendChild(el('p', {}, 'Card payments arrive soon. For now you pay after the job.'));
  card.appendChild(el('button', { class: 'btn', type: 'button', disabled: true }, 'Add card'));
  screen.appendChild(card);
  return screen;
}