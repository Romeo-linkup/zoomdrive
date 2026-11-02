import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError } from '../../shared/errors.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, clear, formatDate, formatZAR, withSpinner } from '../../shared/ui.js';

function waitForRetry(signal) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(finish, 1200);
    function finish() {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    }
    signal.addEventListener('abort', finish, { once: true });
  });
}

export default async function render(ctx) {
  try {
    return await renderPlus(ctx);
  } catch (err) {
    const screen = el('div', { class: 'screen' });
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderPlus(ctx) {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'ZoomDrive Plus', onBack: () => ctx.navigate('/account') }));
  const content = el('div');
  screen.appendChild(content);
  let state = null;
  let busy = false;
  const historyState = history.state && typeof history.state === 'object' ? { ...history.state } : {};
  const isPaymentReturn = historyState.plusPaymentReturn === true;
  if (isPaymentReturn) {
    delete historyState.plusPaymentReturn;
    history.replaceState(historyState, '', location.pathname + location.hash);
  }

  function renderState(current, paymentMessage = '') {
    state = current;
    clear(content);
    if (!current.enabled) {
      content.appendChild(el('div', { class: 'card' }, 'ZoomDrive Plus is not available right now.'));
      return;
    }

    if (paymentMessage) {
      const notice = el('div', { class: 'banner warn' });
      notice.appendChild(el('span', {}, paymentMessage));
      content.appendChild(notice);
    }

    const benefits = el('div', { class: 'card' });
    benefits.appendChild(el('h2', {}, 'ZoomDrive Plus'));
    benefits.appendChild(el('p', {}, 'Priority matching: your request reaches ' + current.extraOffers + ' more providers'));
    benefits.appendChild(el('p', { class: 'mu' }, 'More benefits: Coming soon.'));
    benefits.appendChild(el('p', {}, 'Free for ' + current.trialDays + ' days, then ' + formatZAR(current.priceCents) + ' per 30 days. No auto-renew.'));
    content.appendChild(benefits);

    const membership = el('div', { class: 'card' });
    if (current.member && current.active && current.onTrial) {
      membership.appendChild(el('h2', {}, 'Trial ends ' + formatDate(current.trialEndsAt, 'date')));
    } else if (current.member && current.active) {
      membership.appendChild(el('h2', {}, 'Active until ' + formatDate(current.paidUntil, 'date')));
    } else if (current.member) {
      membership.appendChild(el('h2', {}, 'Plus has ended'));
      const payButton = el('button', { class: 'btn', type: 'button' }, 'Get 30 days');
      payButton.addEventListener('click', startPayment);
      membership.appendChild(payButton);
    } else {
      const joinButton = el('button', { class: 'btn', type: 'button' }, current.trialDays > 0 ? 'Start free trial' : 'Get Plus');
      joinButton.addEventListener('click', current.trialDays > 0 ? joinTrial : startPayment);
      membership.appendChild(joinButton);
    }
    content.appendChild(membership);
  }

  async function loadState() {
    let current = await apiFetch('/drivers/me/plus', { signal: ctx.signal });
    if (isPaymentReturn && !current.active) {
      await waitForRetry(ctx.signal);
      if (!ctx.signal.aborted) {
        current = await apiFetch('/drivers/me/plus', { signal: ctx.signal });
      }
    }
    if (ctx.signal.aborted) return;
    const paymentMessage = isPaymentReturn && !current.active
      ? 'Payment not confirmed yet. Pull to refresh in a minute.'
      : '';
    renderState(current, paymentMessage);
  }

  async function joinTrial() {
    if (busy) return;
    busy = true;
    try {
      const result = await withSpinner(apiFetch('/drivers/me/plus/join', {
        method: 'POST',
        signal: ctx.signal,
      }));
      if (!ctx.signal.aborted) renderState(result);
    } catch (err) {
      if (!ctx.signal.aborted) showError(err);
    } finally {
      busy = false;
    }
  }

  async function startPayment() {
    if (busy) return;
    busy = true;
    try {
      const result = await withSpinner(apiFetch('/drivers/me/plus/pay', {
        method: 'POST',
        signal: ctx.signal,
      }));
      if (!ctx.signal.aborted) window.location.assign(result.authorizationUrl);
    } catch (err) {
      if (err.code === 'ZD-PAY-003') {
        renderState(state, 'Online payments are not switched on yet.');
      } else if (!ctx.signal.aborted) {
        showError(err);
      }
    } finally {
      busy = false;
    }
  }

  await loadState();
  return screen;
}