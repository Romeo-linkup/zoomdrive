// admin/pages/services.js
import { el, clear } from '../../shared/ui.js';
import { apiFetch } from '../../shared/api.js';
import { showError, clearError, clearFieldErrors } from '../../shared/errors.js';
import { toast } from '../../shared/ui.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  
  const head = el('div', { class: 'page-head' });
  head.appendChild(el('h1', {}, 'Services and prices'));
  screen.appendChild(head);
  
  const note = el('div', { class: 'mu' }, 'Changes apply to new requests only. Requests already made keep the price the driver saw.');
  screen.appendChild(note);
  
  const tableWrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'tbl svc-table' });
  const thead = el('thead');
  const headerRow = el('tr');
  headerRow.appendChild(el('th', {}, 'Service'));
  headerRow.appendChild(el('th', {}, 'Name'));
  headerRow.appendChild(el('th', {}, 'Base price (R)'));
  headerRow.appendChild(el('th', {}, 'Per km (R)'));
  headerRow.appendChild(el('th', {}, 'Minimum distance fee (R)'));
  headerRow.appendChild(el('th', {}, 'Active'));
  headerRow.appendChild(el('th', {}, ''));
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = el('tbody');
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  screen.appendChild(tableWrap);
  
  const fuelNote = el('div', { class: 'mu' }, 'Note: Fuel stays inactive until the legal and safety review is done.');
  screen.appendChild(fuelNote);
  
  let services = [];
  const rowStates = new Map();
  
  async function load() {
    clearError();
    try {
      const data = await apiFetch('/admin/services');
      services = data.services || [];
      renderTable();
    } catch (err) {
      showError(err);
      renderTable();
    }
  }
  
  function renderTable() {
    clear(tbody);
    rowStates.clear();
    
    for (const svc of services) {
      const tr = el('tr');
      
      const codeTd = el('td');
      const emoji = getEmoji(svc.code);
      codeTd.appendChild(el('span', {}, emoji + ' ' + svc.code));
      tr.appendChild(codeTd);
      
      const nameTd = el('td');
      const nameInput = el('input', { 
        type: 'text', 
        value: svc.name || '',
        attrs: { 'aria-label': 'Service name' }
      });
      nameTd.appendChild(nameInput);
      tr.appendChild(nameTd);
      
      const basePriceTd = el('td');
      const basePriceInput = el('input', { 
        type: 'number', 
        step: '0.01',
        value: (svc.basePriceCents || 0) / 100,
        attrs: { 'aria-label': 'Base price' }
      });
      basePriceTd.appendChild(basePriceInput);
      tr.appendChild(basePriceTd);
      
      const perKmTd = el('td');
      const perKmInput = el('input', { 
        type: 'number', 
        step: '0.01',
        value: (svc.perKmCents || 0) / 100,
        attrs: { 'aria-label': 'Per km price' }
      });
      perKmTd.appendChild(perKmInput);
      tr.appendChild(perKmTd);
      
      const minFeeTd = el('td');
      const minFeeInput = el('input', { 
        type: 'number', 
        step: '0.01',
        value: (svc.minDistanceFeeCents || 0) / 100,
        attrs: { 'aria-label': 'Minimum distance fee' }
      });
      minFeeTd.appendChild(minFeeInput);
      tr.appendChild(minFeeTd);
      
      const activeTd = el('td');
      const activeCheckbox = el('input', { 
        type: 'checkbox',
        attrs: { 'aria-label': 'Active' }
      });
      activeCheckbox.checked = svc.active === true;
      activeTd.appendChild(activeCheckbox);
      tr.appendChild(activeTd);
      
      const actionTd = el('td');
      const saveBtn = el('button', { class: 'btn', type: 'button' }, 'Save');
      saveBtn.disabled = true;
      actionTd.appendChild(saveBtn);
      tr.appendChild(actionTd);
      
      tbody.appendChild(tr);
      
      const state = {
        original: {
          name: svc.name,
          basePriceCents: svc.basePriceCents,
          perKmCents: svc.perKmCents,
          minDistanceFeeCents: svc.minDistanceFeeCents,
          active: svc.active,
        },
        changed: false,
      };
      rowStates.set(svc.id, state);
      
      function checkChanged() {
        const currentName = nameInput.value.trim();
        const currentBasePrice = Math.round(Number(basePriceInput.value) * 100);
        const currentPerKm = Math.round(Number(perKmInput.value) * 100);
        const currentMinFee = Math.round(Number(minFeeInput.value) * 100);
        const currentActive = activeCheckbox.checked;
        
        state.changed = (
          currentName !== state.original.name ||
          currentBasePrice !== state.original.basePriceCents ||
          currentPerKm !== state.original.perKmCents ||
          currentMinFee !== state.original.minDistanceFeeCents ||
          currentActive !== state.original.active
        );
        saveBtn.disabled = !state.changed;
      }
      
      nameInput.addEventListener('input', checkChanged);
      basePriceInput.addEventListener('input', checkChanged);
      perKmInput.addEventListener('input', checkChanged);
      minFeeInput.addEventListener('input', checkChanged);
      activeCheckbox.addEventListener('change', checkChanged);
      
      saveBtn.addEventListener('click', async () => {
        clearError();
        clearFieldErrors(screen);
        
        const body = {};
        const currentName = nameInput.value.trim();
        if (currentName !== state.original.name) body.name = currentName;
        
        const currentBasePrice = Math.round(Number(basePriceInput.value) * 100);
        if (currentBasePrice !== state.original.basePriceCents) body.basePriceCents = currentBasePrice;
        
        const currentPerKm = Math.round(Number(perKmInput.value) * 100);
        if (currentPerKm !== state.original.perKmCents) body.perKmCents = currentPerKm;
        
        const currentMinFee = Math.round(Number(minFeeInput.value) * 100);
        if (currentMinFee !== state.original.minDistanceFeeCents) body.minDistanceFeeCents = currentMinFee;
        
        const currentActive = activeCheckbox.checked;
        if (currentActive !== state.original.active) body.active = currentActive;
        
        try {
          const data = await apiFetch('/admin/services/' + svc.id, {
            method: 'PUT',
            body,
          });
          toast('Saved', 'ok');
          
          const idx = services.findIndex(s => s.id === svc.id);
          if (idx !== -1) {
            services[idx] = data.service;
          }
          state.original = {
            name: data.service.name,
            basePriceCents: data.service.basePriceCents,
            perKmCents: data.service.perKmCents,
            minDistanceFeeCents: data.service.minDistanceFeeCents,
            active: data.service.active,
          };
          checkChanged();
        } catch (err) {
          showError(err);
        }
      });
    }
  }
  
  function getEmoji(code) {
    const emojis = {
      flat_tyre: '🔧',
      jump_start: '🔋',
      fuel: '⛽',
      essentials: '📦',
      towing: '🚗',
    };
    return emojis[code] || '⚙️';
  }
  
  ctx.onLeave(() => {
    // no cleanup needed
  });
  
  await load();
  
  return screen;
}
