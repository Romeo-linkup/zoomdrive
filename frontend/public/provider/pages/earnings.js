import { apiFetch } from '../../shared/api.js';
import { showError } from '../../shared/errors.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, formatDate, formatZAR } from '../../shared/ui.js';
import { createPageError } from './pageError.js';

function dateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default async function render(ctx) {
  try {
    return await renderEarnings(ctx);
  } catch (err) {
    return createPageError(err, () => ctx.navigate(ctx.path));
  }
}

async function renderEarnings(ctx) {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Earnings' }));
  screen.appendChild(el('p', { class: 'mu' }, 'Based on your last 50 jobs. Payout balance arrives with payments.'));
  const summary = el('div', { class: 'card' });
  summary.appendChild(el('h2', {}, 'Today'));
  const todayTotal = el('div', { class: 'big' }, 'R0.00');
  summary.appendChild(todayTotal);
  screen.appendChild(summary);
  const weekCard = el('div', { class: 'card' });
  weekCard.appendChild(el('h2', {}, 'This week'));
  const bars = el('div', { class: 'bars provider-week-bars' });
  weekCard.appendChild(bars);
  const dayLabels = el('div', { class: 'provider-week-labels' });
  weekCard.appendChild(dayLabels);
  screen.appendChild(weekCard);
  const recent = el('div', { class: 'card' });
  recent.appendChild(el('h2', {}, 'Recent jobs'));
  screen.appendChild(recent);

  try {
    const data = await apiFetch('/providers/me/jobs', { signal: ctx.signal });
    const past = Array.isArray(data.past) ? data.past.slice(0, 50) : [];
    const completed = past.filter((job) => job.status === 'completed');
    const today = dateKey(new Date());
    const todayCents = completed
      .filter((job) => dateKey(job.completedAt) === today)
      .reduce((sum, job) => sum + (Number(job.earningCents) || 0), 0);
    todayTotal.textContent = formatZAR(todayCents);

    const weekStart = new Date(today + 'T00:00:00Z');
    const weekday = weekStart.getUTCDay();
    weekStart.setUTCDate(weekStart.getUTCDate() - ((weekday + 6) % 7));
    const weekDays = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setUTCDate(date.getUTCDate() + index);
      return date.toISOString().slice(0, 10);
    });
    const totals = weekDays.map((key) => completed
      .filter((job) => dateKey(job.completedAt) === key)
      .reduce((sum, job) => sum + (Number(job.earningCents) || 0), 0));
    const maxTotal = Math.max(1, ...totals);
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    totals.forEach((value, index) => {
      const bar = el('i', { attrs: { title: labels[index] + ': ' + formatZAR(value) } });
      bar.style.height = Math.max(4, Math.round((value / maxTotal) * 90)) + 'px';
      bars.appendChild(bar);
      dayLabels.appendChild(el('span', {}, labels[index]));
    });

    if (!past.length) {
      recent.appendChild(el('div', { class: 'empty' }, 'No completed jobs yet.'));
    } else {
      past.forEach((job) => {
        const row = el('div', { class: 'item provider-job-row' });
        row.appendChild(el('div', { class: 'ic' }, job.service && job.service.icon ? job.service.icon : '🔧'));
        const text = el('div', { class: 't' });
        text.appendChild(el('span', {}, job.service && job.service.name ? job.service.name : 'Roadside job'));
        text.appendChild(el('small', {}, formatDate(job.completedAt || job.cancelledAt, 'datetime')));
        row.appendChild(text);
        row.appendChild(el('div', { class: 'p provider-earning' }, formatZAR(job.earningCents)));
        recent.appendChild(row);
      });
    }
  } catch (err) {
    if (!ctx.signal.aborted) showError(err);
    recent.appendChild(el('div', { class: 'empty' }, 'Earnings could not be loaded.'));
  }
  return screen;
}