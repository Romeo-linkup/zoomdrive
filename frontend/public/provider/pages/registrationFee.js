import { apiFetch } from '../../shared/api.js';
import { showError } from '../../shared/errors.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, clear, formatZAR, withSpinner } from '../../shared/ui.js';
import { consumePaymentReference } from '../paymentReturn.js';
import { createPageError } from './pageError.js';

export default async function render(ctx) {
  try {
    return await renderRegistrationFee(ctx);
  } catch (err) {
    return createPageError(err, () => ctx.navigate(ctx.path));
  }
}

async function renderRegistrationFee(ctx) {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Registration fee', onBack: () => ctx.navigate('/home') }));
  const content = el('div');
  screen.appendChild(content);
  let state = null;
  const reference = ctx.query.reference || ctx.query.trxref || consumePaymentReference();

  function showState(current) {
    state = current;
    clear(content);
    if (current.paid) {
      const card = el('div', { class: 'card' });
      card.appendChild(el('h2', {}, 'Registration fee received. You can go online.'));
      const home = el('button', { class: 'btn', type: 'button' }, 'Go to Home');
      home.addEventListener('click', () => ctx.navigate('/home'));
      card.appendChild(home);
      content.appendChild(card);
      return;
    }
    if (current.waived || !current.required) {
      const card = el('div', { class: 'card' });
      card.appendChild(el('h2', {}, 'Nothing to pay'));
      card.appendChild(el('p', {}, current.waived ? 'Your registration fee was waived.' : 'A registration fee is not required.'));
      const home = el('button', { class: 'btn', type: 'button' }, 'Go to Home');
      home.addEventListener('click', () => ctx.navigate('/home'));
      card.appendChild(home);
      content.appendChild(card);
      return;
    }
    const card = el('div', { class: 'card' });
    card.appendChild(el('h2', {}, formatZAR(current.amountCents)));
    card.appendChild(el('p', {}, 'One-time fee. No monthly subscription.'));
    card.appendChild(el('p', {}, 'What it covers: checking your documents and keeping the platform safe for drivers.'));
    const pay = el('button', { class: 'btn', type: 'button' }, 'Pay registration fee');
    pay.addEventListener('click', startPayment);
    card.appendChild(pay);
    content.appendChild(card);
  }

  function showPaymentResult(result, message = '') {
    clear(content);
    const card = el('div', { class: 'card' });
    if (result && result.paid) {
      card.appendChild(el('h2', {}, 'Registration fee received. You can go online.'));
      const home = el('button', { class: 'btn', type: 'button' }, 'Go to Home');
      home.addEventListener('click', () => ctx.navigate('/home'));
      card.appendChild(home);
    } else {
      card.appendChild(el('h2', {}, message || 'Payment not confirmed yet'));
      const checkAgain = el('button', { class: 'btn', type: 'button' }, 'Check again');
      checkAgain.addEventListener('click', verifyPayment);
      card.appendChild(checkAgain);
      const tryAgain = el('button', { class: 'btn soft', type: 'button' }, 'Try again');
      tryAgain.addEventListener('click', startPayment);
      card.appendChild(tryAgain);
    }
    content.appendChild(card);
  }

  async function verifyPayment() {
    if (!reference) {
      showPaymentResult(null);
      return;
    }
    try {
      const result = await withSpinner(apiFetch('/providers/me/registration-fee/verify', {
        method: 'POST',
        body: { reference },
        signal: ctx.signal,
      }));
      showPaymentResult(result);
    } catch (err) {
      if (err.code === 'ZD-PAY-001' || err.code === 'ZD-PAY-004') {
        showPaymentResult(null, 'Payment could not be confirmed. Please try again.');
      } else {
        showError(err);
        showPaymentResult(null);
      }
    }
  }

  async function startPayment() {
    try {
      const result = await withSpinner(apiFetch('/providers/me/registration-fee/pay', {
        method: 'POST',
        signal: ctx.signal,
      }));
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      if (err.code === 'ZD-PAY-003') {
        clear(content);
        const card = el('div', { class: 'card' });
        card.appendChild(el('h2', {}, 'Online payments are not switched on yet. Please contact support.'));
        content.appendChild(card);
      } else {
        showError(err);
      }
    }
  }

  if (reference) {
    showPaymentResult(null);
    await verifyPayment();
  } else {
    try {
      state = await apiFetch('/providers/me/registration-fee', { signal: ctx.signal });
      showState(state);
    } catch (err) {
      if (!ctx.signal.aborted) showError(err);
    }
  }
  return screen;
}