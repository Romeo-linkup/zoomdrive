// shared/authFlow.js
import { APP_ID, CONFIG } from './config.js';
import { apiFetch } from './api.js';
import { setSession } from './auth.js';
import { showError, clearFieldErrors } from './errors.js';
import { el, clear, toast, withSpinner, formatPhone } from './ui.js';
import { createTopbar, createBrandBar } from './components/topbar.js';
import { createField } from './components/field.js';

export function validateLocalPhone(input) {
  if (!input || typeof input !== 'string') return 'Enter a valid South African mobile number';
  const cleaned = input.replace(/[\s\-\(\)]/g, '');
  let digits = cleaned;
  if (digits.startsWith('+27')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('27')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length !== 9) return 'Enter a valid South African mobile number';
  const first = digits.charAt(0);
  if (first !== '6' && first !== '7' && first !== '8') return 'Enter a valid South African mobile number';
  return null;
}

export function toE164(input) {
  const cleaned = input.replace(/[\s\-\(\)]/g, '');
  let digits = cleaned;
  if (digits.startsWith('+27')) {
    digits = digits.slice(3);
  } else if (digits.startsWith('27')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return '+27' + digits;
}

export function savePending({ phone, devCode }) {
  try {
    const key = 'zd_pending_' + APP_ID;
    const data = JSON.stringify({ phone, devCode, time: Date.now() });
    sessionStorage.setItem(key, data);
  } catch (e) {
    try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ }
  }
}

export function getPending() {
  try {
    const key = 'zd_pending_' + APP_ID;
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.phone) return data;
    return null;
  } catch (e) {
    try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ }
    return null;
  }
}

export function clearPending() {
  try {
    const key = 'zd_pending_' + APP_ID;
    sessionStorage.removeItem(key);
  } catch (e) {
    try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ }
  }
}

export async function requestCode(phone) {
  return await apiFetch('/auth/otp/request', {
    method: 'POST',
    auth: false,
    body: { phone, app: APP_ID },
  });
}

export async function verifyCode(phone, code) {
  const data = await apiFetch('/auth/otp/verify', {
    method: 'POST',
    auth: false,
    body: { phone, code, app: APP_ID },
  });
  setSession(data);
  return data;
}

export function renderPhonePage(ctx) {
  const screen = el('div', { class: 'screen' });
  const title = ctx.query.mode === 'login' ? 'Welcome back' : 'Enter your phone number';
  screen.appendChild(createTopbar({
    onBack: () => ctx.navigate('/welcome'),
    title,
  }));

  if (ctx.query.next) {
    const banner = el('div', { class: 'banner' });
    banner.appendChild(el('b', {}, 'Create a profile to request help'));
    banner.appendChild(el('span', {}, 'It only takes a minute.'));
    screen.appendChild(banner);
  }

  const field = createField({
    name: 'phone',
    label: 'Mobile number',
    type: 'tel',
    inputmode: 'numeric',
    prefix: '+27',
    placeholder: '82 123 4567',
    autocomplete: 'tel-national',
  });
  screen.appendChild(field.el);

  const btn = el('button', { class: 'btn', type: 'button' }, 'Continue');
  screen.appendChild(btn);

  const terms = el('p', { class: 'mu' }, 'By continuing you agree to the Terms and Privacy Policy.');
  screen.appendChild(terms);

  async function handleSubmit() {
    clearFieldErrors();
    const input = field.getValue();
    const error = validateLocalPhone(input);
    if (error) {
      field.setError(error);
      return;
    }
    const e164 = toE164(input);
    try {
      const result = await withSpinner(requestCode(e164));
      savePending({ phone: e164, devCode: result.devCode || null });
      let target = '/otp';
      if (ctx.query.next) {
        target += '?next=' + encodeURIComponent(ctx.query.next);
      }
      ctx.navigate(target);
    } catch (err) {
      if (err.code === 'ZD-AUTH-004') {
        renderRoleMismatch(screen, err, () => field.input.focus());
      } else {
        showError(err);
      }
    }
  }

  btn.addEventListener('click', handleSubmit);
  field.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  });

  return screen;
}

export function renderOtpPage(ctx, { afterLogin }) {
  const pending = getPending();
  if (!pending) {
    ctx.navigate('/phone', { replace: true });
    return el('div', {});
  }

  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({
    onBack: () => ctx.navigate('/phone'),
    title: 'Enter the code',
  }));

  screen.appendChild(el('h1', {}, 'Enter the code'));
  screen.appendChild(el('p', { class: 'mu' }, 'We sent a 4-digit code to ' + formatPhone(pending.phone)));

  const otpWrapper = el('div', { class: 'otp', dataset: { field: 'code' } });
  const inputs = [];
  for (let i = 0; i < 4; i++) {
    const input = el('input', {
      type: 'text',
      inputmode: 'numeric',
      maxlength: 1,
      autocomplete: i === 0 ? 'one-time-code' : 'off',
      attrs: { 'aria-label': 'Digit ' + (i + 1) },
    });
    inputs.push(input);
    otpWrapper.appendChild(input);
  }
  screen.appendChild(otpWrapper);

  if (CONFIG.ZD_DEBUG && pending.devCode) {
    const banner = el('div', { class: 'banner warn' });
    banner.appendChild(el('b', {}, 'Dev code'));
    banner.appendChild(el('span', {}, pending.devCode));
    screen.appendChild(banner);
  }

  const resendLabel = el('button', { class: 'link-btn', type: 'button' }, 'Resend code');
  screen.appendChild(resendLabel);

  const changeBtn = el('button', { class: 'link-btn', type: 'button' }, 'Change number');
  screen.appendChild(changeBtn);

  let countdown = 30;
  let intervalId = null;

  function startCountdown() {
    resendLabel.disabled = true;
    resendLabel.textContent = 'Resend code in ' + countdown + 's';
    intervalId = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(intervalId);
        resendLabel.disabled = false;
        resendLabel.textContent = 'Resend code';
      } else {
        resendLabel.textContent = 'Resend code in ' + countdown + 's';
      }
    }, 1000);
    ctx.onLeave(() => {
      if (intervalId) clearInterval(intervalId);
    });
  }

  startCountdown();

  resendLabel.addEventListener('click', async () => {
    try {
      const result = await withSpinner(requestCode(pending.phone));
      savePending({ phone: pending.phone, devCode: result.devCode || null });
      toast('Code sent', 'ok');
      countdown = 30;
      startCountdown();
    } catch (err) {
      showError(err);
    }
  });

  changeBtn.addEventListener('click', () => {
    ctx.navigate('/phone');
  });

  function moveToNext(currentIndex) {
    if (currentIndex < 3) {
      inputs[currentIndex + 1].focus();
    }
  }

  function moveToPrev(currentIndex) {
    if (currentIndex > 0) {
      inputs[currentIndex - 1].focus();
    }
  }

  inputs.forEach((input, i) => {
    input.addEventListener('input', (e) => {
      const val = e.target.value;
      if (!/^\d$/.test(val)) {
        e.target.value = '';
        return;
      }
      if (val) {
        moveToNext(i);
      }
      checkAll();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !e.target.value) {
        moveToPrev(i);
      }
    });

    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const paste = (e.clipboardData || window.clipboardData).getData('text');
      const digits = paste.replace(/\D/g, '').slice(0, 4);
      digits.split('').forEach((d, idx) => {
        if (inputs[idx]) {
          inputs[idx].value = d;
        }
      });
      if (digits.length === 4) {
        inputs[3].focus();
        checkAll();
      }
    });
  });

  function checkAll() {
    const code = inputs.map(inp => inp.value).join('');
    if (code.length === 4) {
      verify(code);
    }
  }

  async function verify(code) {
    inputs.forEach(inp => inp.disabled = true);
    try {
      const data = await withSpinner(verifyCode(pending.phone, code));
      clearPending();
      const target = afterLogin(data, ctx);
      ctx.navigate(target, { replace: true });
    } catch (err) {
      inputs.forEach(inp => {
        inp.disabled = false;
        inp.value = '';
      });
      inputs[0].focus();
      if (err.code === 'ZD-AUTH-002') {
        otpWrapper.classList.add('has-error');
        let errDiv = otpWrapper.querySelector('.field-error');
        if (!errDiv) {
          errDiv = el('div', { class: 'field-error' });
          otpWrapper.appendChild(errDiv);
        }
        errDiv.textContent = 'That code is wrong or expired. Try again.';
      } else if (err.code === 'ZD-AUTH-004') {
        renderRoleMismatch(screen, err, () => inputs[0].focus());
      } else {
        showError(err);
      }
    }
  }

  setTimeout(() => inputs[0].focus(), 0);

  return screen;
}

export function renderRoleMismatch(container, err, onBack) {
  clear(container);
  const screen = el('div', { class: 'screen' });
  const card = el('div', { class: 'card' });
  card.appendChild(el('div', {}, '🚫'));
  card.appendChild(el('h2', {}, 'This number belongs to the other app'));
  card.appendChild(el('p', {}, err.message || 'This phone number is registered with the other app.'));
  
  const otherAppId = APP_ID === 'driver' ? 'provider' : 'driver';
  const otherApp = CONFIG.APPS[otherAppId];
  const otherBtn = el('a', { class: 'btn', attrs: { href: otherApp.path } }, 'Open ' + otherApp.name);
  card.appendChild(otherBtn);
  
  const backBtn = el('button', { class: 'btn soft', type: 'button' }, 'Use a different number');
  backBtn.addEventListener('click', onBack);
  card.appendChild(backBtn);
  
  screen.appendChild(card);
  container.appendChild(screen);
}
