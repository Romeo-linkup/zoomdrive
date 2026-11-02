import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError } from '../../shared/errors.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, clear, formatZAR, withSpinner } from '../../shared/ui.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    await renderPayment(ctx, screen);
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderPayment(ctx, screen) {
  const requestId = ctx.params.id;
  screen.appendChild(createTopbar({ title: 'Payment' }));
  const content = el('div');
  screen.appendChild(content);
  let busy = false;
  let request = null;

  function continueToRate() {
    ctx.navigate('/rate/' + encodeURIComponent(requestId));
  }

  function showPaymentUnavailable() {
    clear(content);
    const card = el('div', { class: 'card' });
    card.appendChild(el('h2', {}, 'Card payments are not switched on yet.'));
    card.appendChild(el('p', {}, 'Please pay your provider directly (cash or EFT); they will confirm it in the app.'));
    const button = el('button', { class: 'btn', type: 'button' }, 'Continue');
    button.addEventListener('click', continueToRate);
    card.appendChild(button);
    content.appendChild(card);
  }

  function showPending() {
    clear(content);
    const card = el('div', { class: 'card' });
    card.appendChild(el('h2', {}, 'Payment not confirmed yet'));
    card.appendChild(el('p', {}, 'Check again, or try starting the card payment again.'));
    const check = el('button', { class: 'btn', type: 'button' }, 'Check again');
    check.addEventListener('click', verifyPayment);
    const retry = el('button', { class: 'btn soft', type: 'button' }, 'Try card again');
    retry.addEventListener('click', startCardPayment);
    card.appendChild(check);
    card.appendChild(retry);
    content.appendChild(card);
  }

  function showPaidReturn() {
    clear(content);
    const card = el('div', { class: 'card' });
    card.appendChild(el('h2', {}, 'Payment received. Thank you.'));
    const button = el('button', { class: 'btn', type: 'button' }, 'Continue');
    button.addEventListener('click', continueToRate);
    card.appendChild(button);
    content.appendChild(card);
  }

  function showPaymentDetails() {
    clear(content);
    const card = el('div', { class: 'card' });
    card.appendChild(el('h2', {}, request.service && request.service.name ? request.service.name : 'Roadside assistance'));
    if (request.provider && request.provider.firstName) {
      card.appendChild(el('p', {}, 'Your provider: ' + request.provider.firstName));
    }
    card.appendChild(el('div', { class: 'line tot' },
      el('span', {}, 'Fixed total'),
      el('b', {}, formatZAR(request.price && request.price.totalCents))
    ));
    const pay = el('button', { class: 'btn', type: 'button' }, 'Pay with card');
    pay.addEventListener('click', startCardPayment);
    const later = el('button', { class: 'link-btn', type: 'button' }, 'Pay later');
    later.addEventListener('click', continueToRate);
    card.appendChild(pay);
    card.appendChild(later);
    content.appendChild(card);
  }

  async function loadRequest() {
    const data = await apiFetch('/requests/' + encodeURIComponent(requestId), { signal: ctx.signal });
    if (ctx.signal.aborted) return;
    request = data.request;
    if (!request) throw new Error('Request details are unavailable.');
    if (request.payment && request.payment.status === 'paid') {
      ctx.navigate('/rate/' + encodeURIComponent(requestId), { replace: true });
      return;
    }
    showPaymentDetails();
  }

  async function verifyPayment() {
    if (busy) return;
    busy = true;
    try {
      const result = await withSpinner(apiFetch('/payments/' + encodeURIComponent(requestId) + '/verify', {
        method: 'POST',
        signal: ctx.signal,
      }));
      if (ctx.signal.aborted) return;
      if (result.payment && result.payment.status === 'paid') showPaidReturn();
      else showPending();
    } catch (err) {
      if (ctx.signal.aborted) return;
      if (err.code === 'ZD-PAY-008') {
        await loadRequest();
      } else {
        showError(err);
      }
    } finally {
      busy = false;
    }
  }

  async function startCardPayment() {
    if (busy) return;
    busy = true;
    try {
      const result = await withSpinner(apiFetch('/payments/' + encodeURIComponent(requestId) + '/pay', {
        method: 'POST',
        signal: ctx.signal,
      }));
      if (!ctx.signal.aborted) window.location.assign(result.authorizationUrl);
    } catch (err) {
      if (ctx.signal.aborted) return;
      if (err.code === 'ZD-PAY-003') {
        showPaymentUnavailable();
      } else if (err.code === 'ZD-PAY-008') {
        await loadRequest();
      } else {
        showError(err);
      }
    } finally {
      busy = false;
    }
  }

  if (ctx.query.check === '1') {
    await verifyPayment();
  } else {
    await loadRequest();
  }
}