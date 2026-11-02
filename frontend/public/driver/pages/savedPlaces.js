import { apiFetch } from '../../shared/api.js';
import { showError } from '../../shared/errors.js';
import { clear, el, modal, toast } from '../../shared/ui.js';
import { isAuthed } from '../../shared/auth.js';
import { goToLogin } from '../../shared/router.js';
import { getPosition } from '../../shared/geo.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { createField } from '../../shared/components/field.js';

export default function render(ctx) {
  let active = true;
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Saved places', onBack: () => ctx.navigate('/account') }));
  if (!isAuthed()) {
    ctx.navigate(goToLogin('/saved-places'));
    return screen;
  }

  const list = el('div');
  const empty = el('div', { class: 'empty hidden' }, 'No saved places yet');
  screen.appendChild(list);
  screen.appendChild(empty);

  const form = el('div', { class: 'card' });
  form.appendChild(el('h2', {}, 'Add current location'));
  form.appendChild(el('p', {}, 'Use GPS to save your current coordinates.'));
  const labelField = createField({
    name: 'label',
    label: 'Name this place',
    placeholder: 'Home or Work',
    maxlength: 40,
    required: true,
  });
  form.appendChild(labelField.el);
  const chips = el('div', { class: 'chips' });
  ['Home', 'Work'].forEach((label) => {
    const chip = el('button', { class: 'chip', type: 'button' }, label);
    chip.addEventListener('click', () => labelField.setValue(label));
    chips.appendChild(chip);
  });
  form.appendChild(chips);
  const addressField = createField({
    name: 'address',
    label: 'Address',
    placeholder: 'Street address or landmark',
    maxlength: 200,
    required: true,
  });
  form.appendChild(addressField.el);
  const locationMessage = el('div', { class: 'banner warn hidden' });
  form.appendChild(locationMessage);
  const saveButton = el('button', { class: 'btn', type: 'button' }, 'Add saved place');
  form.appendChild(saveButton);
  screen.appendChild(form);

  function showFieldError(err) {
    if (err.field === 'label') {
      labelField.setError(err.message);
      return true;
    }
    if (err.field === 'address') {
      addressField.setError(err.message);
      return true;
    }
    return false;
  }

  async function loadPlaces() {
    try {
      const data = await apiFetch('/drivers/me/saved-places', { signal: ctx.signal });
      if (!active) return;
      clear(list);
      const places = data.places || [];
      empty.classList.toggle('hidden', places.length > 0);
      places.forEach((place) => {
        const row = el('div', { class: 'saved-place-row' });
        const details = el('div', { class: 'saved-place-info' });
        details.appendChild(el('strong', {}, place.label));
        details.appendChild(el('small', {}, place.address));
        row.appendChild(details);
        const remove = el('button', {
          class: 'btn soft',
          type: 'button',
          attrs: { 'aria-label': 'Delete ' + place.label },
        }, 'Delete');
        remove.addEventListener('click', async () => {
          const confirmed = await modal({
            title: 'Delete saved place?',
            body: place.label,
            actions: [
              { label: 'Keep', kind: 'soft', value: false },
              { label: 'Delete', kind: 'red', value: true },
            ],
          });
          if (!confirmed || !active) return;
          remove.disabled = true;
          try {
            await apiFetch('/drivers/me/saved-places/' + encodeURIComponent(place.id), {
              method: 'DELETE',
              signal: ctx.signal,
            });
            if (active) {
              toast('Saved place deleted', 'ok');
              await loadPlaces();
            }
          } catch (err) {
            if (active && !ctx.signal.aborted) showError(err);
          } finally {
            if (active) remove.disabled = false;
          }
        });
        row.appendChild(remove);
        list.appendChild(row);
      });
    } catch (err) {
      if (active && !ctx.signal.aborted) showError(err);
    }
  }

  async function addPlace() {
    labelField.clearError();
    addressField.clearError();
    const label = labelField.getValue();
    const address = addressField.getValue();
    if (!label) {
      labelField.setError('Give this place a name');
      return;
    }
    if (label.length > 40) {
      labelField.setError('Use 40 characters or fewer');
      return;
    }
    if (!address) {
      addressField.setError('Enter an address');
      return;
    }
    if (address.length > 200) {
      addressField.setError('Use 200 characters or fewer');
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = 'Getting location…';
    try {
      const position = await getPosition();
      if (!active) return;
      locationMessage.textContent = 'Current coordinates captured.';
      locationMessage.classList.remove('hidden');
      saveButton.textContent = 'Saving…';
      await apiFetch('/drivers/me/saved-places', {
        method: 'POST',
        body: { label, address, lat: position.lat, lng: position.lng },
        signal: ctx.signal,
      });
      if (!active) return;
      toast('Saved place added', 'ok');
      labelField.setValue('');
      addressField.setValue('');
      locationMessage.classList.add('hidden');
      await loadPlaces();
    } catch (err) {
      if (!active || ctx.signal.aborted) return;
      if (err && err.code && ['DENIED', 'UNAVAILABLE', 'TIMEOUT', 'UNSUPPORTED'].includes(err.code)) {
        toast('Location unavailable. Check your permission and try again.', 'error');
      } else if (!showFieldError(err)) {
        showError(err);
      }
    } finally {
      if (active) {
        saveButton.disabled = false;
        saveButton.textContent = 'Add saved place';
      }
    }
  }

  saveButton.addEventListener('click', addPlace);
  ctx.onLeave(() => {
    active = false;
  });
  loadPlaces();
  return screen;
}