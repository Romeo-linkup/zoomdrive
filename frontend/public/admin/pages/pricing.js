import { el, clear, formatDate, formatZAR, toast } from '../../shared/ui.js';
import { apiFetch } from '../../shared/api.js';
import { showError, clearError, clearFieldErrors } from '../../shared/errors.js';
import { createField } from '../../shared/components/field.js';
import { getAdmin } from '../app.js';

const FIELD_CONFIG = [
  { key: 'commissionPct', apiKey: 'commissionPct', label: 'Commission (%)', type: 'number', min: 0, max: 50, step: 0.5 },
  { key: 'registrationFeeEnabled', apiKey: 'providerRegistrationFeeEnabled', label: 'Charge providers a one-time registration fee', type: 'boolean' },
  { key: 'providerRegistrationFeeCents', apiKey: 'providerRegistrationFeeCents', label: 'Registration fee (R)', type: 'money', min: 0, max: 1000000 },
  { key: 'plusEnabled', apiKey: 'driverPlusEnabled', label: 'Enable ZoomDrive Plus', type: 'boolean' },
  { key: 'plusPriceCents', apiKey: 'driverPlusMonthlyCents', label: 'Monthly price (R)', type: 'money', min: 0, max: 1000000 },
  { key: 'plusTrialDays', apiKey: 'driverPlusTrialDays', label: 'Free-trial days', type: 'number', min: 0, max: 365, step: 1 },
  { key: 'plusExtraOffers', apiKey: 'driverPlusExtraOffers', label: 'Extra offers', type: 'number', min: 0, max: 20, step: 1 },
];

const LABELS = {
  commissionPct: 'Commission',
  registrationFeeEnabled: 'Registration fee',
  providerRegistrationFeeCents: 'Registration fee amount',
  plusEnabled: 'ZoomDrive Plus',
  plusPriceCents: 'Monthly price',
  plusTrialDays: 'Free-trial days',
  plusExtraOffers: 'Extra offers',
};

function readFormValues(fields) {
  const values = {};
  for (const def of FIELD_CONFIG) {
    const control = fields.get(def.key);
    if (def.type === 'boolean') {
      values[def.key] = control.checked;
    } else {
      const number = Number(control.value);
      if (!Number.isFinite(number) || control.value.trim() === '') {
        return { error: { field: def.key, message: 'Enter a valid number' } };
      }
      values[def.key] = def.type === 'money' ? Math.round(number * 100) : number;
      if (values[def.key] < def.min || values[def.key] > def.max) {
        return { error: { field: def.key, message: 'Value is outside the allowed range' } };
      }
      if (def.step === 1 && !Number.isInteger(values[def.key])) {
        return { error: { field: def.key, message: 'Enter a whole number' } };
      }
      if (def.key === 'commissionPct' && values[def.key] * 2 % 1 !== 0) {
        return { error: { field: def.key, message: 'Use increments of 0.5%' } };
      }
    }
  }
  return { values };
}

function displayValue(key, value) {
  if (key === 'commissionPct') return value + '%';
  if (key === 'providerRegistrationFeeCents' || key === 'plusPriceCents') return formatZAR(value);
  if (key === 'registrationFeeEnabled' || key === 'plusEnabled') return value ? 'On' : 'Off';
  if (key === 'plusTrialDays') return value + ' days';
  if (key === 'plusExtraOffers') return String(value);
  return String(value);
}

function readApiValues(values = {}) {
  const result = {};
  for (const def of FIELD_CONFIG) {
    result[def.key] = values[def.apiKey];
  }
  return result;
}

function getCooldownDays(pricing) {
  if (pricing.intervalDays > 0) return pricing.intervalDays;
  const changedAt = pricing.lastChange && pricing.lastChange.changedAt;
  const nextAt = pricing.nextChangeAllowedAt || pricing.nextAllowedAt;
  if (changedAt && nextAt) {
    return Math.max(1, Math.ceil((new Date(nextAt) - new Date(changedAt)) / 86400000));
  }
  return 1;
}

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  const head = el('div', { class: 'page-head' });
  head.appendChild(el('h1', {}, 'Pricing'));
  screen.appendChild(head);

  const summary = el('div', { class: 'stats' });
  screen.appendChild(summary);
  const statusArea = el('div');
  screen.appendChild(statusArea);
  const actions = el('div', { class: 'action-bar' });
  screen.appendChild(actions);
  const panel = el('div');
  screen.appendChild(panel);

  let pricing = null;
  let timerId = null;
  let challengeId = null;
  let challengeExpiresAt = null;
  let challengeEmailHint = null;
  let challengeDevCode = null;
  let verifiedUntil = null;
  let step = 0;
  let stepMessage = '';
  let currentValues = {};

  function stopTimer() {
    if (timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function showLockedBanner() {
    const nextAllowedAt = pricing && (pricing.nextChangeAllowedAt || pricing.nextAllowedAt);
    clear(statusArea);
    if (pricing && (pricing.canChangeNow === true || pricing.changeAllowed === true)) {
      statusArea.appendChild(el('div', { class: 'banner' }, 'You can change pricing now'));
      return;
    }
    const banner = el('div', { class: 'banner warn' });
    const content = el('div');
    content.appendChild(el('b', {}, 'Pricing is locked until ' + formatDate(nextAllowedAt, 'datetime')));
    const lastChange = pricing && pricing.lastChange;
    if (lastChange) {
      content.appendChild(el('span', {}, 'Last changed ' + formatDate(lastChange.changedAt, 'datetime') + ' by ' + (lastChange.adminName || 'an admin')));
    }
    banner.appendChild(content);
    statusArea.appendChild(banner);
  }

  function renderSummary() {
    clear(summary);
    const commission = el('div', { class: 'stat' });
    commission.appendChild(el('b', {}, currentValues.commissionPct + '%'));
    commission.appendChild(el('span', {}, 'Commission'));
    summary.appendChild(commission);

    const fee = el('div', { class: 'stat' });
    fee.appendChild(el('b', {}, formatZAR(currentValues.providerRegistrationFeeCents || 0)));
    fee.appendChild(el('span', {}, currentValues.registrationFeeEnabled ? 'Registration fee · Charged' : 'Registration fee · Not charged (pilot)'));
    summary.appendChild(fee);

    const plus = el('div', { class: 'stat' });
    plus.appendChild(el('b', {}, currentValues.plusEnabled ? 'On' : 'Off'));
    plus.appendChild(el('span', {}, 'ZoomDrive Plus · ' + formatZAR(currentValues.plusPriceCents || 0) + ' after ' + (currentValues.plusTrialDays || 0) + '-day trial · ' + (currentValues.plusExtraOffers || 0) + ' extra offers'));
    summary.appendChild(plus);
  }

  function renderPricing() {
    currentValues = readApiValues(pricing && pricing.values);
    renderSummary();
    showLockedBanner();
    clear(actions);
    clear(panel);
    const changeButton = el('button', { class: 'btn', type: 'button' }, 'Change pricing');
    changeButton.disabled = !(pricing && (pricing.canChangeNow === true || pricing.changeAllowed === true));
    changeButton.addEventListener('click', () => {
      if (changeButton.disabled) return;
      step = 1;
      renderStep();
    });
    actions.appendChild(changeButton);
  }

  function returnToStepOne(message) {
    stopTimer();
    step = 1;
    challengeId = null;
    verifiedUntil = null;
    stepMessage = message || '';
    renderStep();
  }

  function renderStep() {
    stopTimer();
    clear(panel);
    if (step === 1) renderPasswordStep();
    else if (step === 2) renderCodeStep();
    else if (step === 3) renderValuesStep();
  }

  function renderPasswordStep() {
    const card = el('div', { class: 'card settings-form' });
    card.appendChild(el('h2', {}, 'Confirm it is you'));
    if (stepMessage) {
      card.appendChild(el('div', { class: 'banner warn' }, stepMessage));
      stepMessage = '';
    }
    const password = createField({
      name: 'password',
      label: 'Admin password',
      type: 'password',
      autocomplete: 'current-password',
      required: true,
    });
    card.appendChild(password.el);
    const continueButton = el('button', { class: 'btn', type: 'button' }, 'Continue');
    continueButton.addEventListener('click', async () => {
      clearError();
      clearFieldErrors(card);
      const passwordValue = password.getValue();
      if (!passwordValue) {
        password.setError('Enter your password');
        return;
      }
      let data;
      try {
        data = await apiFetch('/admin/pricing/challenge', {
          method: 'POST',
          body: { password: passwordValue },
        });
      } catch (err) {
        password.setValue('');
        if (err.code === 'ZD-ADM-006') password.setError(err.message);
        else if (err.code === 'ZD-ADM-007') {
          showError(err);
          await load();
        } else {
          showError(err);
        }
        return;
      } finally {
        password.setValue('');
      }
      challengeId = data.challengeId;
      challengeExpiresAt = data.expiresAt || null;
      challengeEmailHint = data.emailHint || null;
      challengeDevCode = data.devCode || null;
      step = 2;
      renderStep();
    });
    card.appendChild(continueButton);
    panel.appendChild(card);
  }

  function renderCodeStep() {
    const card = el('div', { class: 'card settings-form' });
    card.appendChild(el('h2', {}, 'Enter the emailed code'));
    const admin = getAdmin();
    const hint = challengeEmailHint || (admin && admin.email) || 'your admin email';
    card.appendChild(el('p', {}, 'We sent a 6-digit code to ' + hint + '. It expires in 10 minutes.'));
    if (challengeDevCode) {
      const devBox = el('div', { class: 'banner warn' });
      devBox.style.borderStyle = 'dashed';
      devBox.appendChild(el('b', {}, 'Dev only'));
      devBox.appendChild(el('span', {}, String(challengeDevCode)));
      card.appendChild(devBox);
    }
    const code = createField({
      name: 'code',
      label: '6-digit code',
      inputmode: 'numeric',
      maxlength: 6,
      autocomplete: 'one-time-code',
      required: true,
    });
    card.appendChild(code.el);
    const verifyButton = el('button', { class: 'btn', type: 'button' }, 'Verify');
    verifyButton.addEventListener('click', async () => {
      clearError();
      clearFieldErrors(card);
      const codeValue = code.getValue();
      if (!/^\d{6}$/.test(codeValue)) {
        code.setError('Enter the 6-digit code');
        return;
      }
      try {
        await apiFetch('/admin/pricing/verify', {
          method: 'POST',
          body: { challengeId, code: codeValue },
        });
      } catch (err) {
        if (err.code === 'ZD-ADM-008' || err.code === 'ZD-ADM-006') {
          showError(err);
        } else if (err.code === 'ZD-ADM-009') {
          returnToStepOne(err.message);
        } else if (err.code === 'ZD-ADM-007') {
          showError(err);
          await load();
        } else {
          showError(err);
        }
        return;
      }
      verifiedUntil = challengeExpiresAt;
      step = 3;
      renderStep();
    });
    card.appendChild(verifyButton);
    const restartButton = el('button', { class: 'btn soft', type: 'button' }, 'Start over');
    restartButton.addEventListener('click', () => returnToStepOne(''));
    card.appendChild(restartButton);
    panel.appendChild(card);
  }

  function renderValuesStep() {
    const card = el('div', { class: 'card settings-form' });
    card.appendChild(el('h2', {}, 'New values'));
    const countdown = el('div', { class: 'mu' });
    card.appendChild(countdown);
    const registrationHint = el('div', { class: 'mu' }, 'Providers already approved when you switch this on become founding providers and never pay.');
    const controls = new Map();
    const original = { ...currentValues };
    const review = el('div');
    card.appendChild(review);

    function renderCountdown() {
      const remaining = Math.max(0, new Date(verifiedUntil).getTime() - Date.now());
      if (!Number.isFinite(remaining) || remaining <= 0) {
        returnToStepOne('Your verification expired. Confirm your password again.');
        return false;
      }
      const totalSeconds = Math.floor(remaining / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = String(totalSeconds % 60).padStart(2, '0');
      countdown.textContent = 'Verified for ' + minutes + ':' + seconds;
      return true;
    }

    if (!verifiedUntil) {
      returnToStepOne('Verification expiry was not returned. Confirm your password again.');
      return;
    }
    if (!renderCountdown()) return;
    timerId = setInterval(renderCountdown, 1000);

    for (const def of FIELD_CONFIG) {
      if (def.type === 'boolean') {
        const row = el('div', { class: 'field', dataset: { field: def.key } });
        const label = el('label');
        const input = el('input', { type: 'checkbox' });
        input.checked = original[def.key] === true;
        input.addEventListener('change', clearReview);
        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + def.label));
        row.appendChild(label);
        controls.set(def.key, input);
        card.insertBefore(row, review);
        if (def.key === 'registrationFeeEnabled') card.insertBefore(registrationHint, review);
      } else {
        const value = def.type === 'money' ? (original[def.key] || 0) / 100 : original[def.key];
        const field = createField({
          name: def.key,
          label: def.label,
          type: 'number',
          value: String(value === undefined || value === null ? 0 : value),
          inputmode: 'decimal',
        });
        field.input.setAttribute('min', String(def.type === 'money' ? def.min / 100 : def.min));
        field.input.setAttribute('max', String(def.type === 'money' ? def.max / 100 : def.max));
        field.input.setAttribute('step', String(def.step || 0.01));
        field.input.addEventListener('input', clearReview);
        controls.set(def.key, field.input);
        card.insertBefore(field.el, review);
      }
    }

    function clearReview() {
      clear(review);
      confirmation.style.display = 'none';
      confirmInput.checked = false;
      confirmInput.disabled = true;
      applyButton.style.display = 'none';
      applyButton.disabled = true;
    }

    const reviewButton = el('button', { class: 'btn soft', type: 'button' }, 'Review changes');
    const confirmation = el('label', { class: 'field' });
    const confirmInput = el('input', { type: 'checkbox' });
    confirmInput.disabled = true;
    const intervalDays = getCooldownDays(pricing);
    confirmation.appendChild(confirmInput);
    confirmation.appendChild(document.createTextNode(' I understand pricing cannot be changed again for ' + intervalDays + ' days'));
    confirmation.style.display = 'none';
    const applyButton = el('button', { class: 'btn', type: 'button' }, 'Apply changes');
    applyButton.disabled = true;
    applyButton.style.display = 'none';
    confirmInput.addEventListener('change', () => {
      applyButton.disabled = !confirmInput.checked;
    });

    reviewButton.addEventListener('click', () => {
      clearError();
      clearFieldErrors(card);
      const parsed = readFormValues(controls);
      if (parsed.error) {
        showError(parsed.error);
        return;
      }
      const changes = {};
      for (const def of FIELD_CONFIG) {
        if (parsed.values[def.key] !== original[def.key]) {
          changes[def.key] = parsed.values[def.key];
        }
      }
      clear(review);
      if (!Object.keys(changes).length) {
        review.appendChild(el('div', { class: 'mu' }, 'No pricing changes to review.'));
        clearReview();
        return;
      }
      const list = el('ul');
      for (const [key, value] of Object.entries(changes)) {
        list.appendChild(el('li', {}, LABELS[key] + ': ' + displayValue(key, original[key]) + ' -> ' + displayValue(key, value)));
      }
      review.appendChild(list);
      confirmation.style.display = '';
      confirmInput.disabled = false;
      applyButton.style.display = '';
    });

    applyButton.addEventListener('click', async () => {
      if (applyButton.disabled) return;
      clearError();
      clearFieldErrors(card);
      const parsed = readFormValues(controls);
      if (parsed.error) {
        showError(parsed.error);
        return;
      }
      const changes = {};
      for (const def of FIELD_CONFIG) {
        if (parsed.values[def.key] !== original[def.key]) {
          changes[def.apiKey] = parsed.values[def.key];
        }
      }
      if (!Object.keys(changes).length) {
        toast('No changes to save', 'info');
        return;
      }
      try {
        await apiFetch('/admin/pricing/apply', {
          method: 'POST',
          body: { challengeId, changes },
        });
        stopTimer();
        step = 0;
        toast('Pricing updated', 'ok');
        await load();
      } catch (err) {
        if (err.code === 'ZD-ADM-010' || err.code === 'ZD-ADM-006') {
          returnToStepOne(err.message);
        } else if (err.code === 'ZD-ADM-007') {
          showError(err);
          await load();
        } else {
          showError(err);
          if (err.field) {
            const def = FIELD_CONFIG.find(item => item.apiKey === err.field || item.key === err.field || ('changes.' + item.apiKey) === err.field);
            if (def) {
              const control = controls.get(def.key);
              const field = control && control.closest('[data-field]');
              if (field) {
                field.classList.add('has-error');
                field.appendChild(el('div', { class: 'field-error' }, err.message));
              }
            }
          }
        }
      }
    });

    card.appendChild(reviewButton);
    card.appendChild(confirmation);
    card.appendChild(applyButton);
    panel.appendChild(card);
  }

  async function load() {
    clearError();
    try {
      const data = await apiFetch('/admin/pricing');
      pricing = data.pricing || data;
      renderPricing();
    } catch (err) {
      showError(err);
    }
  }

  ctx.onLeave(() => {
    stopTimer();
  });

  await load();
  return screen;
}