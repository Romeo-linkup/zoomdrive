import { apiFetch } from '../../shared/api.js';
import { renderPageError } from '../../shared/errors.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, formatZAR } from '../../shared/ui.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    return await renderTaxInfo(ctx, screen);
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderTaxInfo(ctx, screen) {
  screen.appendChild(createTopbar({ title: 'Tax info', onBack: () => ctx.navigate('/menu') }));
  screen.appendChild(el('h1', {}, 'Tax info'));
  screen.appendChild(el('p', { class: 'mu' }, 'Read-only earnings summary for your own records.'));

  const data = await apiFetch('/providers/me/earnings', { signal: ctx.signal });
  if (ctx.signal.aborted) return;

  const summary = el('div', { class: 'card' });
  summary.appendChild(el('h2', {}, 'Earnings summary'));

  const balance = el('p', {}, 'Balance: ' + formatZAR(Number(data.balanceCents || 0)));
  summary.appendChild(balance);

  const today = Number(data.today && data.today.earningCents) || 0;
  summary.appendChild(el('p', {}, 'Today: ' + formatZAR(today)));

  const week = Array.isArray(data.week) ? data.week : [];
  const weekTotal = week.reduce((sum, day) => sum + (Number(day.earningCents) || 0), 0);
  summary.appendChild(el('p', {}, 'Last 7 days: ' + formatZAR(weekTotal)));

  screen.appendChild(summary);

  if (week.length > 0) {
    const byMonth = el('div', { class: 'card' });
    byMonth.appendChild(el('h2', {}, 'By month'));
    const monthTotals = {};
    week.forEach((day) => {
      const month = (day.date || '').slice(0, 7);
      if (!month) return;
      monthTotals[month] = (monthTotals[month] || 0) + (Number(day.earningCents) || 0);
    });
    const list = el('div', { class: 'card-list' });
    if (Object.keys(monthTotals).length === 0) {
      list.appendChild(el('div', { class: 'empty' }, 'No dated entries.'));
    } else {
      Object.entries(monthTotals).sort().forEach(([month, total]) => {
        const row = el('div', { class: 'item' });
        row.appendChild(el('div', { class: 'ic' }, '💰'));
        const text = el('div', { class: 't' });
        text.appendChild(el('span', {}, month));
        row.appendChild(text);
        row.appendChild(el('b', { class: 'provider-earning' }, formatZAR(total)));
        list.appendChild(row);
      });
    }
    byMonth.appendChild(list);
    screen.appendChild(byMonth);
  }

  const note = el('div', { class: 'banner warn' });
  note.appendChild(el('span', {}, 'You are responsible for your own tax. Keep your payout records and consult a tax professional.'));
  screen.appendChild(note);

  return screen;
}
