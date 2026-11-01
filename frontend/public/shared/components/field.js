// shared/components/field.js
import { el } from '../ui.js';

export function createField({ name, label, type = 'text', value = '', placeholder = '', inputmode, maxlength, autocomplete, prefix, required = false }) {
  const fieldEl = el('div', { class: 'field', dataset: { field: name } });
  const id = 'f-' + name;
  let input;

  if (label !== undefined && label !== null) {
    const labelEl = el('label', { attrs: { for: id } }, String(label));
    if (required) {
      labelEl.textContent += ' *';
    }
    fieldEl.appendChild(labelEl);
  }

  if (prefix) {
    const row = el('div', { class: 'input-row' });
    const pre = el('span', { class: 'pre' }, String(prefix));
    row.appendChild(pre);
    input = el('input', { id, type, value, placeholder, inputmode, maxlength, autocomplete });
    row.appendChild(input);
    fieldEl.appendChild(row);
  } else {
    input = el('input', { id, type, value, placeholder, inputmode, maxlength, autocomplete });
    fieldEl.appendChild(input);
  }

  if (required) {
    input.setAttribute('required', '');
  }

  return {
    el: fieldEl,
    input,
    getValue() {
      return input.value ? input.value.trim() : '';
    },
    setValue(v) {
      input.value = v === undefined || v === null ? '' : String(v);
    },
    setError(message) {
      fieldEl.classList.add('has-error');
      let err = fieldEl.querySelector('.field-error');
      if (!err) {
        err = el('div', { class: 'field-error', attrs: { role: 'alert' } });
        fieldEl.appendChild(err);
      }
      err.textContent = message || '';
    },
    clearError() {
      fieldEl.classList.remove('has-error');
      const err = fieldEl.querySelector('.field-error');
      if (err && err.parentNode) {
        err.parentNode.removeChild(err);
      }
    },
  };
}
