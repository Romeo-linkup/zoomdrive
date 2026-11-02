// admin/pages/settings.js
import { el, clear, formatZAR } from '../../shared/ui.js';
import { apiFetch } from '../../shared/api.js';
import { showError, clearError, clearFieldErrors } from '../../shared/errors.js';
import { toast } from '../../shared/ui.js';
import { formatDate } from '../../shared/ui.js';

const SETTING_FIELDS = [
  { key: 'road_factor', label: 'Road distance factor', hint: 'Straight-line distance multiplied by this to estimate road distance', type: 'number' },
  { key: 'avg_speed_kmh', label: 'Average speed (km/h)', hint: 'Used for ETA estimates', type: 'number' },
  { key: 'offer_radius_km', label: 'Offer radius (km)', hint: 'How far from the driver we look for providers', type: 'number' },
  { key: 'max_offers_per_request', label: 'Providers offered each request', hint: '', type: 'number' },
  { key: 'request_expiry_seconds', label: 'Request expires after (seconds)', hint: '', type: 'number' },
  { key: 'provider_stale_seconds', label: 'Provider location counts as stale after (seconds)', hint: '', type: 'number' },
  { key: 'cancel_fee_cents', label: 'Cancellation fee (R)', hint: 'Display rands, send cents', type: 'number', isCents: true },
];

const PROTECTED_PRICING_FIELDS = [
  { key: 'commission_pct', label: 'Platform commission', format: value => value + '%' },
  { key: 'provider_registration_fee_cents', label: 'Provider registration fee', format: value => formatZAR(Number(value)) },
  { key: 'provider_registration_fee_enabled', label: 'Charge registration fee', format: value => value === true || value === 'true' ? 'On' : 'Off' },
  { key: 'driver_plus_enabled', label: 'ZoomDrive Plus', format: value => value === true || value === 'true' ? 'On' : 'Off' },
  { key: 'driver_plus_monthly_cents', label: 'ZoomDrive Plus monthly price', format: value => formatZAR(Number(value)) },
  { key: 'driver_plus_trial_days', label: 'ZoomDrive Plus free-trial days', format: value => String(value) },
  { key: 'driver_plus_extra_offers', label: 'ZoomDrive Plus extra offers', format: value => String(value) },
];

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  
  const head = el('div', { class: 'page-head' });
  head.appendChild(el('h1', {}, 'Settings'));
  screen.appendChild(head);
  
  const form = el('div', { class: 'settings-form' });
  screen.appendChild(form);

  screen.appendChild(el('div', { class: 'mu' }, 'Change these on the Pricing page.'));
  
  const saveBtn = el('button', { class: 'btn', type: 'button' }, 'Save settings');
  screen.appendChild(saveBtn);
  
  const lastUpdated = el('div', { class: 'mu' });
  screen.appendChild(lastUpdated);
  
  let settings = [];
  const fieldMap = new Map();
  const originalValues = new Map();
  
  async function load() {
    clearError();
    try {
      const data = await apiFetch('/admin/settings');
      settings = data.settings || [];
      renderForm();
    } catch (err) {
      showError(err);
      renderForm();
    }
  }
  
  function renderForm() {
    clear(form);
    fieldMap.clear();
    originalValues.clear();
    
    let lastUpdatedAt = null;

    const pricingCard = el('div', { class: 'card' });
    pricingCard.appendChild(el('h2', {}, 'Pricing (read-only)'));
    for (const fieldDef of PROTECTED_PRICING_FIELDS) {
      const setting = settings.find(s => s.key === fieldDef.key);
      const field = el('div', { class: 'field' });
      field.appendChild(el('label', {}, fieldDef.label));
      field.appendChild(el('div', {}, setting ? fieldDef.format(setting.value) : 'Not set'));
      field.appendChild(el('small', {}, 'Change these on the Pricing page'));
      pricingCard.appendChild(field);
      if (setting && setting.updatedAt) lastUpdatedAt = setting.updatedAt;
    }
    form.appendChild(pricingCard);
    
    for (const fieldDef of SETTING_FIELDS) {
      const setting = settings.find(s => s.key === fieldDef.key);
      const value = setting ? setting.value : 0;
      originalValues.set(fieldDef.key, value);
      
      if (setting && setting.updatedAt) {
        lastUpdatedAt = setting.updatedAt;
      }
      
      const fieldEl = el('div', { class: 'field', dataset: { field: 'values.' + fieldDef.key } });
      
      const label = el('label', {}, fieldDef.label);
      fieldEl.appendChild(label);
      
      let inputValue = value;
      if (fieldDef.isCents) {
        inputValue = value / 100;
      }
      
      const input = el('input', {
        type: fieldDef.type || 'text',
        value: String(inputValue),
        attrs: {
          'aria-label': fieldDef.label,
          'min': setting && setting.min !== undefined ? String(setting.min) : '',
          'max': setting && setting.max !== undefined ? String(setting.max) : '',
        },
      });
      fieldEl.appendChild(input);
      
      if (fieldDef.hint) {
        const hint = el('small', {}, fieldDef.hint);
        fieldEl.appendChild(hint);
      }
      
      form.appendChild(fieldEl);
      fieldMap.set(fieldDef.key, input);
    }
    
    if (lastUpdatedAt) {
      lastUpdated.textContent = 'Last updated ' + formatDate(lastUpdatedAt, 'datetime');
    } else {
      lastUpdated.textContent = '';
    }
  }
  
  saveBtn.addEventListener('click', async () => {
    clearError();
    clearFieldErrors(screen);
    
    const values = {};
    let hasChanges = false;
    
    for (const fieldDef of SETTING_FIELDS) {
      const input = fieldMap.get(fieldDef.key);
      if (!input) continue;
      
      const rawValue = input.value.trim();
      const numValue = Number(rawValue);
      
      if (isNaN(numValue)) {
        showError({ field: 'values.' + fieldDef.key, message: 'Must be a number' });
        return;
      }
      
      let finalValue = numValue;
      if (fieldDef.isCents) {
        finalValue = Math.round(numValue * 100);
      }
      
      const original = originalValues.get(fieldDef.key);
      if (finalValue !== original) {
        values[fieldDef.key] = finalValue;
        hasChanges = true;
      }
    }
    
    if (!hasChanges) {
      toast('No changes to save', 'info');
      return;
    }
    
    try {
      const data = await apiFetch('/admin/settings', {
        method: 'PUT',
        body: { values },
      });
      settings = data.settings || [];
      toast('Settings saved', 'ok');
      renderForm();
    } catch (err) {
      showError(err);
    }
  });
  
  ctx.onLeave(() => {
    // no cleanup needed
  });
  
  await load();
  
  return screen;
}
