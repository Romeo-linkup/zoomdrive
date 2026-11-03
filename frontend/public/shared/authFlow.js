// shared/authFlow.js
import { APP_ID, CONFIG } from './config.js';
import { apiFetch } from './api.js';
import { setSession } from './auth.js';
import { showError, clearFieldErrors, renderPageError } from './errors.js';
import { el, clear, toast, withSpinner } from './ui.js';
import { createTopbar } from './components/topbar.js';
import { createField } from './components/field.js';

const PHONE_ERROR = 'Enter a valid South African mobile number';

export function validatePhone(value) {
  if (typeof value !== 'string') return PHONE_ERROR;
  const cleaned = value.trim().replace(/[\s\-().]/g, '');
  let national;
  if (/^\+27[6-8]\d{8}$/.test(cleaned)) {
    national = cleaned.slice(3);
  } else if (/^27[6-8]\d{8}$/.test(cleaned)) {
    national = cleaned.slice(2);
  } else if (/^0[6-8]\d{8}$/.test(cleaned)) {
    national = cleaned.slice(1);
  } else {
    return PHONE_ERROR;
  }
  return '+27' + national;
}

export function savePending({ email, otpLength, maskedEmail, devCode }) {
  try {
    const key = 'zd_pending_' + APP_ID;
    sessionStorage.setItem(key, JSON.stringify({
      email,
      otpLength,
      maskedEmail,
      devCode: devCode || null,
      time: Date.now(),
    }));
  } catch (e) {
    try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ }
  }
}

export function getPending() {
  try {
    const raw = sessionStorage.getItem('zd_pending_' + APP_ID);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && typeof data.email === 'string' && data.email) return data;
    return null;
  } catch (e) {
    try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ }
    return null;
  }
}

export function clearPending() {
  try {
    sessionStorage.removeItem('zd_pending_' + APP_ID);
  } catch (e) {
    try { console.debug(e); } catch (e2) { /* Optional debug output can be skipped. */ }
  }
}

export async function requestCode(email) {
  return apiFetch('/auth/otp/request', {
    method: 'POST',
    auth: false,
    body: { email: String(email).trim().toLowerCase(), app: APP_ID },
  });
}

export async function verifyCode(email, code) {
  const data = await apiFetch('/auth/otp/verify', {
    method: 'POST',
    auth: false,
    body: { email, code, app: APP_ID },
  });
  setSession(data);
  return data;
}

function withNext(path, query) {
  return query.next ? path + '?next=' + encodeURIComponent(query.next) : path;
}

function emailRoute(query) {
  const params = new URLSearchParams();
  if (query.mode) params.set('mode', query.mode);
  if (query.next) params.set('next', query.next);
  const suffix = params.toString();
  return '/email' + (suffix ? '?' + suffix : '');
}

function showAuthError(err) {
  if (err && err.code === 'ZD-EML-001') {
    showError({ ...err, message: 'We could not send the email. Please try again.' });
    return;
  }
  showError(err);
}

export function renderEmailPage(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    const title = ctx.query.mode === 'login' ? 'Welcome back' : 'Enter your email';
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
      name: 'email',
      label: 'Email',
      type: 'email',
      inputmode: 'email',
      autocomplete: 'email',
      required: true,
    });
    field.input.setAttribute('autocapitalize', 'off');
    field.input.setAttribute('spellcheck', 'false');
    screen.appendChild(field.el);
    screen.appendChild(el('p', { class: 'mu' }, 'We will email you a sign-in code.'));

    const btn = el('button', { class: 'btn', type: 'button' }, 'Continue');
    screen.appendChild(btn);
    screen.appendChild(el('p', { class: 'mu' }, 'By continuing you agree to the Terms and Privacy Policy.'));

    async function handleSubmit() {
      clearFieldErrors(screen);
      const email = field.getValue().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        field.setError('Enter a valid email address');
        return;
      }
      try {
        const result = await withSpinner(requestCode(email));
        savePending({
          email,
          otpLength: result.otpLength,
          maskedEmail: result.maskedEmail,
          devCode: result.devCode,
        });
        ctx.navigate(withNext('/otp', ctx.query));
      } catch (err) {
        if (err.code === 'ZD-AUTH-004') {
          renderRoleMismatch(screen, err, () => ctx.navigate(emailRoute(ctx.query)));
        } else if (err.code === 'ZD-VAL-001' && err.field === 'email') {
          field.setError(err.message);
        } else {
          showAuthError(err);
        }
      }
    }

    btn.addEventListener('click', handleSubmit);
    field.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleSubmit();
      }
    });
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

export function renderOtpPage(ctx, { afterLogin }) {
  const screen = el('div', { class: 'screen' });
  try {
    const pending = getPending();
    if (!pending) {
      ctx.navigate(withNext('/email', ctx.query), { replace: true });
      return screen;
    }

    const otpLength = Number(pending.otpLength);
    if (!Number.isInteger(otpLength) || otpLength < 4 || otpLength > 8) {
      ctx.navigate(withNext('/email', ctx.query), { replace: true });
      return screen;
    }

    screen.appendChild(createTopbar({
      onBack: () => ctx.navigate(withNext('/email', ctx.query)),
      title: 'Enter the code',
    }));
    screen.appendChild(el('h1', {}, 'Enter the code'));
    screen.appendChild(el(
      'p',
      { class: 'mu' },
      `Code sent to ${pending.maskedEmail}. Check your spam folder if you cannot find it.`
    ));

    const otpWrapper = el('div', { class: 'otp', dataset: { field: 'code' } });
    const inputs = [];
    for (let index = 0; index < otpLength; index++) {
      const input = el('input', {
        type: 'text',
        inputmode: 'numeric',
        maxlength: 1,
        autocomplete: index === 0 ? 'one-time-code' : 'off',
        attrs: { 'aria-label': 'Digit ' + (index + 1) },
      });
      inputs.push(input);
      otpWrapper.appendChild(input);
    }
    screen.appendChild(otpWrapper);

    let devCodeBanner = null;
    let devCodeText = null;
    if (CONFIG.ZD_DEBUG && pending.devCode) {
      devCodeBanner = el('div', { class: 'banner warn' });
      devCodeBanner.appendChild(el('b', {}, 'Dev code'));
      devCodeText = el('span', {}, pending.devCode);
      devCodeBanner.appendChild(devCodeText);
      screen.appendChild(devCodeBanner);
    }

    const resendButton = el('button', { class: 'link-btn', type: 'button' }, 'Resend code');
    screen.appendChild(resendButton);
    const changeButton = el('button', { class: 'link-btn', type: 'button' }, 'Use a different email');
    screen.appendChild(changeButton);

    let countdown = 30;
    let intervalId = null;
    let verifying = false;
    let resending = false;
    function clearCountdown() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }
    ctx.onLeave(clearCountdown);

    function startCountdown() {
      clearCountdown();
      resendButton.disabled = true;
      resendButton.textContent = 'Resend code in ' + countdown + 's';
      intervalId = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          clearCountdown();
          resendButton.disabled = false;
          resendButton.textContent = 'Resend code';
        } else {
          resendButton.textContent = 'Resend code in ' + countdown + 's';
        }
      }, 1000);
    }
    startCountdown();

    resendButton.addEventListener('click', async () => {
      if (resendButton.disabled || resending) return;
      resending = true;
      resendButton.disabled = true;
      try {
        const result = await withSpinner(requestCode(pending.email));
        savePending({
          email: pending.email,
          otpLength: result.otpLength,
          maskedEmail: result.maskedEmail,
          devCode: result.devCode,
        });
        pending.otpLength = result.otpLength;
        pending.maskedEmail = result.maskedEmail;
        pending.devCode = result.devCode || null;
        if (CONFIG.ZD_DEBUG && pending.devCode) {
          if (!devCodeBanner) {
            devCodeBanner = el('div', { class: 'banner warn' });
            devCodeBanner.appendChild(el('b', {}, 'Dev code'));
            devCodeText = el('span', {});
            devCodeBanner.appendChild(devCodeText);
            screen.insertBefore(devCodeBanner, resendButton);
          }
          devCodeText.textContent = pending.devCode;
        } else if (devCodeBanner && devCodeBanner.parentNode) {
          devCodeBanner.parentNode.removeChild(devCodeBanner);
          devCodeBanner = null;
          devCodeText = null;
        }
        toast('Code sent', 'ok');
        countdown = 30;
        startCountdown();
      } catch (err) {
        showAuthError(err);
      } finally {
        resending = false;
        if (countdown <= 0) {
          resendButton.disabled = false;
          resendButton.textContent = 'Resend code';
        }
      }
    });

    changeButton.addEventListener('click', () => {
      clearPending();
      ctx.navigate(emailRoute(ctx.query));
    });

    function checkAll() {
      const code = inputs.map((input) => input.value).join('');
      if (code.length === otpLength && !verifying) verify(code);
    }

    function fillDigits(raw) {
      const digits = String(raw).replace(/\D/g, '').slice(0, otpLength);
      inputs.forEach((input, index) => {
        input.value = digits[index] || '';
      });
      const focusIndex = Math.min(digits.length, otpLength - 1);
      inputs[focusIndex].focus();
      checkAll();
    }

    inputs.forEach((input, index) => {
      input.addEventListener('input', (event) => {
        const value = event.target.value;
        if (value.length > 1) {
          fillDigits(value);
          return;
        }
        if (!/^\d$/.test(value)) {
          event.target.value = '';
          return;
        }
        if (index < otpLength - 1) inputs[index + 1].focus();
        checkAll();
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Backspace') {
          if (input.value) {
            input.value = '';
          } else if (index > 0) {
            inputs[index - 1].value = '';
            inputs[index - 1].focus();
          }
        }
      });
      input.addEventListener('paste', (event) => {
        event.preventDefault();
        fillDigits((event.clipboardData || window.clipboardData).getData('text'));
      });
    });

    async function verify(code) {
      verifying = true;
      inputs.forEach((input) => { input.disabled = true; });
      try {
        const data = await withSpinner(verifyCode(pending.email, code));
        clearPending();
        ctx.navigate(afterLogin(data, ctx), { replace: true });
      } catch (err) {
        verifying = false;
        inputs.forEach((input) => {
          input.disabled = false;
          input.value = '';
        });
        inputs[0].focus();
        if (err.code === 'ZD-AUTH-002') {
          otpWrapper.classList.add('has-error');
          let error = otpWrapper.querySelector('.field-error');
          if (!error) {
            error = el('div', { class: 'field-error' });
            otpWrapper.appendChild(error);
          }
          error.textContent = 'That code is wrong or expired. Try again.';
        } else if (err.code === 'ZD-AUTH-004') {
          renderRoleMismatch(screen, err, () => ctx.navigate(emailRoute(ctx.query)));
        } else {
          showAuthError(err);
        }
      }
    }

    const focusTimer = setTimeout(() => inputs[0].focus(), 0);
    ctx.onLeave(() => clearTimeout(focusTimer));
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

export function renderRoleMismatch(container, err, onBack) {
  clear(container);
  const screen = el('div', { class: 'screen' });
  const card = el('div', { class: 'card' });
  card.appendChild(el('div', {}, '🚫'));
  card.appendChild(el('h2', {}, 'This email belongs to the other app'));
  card.appendChild(el('p', {}, err.message || 'This email is registered with the other app.'));

  const otherAppId = APP_ID === 'driver' ? 'provider' : 'driver';
  const otherApp = CONFIG.APPS[otherAppId];
  card.appendChild(el('a', { class: 'btn', attrs: { href: otherApp.path } }, 'Open ' + otherApp.name));

  const backButton = el('button', { class: 'btn soft', type: 'button' }, 'Use a different email');
  backButton.addEventListener('click', onBack);
  card.appendChild(backButton);
  screen.appendChild(card);
  container.appendChild(screen);
}
