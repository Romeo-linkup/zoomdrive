import { refreshMe } from '../../shared/auth.js';
import { apiFetch } from '../../shared/api.js';
import { showError, clearFieldErrors } from '../../shared/errors.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, clear, toast, withSpinner } from '../../shared/ui.js';
import { serviceEmoji } from '../../shared/services.js';
import { createPageError } from './pageError.js';

export default async function render(ctx) {
  try {
    return await renderServices(ctx);
  } catch (err) {
    return createPageError(err, () => ctx.navigate(ctx.path));
  }
}

async function renderServices(ctx) {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Services offered', onBack: () => ctx.navigate('/menu') }));
  const servicesField = el('div', { class: 'field', dataset: { field: 'serviceIds' } });
  const chips = el('div', { class: 'chips' });
  servicesField.appendChild(chips);
  screen.appendChild(servicesField);
  const saveButton = el('button', { class: 'btn', type: 'button' }, 'Save services');
  screen.appendChild(saveButton);

  const selectedIds = new Set();
  let services = [];

  function renderChips() {
    clear(chips);
    services.forEach((service) => {
      const chip = el('button', { class: 'chip', type: 'button' });
      chip.appendChild(document.createTextNode((service.icon || serviceEmoji(service.code)) + ' ' + service.name));
      if (selectedIds.has(Number(service.id))) {
        chip.classList.add('on');
        chip.setAttribute('aria-pressed', 'true');
      }
      chip.addEventListener('click', () => {
        if (selectedIds.has(Number(service.id))) {
          selectedIds.delete(Number(service.id));
          chip.classList.remove('on');
          chip.removeAttribute('aria-pressed');
        } else {
          selectedIds.add(Number(service.id));
          chip.classList.add('on');
          chip.setAttribute('aria-pressed', 'true');
        }
        servicesField.classList.remove('has-error');
      });
      chips.appendChild(chip);
    });
  }

  try {
    const [serviceData, me] = await Promise.all([
      apiFetch('/services', { auth: false, signal: ctx.signal }),
      apiFetch('/auth/me', { signal: ctx.signal }),
    ]);
    services = Array.isArray(serviceData.services) ? serviceData.services : [];
    (me.profile && Array.isArray(me.profile.serviceIds) ? me.profile.serviceIds : [])
      .forEach((id) => selectedIds.add(Number(id)));
    renderChips();
  } catch (err) {
    if (!ctx.signal.aborted) showError(err);
    servicesField.appendChild(el('p', {}, 'Services could not be loaded.'));
  }

  saveButton.addEventListener('click', async () => {
    clearFieldErrors(screen);
    if (!selectedIds.size) {
      showError({ code: 'ZD-PROV-003', message: 'Choose at least one service', field: 'serviceIds' });
      return;
    }
    try {
      await withSpinner(apiFetch('/providers/me/services', {
        method: 'PUT',
        body: { serviceIds: Array.from(selectedIds) },
        signal: ctx.signal,
      }));
      await refreshMe();
      toast('Services saved', 'ok');
    } catch (err) {
      showError(err);
    }
  });
  return screen;
}