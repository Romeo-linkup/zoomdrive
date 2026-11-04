import { el } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { renderPageError } from '../../shared/errors.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    return await renderOpportunities(ctx, screen);
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

const PEAK_WINDOWS = [
  'Weekday mornings (school and work drop-off)',
  'Weekday evenings (rush hour)',
  'Weekend afternoons and evenings',
  'Public holidays and long weekends',
  'Bad weather days (rain, storms, extreme heat)',
];

async function renderOpportunities(ctx, screen) {
  screen.appendChild(createTopbar({ title: 'Opportunities', onBack: () => ctx.navigate('/menu') }));
  screen.appendChild(el('h1', {}, 'More ways to earn'));

  const intro = el('div', { class: 'card' });
  intro.appendChild(el('p', {}, 'Job offers come in when drivers nearby request help. Busier times generally mean more offers, so being online during peak windows can increase your chances of receiving jobs.'));
  intro.appendChild(el('p', { class: 'mu' }, 'Offers are not guaranteed and no earnings are promised for any time window.'));
  screen.appendChild(intro);

  const peak = el('div', { class: 'card' });
  peak.appendChild(el('h2', {}, 'Typical busy windows'));
  const list = el('ul', { class: 'peak-list' });
  PEAK_WINDOWS.forEach((windowLabel) => {
    const item = el('li', {}, windowLabel);
    list.appendChild(item);
  });
  peak.appendChild(list);
  screen.appendChild(peak);

  return screen;
}
