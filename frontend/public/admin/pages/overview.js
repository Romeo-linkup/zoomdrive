// admin/pages/overview.js
import { el, clear } from '../../shared/ui.js';
import { apiFetch } from '../../shared/api.js';
import { formatZAR } from '../../shared/ui.js';
import { showError, clearError } from '../../shared/errors.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  
  const head = el('div', { class: 'page-head' });
  head.appendChild(el('h1', {}, 'Overview'));
  const refreshBtn = el('button', { class: 'btn soft', type: 'button' }, 'Refresh');
  head.appendChild(refreshBtn);
  screen.appendChild(head);
  
  const stats = el('div', { class: 'stats' });
  screen.appendChild(stats);
  
  async function load() {
    clearError();
    try {
      const data = await apiFetch('/admin/overview');
      renderStats(data);
    } catch (err) {
      showError(err);
      renderStats({});
    }
  }
  
  function renderStats(data) {
    clear(stats);
    
    const cards = [
      { label: 'Pending providers', value: data.pendingProviders || 0, alert: data.pendingProviders > 0, link: data.pendingProviders > 0 ? '#/providers?status=pending' : null },
      { label: 'Approved providers', value: data.approvedProviders || 0 },
      { label: 'Rejected providers', value: data.rejectedProviders || 0 },
      { label: 'Incomplete sign-ups', value: data.incompleteProviders || 0 },
      { label: 'Drivers', value: data.drivers || 0 },
      { label: 'Providers', value: data.providers || 0 },
      { label: 'Active requests', value: data.activeRequests || 0 },
      { label: 'Jobs today', value: data.jobsToday || 0 },
      { label: 'Gross today', value: formatZAR(data.grossTodayCents || 0) },
      { label: 'Platform revenue today', value: formatZAR(data.commissionTodayCents || 0) },
    ];
    
    for (const card of cards) {
      const cardEl = el('div', { class: 'stat' + (card.alert ? ' alert' : '') });
      const b = el('b', {}, String(card.value));
      if (card.link) {
        const a = el('a', { href: card.link }, b);
        cardEl.appendChild(a);
      } else {
        cardEl.appendChild(b);
      }
      cardEl.appendChild(el('span', {}, card.label));
      stats.appendChild(cardEl);
    }
  }
  
  const note = el('div', { class: 'mu' }, 'Requests, payouts and the audit log arrive in later phases.');
  screen.appendChild(note);
  
  refreshBtn.addEventListener('click', load);
  
  ctx.onLeave(() => {
    // no cleanup needed
  });
  
  await load();
  
  return screen;
}
