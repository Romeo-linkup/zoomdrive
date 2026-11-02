// admin/login.js
import { el } from '../shared/ui.js';
import { createField } from '../shared/components/field.js';
import { apiFetch } from '../shared/api.js';
import { setToken } from '../shared/auth.js';
import { showError, clearError, clearFieldErrors } from '../shared/errors.js';
import { setAdmin } from './app.js';

export default function render(ctx) {
  const screen = el('div', { class: 'screen' });
  const form = el('form');
  const box = el('div', { class: 'login-box card' });
  
  const logo = el('img', {
    class: 'landing-logo',
    src: '/brand/logo.svg',
    alt: 'ZoomDrive logo',
    attrs: { width: '120', height: '38' }
  });
  box.appendChild(logo);
  
  box.appendChild(el('h1', {}, 'Admin sign in'));
  
  const emailField = createField({
    name: 'email',
    label: 'Email',
    type: 'email',
    placeholder: 'you@example.com',
    autocomplete: 'username',
  });
  box.appendChild(emailField.el);
  
  const passwordField = createField({
    name: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'Enter your password',
    autocomplete: 'current-password',
  });
  box.appendChild(passwordField.el);
  
  const submitBtn = el('button', { class: 'btn', type: 'submit' }, 'Sign in');
  box.appendChild(submitBtn);
  
  form.appendChild(box);
  screen.appendChild(form);
  
  async function handleSubmit(e) {
    e.preventDefault();
    clearError();
    clearFieldErrors(screen);
    
    const email = emailField.getValue();
    const password = passwordField.getValue();
    
    if (!email) {
      emailField.setError('Enter your email');
      return;
    }
    if (!password) {
      passwordField.setError('Enter your password');
      return;
    }
    
    try {
      const data = await apiFetch('/admin/auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password },
      });
      setToken(data.token);
      setAdmin(data.admin);
      ctx.navigate('/overview');
    } catch (err) {
      showError(err);
    }
  }
  
  form.addEventListener('submit', handleSubmit);
  
  return screen;
}
