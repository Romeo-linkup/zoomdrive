import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError } from '../../shared/errors.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, formatDate, formatZAR } from '../../shared/ui.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ENTRY_LABELS = {
  earning: 'Card payment',
  commission: 'Cash job commission',
  payout: 'Payout',
  adjustment: 'Adjustment',
};

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    await renderEarnings(ctx, screen);
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderEarnings(ctx, screen) {
  screen.appendChild(createTopbar({ title: 'Earnings' }));
  const data = await apiFetch('/providers/me/earnings', { signal: ctx.signal });
  if (ctx.signal.aborted) return;

  const balanceCard = el('div', { class: 'card' });
  balanceCard.appendChild(el('h2', {}, data.balanceCents >= 0
    ? 'We owe you ' + formatZAR(data.balanceCents)
    : 'You owe ZoomDrive ' + formatZAR(Math.abs(data.balanceCents))));
  if (data.balanceCents >= 0) {
    balanceCard.classList.add('provider-balance-positive');
  } else {
    balanceCard.classList.add('provider-balance-negative');
    balanceCard.appendChild(el('p', {}, 'This is commission on cash jobs. It is subtracted from your next payout.'));
  }
  screen.appendChild(balanceCard);

  if (data.pendingPaymentsCount > 0) {
    screen.appendChild(el('div', { class: 'banner warn' },
      el('span', {}, data.pendingPaymentsCount + ' completed job' +
        (data.pendingPaymentsCount === 1 ? ' is' : 's are') + ' waiting for payment')
    ));
  }

  const todayCard = el('div', { class: 'card' });
  todayCard.appendChild(el('h2', {}, 'Today'));
  todayCard.appendChild(el('div', { class: 'big' }, formatZAR(data.today && data.today.earningCents)));
  todayCard.appendChild(el('p', { class: 'mu' }, (Number(data.today && data.today.jobs) || 0) + ' paid job' +
    ((Number(data.today && data.today.jobs) || 0) === 1 ? '' : 's')));
  screen.appendChild(todayCard);

  const weekCard = el('div', { class: 'card' });
  weekCard.appendChild(el('h2', {}, 'Last 7 days'));
  const bars = el('div', { class: 'bars provider-week-bars' });
  const labels = el('div', { class: 'provider-week-labels' });
  const week = Array.isArray(data.week) ? data.week : [];
  const maxAmount = Math.max(1, ...week.map((day) => Number(day.earningCents) || 0));
  week.forEach((day) => {
    const amount = Number(day.earningCents) || 0;
    const weekday = DAY_NAMES[new Date(day.date + 'T00:00:00Z').getUTCDay()];
    const bar = el('i', { attrs: { title: weekday + ': ' + formatZAR(amount) } });
    bar.style.height = Math.max(4, Math.round((amount / maxAmount) * 90)) + 'px';
    if (amount === 0) bar.classList.add('z');
    bars.appendChild(bar);
    labels.appendChild(el('span', {}, weekday));
  });
  weekCard.appendChild(bars);
  weekCard.appendChild(labels);
  if (week.length === 0) weekCard.appendChild(el('div', { class: 'empty' }, 'No weekly earnings yet.'));
  screen.appendChild(weekCard);

  const activityCard = el('div', { class: 'card' });
  activityCard.appendChild(el('h2', {}, 'Activity'));
  const entries = Array.isArray(data.entries) ? data.entries : [];
  const activityList = el('div', { class: 'card-list' });
  if (entries.length === 0) {
    activityList.appendChild(el('div', { class: 'empty' }, 'No ledger activity yet.'));
  } else {
    entries.forEach((entry) => {
      const row = el('div', { class: 'item provider-job-row' });
      row.appendChild(el('div', { class: 'ic' }, entry.type === 'payout' ? '🏦' : '💰'));
      const text = el('div', { class: 't' });
      text.appendChild(el('span', {}, ENTRY_LABELS[entry.type] || 'Adjustment'));
      text.appendChild(el('small', {}, formatDate(entry.createdAt, 'datetime') +
        (entry.requestId ? ' · Job ' + entry.requestId : '') +
        (entry.note ? ' · ' + entry.note : '')));
      row.appendChild(text);
      const amount = Number(entry.amountCents) || 0;
      const amountClass = amount > 0 ? 'provider-earning' : amount < 0 ? 'provider-balance-negative' : '';
      row.appendChild(el('b', { class: amountClass }, (amount > 0 ? '+' : '') + formatZAR(amount)));
      activityList.appendChild(row);
    });
  }
  activityCard.appendChild(activityList);
  screen.appendChild(activityCard);

  const payoutsCard = el('div', { class: 'card' });
  payoutsCard.appendChild(el('h2', {}, 'Payouts'));
  const payouts = Array.isArray(data.payouts) ? data.payouts : [];
  const payoutsList = el('div', { class: 'card-list' });
  if (payouts.length === 0) {
    payoutsList.appendChild(el('div', { class: 'empty' }, 'No payouts yet.'));
  } else {
    payouts.forEach((payout) => {
      const row = el('div', { class: 'item provider-job-row' });
      row.appendChild(el('div', { class: 'ic' }, '🏦'));
      const info = el('div', { class: 't' });
      info.appendChild(el('span', {}, formatZAR(payout.amountCents)));
      const description = [payout.method, payout.reference, formatDate(payout.paidAt, 'date')]
        .filter(Boolean)
        .join(' · ');
      info.appendChild(el('small', {}, description));
      row.appendChild(info);
      payoutsList.appendChild(row);
    });
  }
  payoutsCard.appendChild(payoutsList);
  screen.appendChild(payoutsCard);
}
