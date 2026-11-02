import { getSession, getUser, refreshMe } from '../../shared/auth.js';
import { apiFetch } from '../../shared/api.js';
import { showError, clearFieldErrors } from '../../shared/errors.js';
import { createField } from '../../shared/components/field.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, toast, withSpinner } from '../../shared/ui.js';
import { createPageError } from './pageError.js';

export default async function render(ctx) {
  try {
    return await renderVehicle(ctx);
  } catch (err) {
    return createPageError(err, () => ctx.navigate(ctx.path));
  }
}

async function renderVehicle(ctx) {
  const session = getSession();
  const user = getUser();
  const profile = session && session.profile ? session.profile : {};
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Vehicle and service kit', onBack: () => ctx.navigate('/menu') }));
  const description = createField({
    name: 'vehicleDescription',
    label: 'Vehicle description',
    value: profile.vehicleDescription || '',
    maxlength: 120,
    required: true,
  });
  const plate = createField({
    name: 'plate',
    label: 'Number plate',
    value: profile.plate || '',
    maxlength: 15,
    required: true,
  });
  screen.appendChild(description.el);
  screen.appendChild(plate.el);
  const save = el('button', { class: 'btn', type: 'button' }, 'Save vehicle');
  screen.appendChild(save);

  save.addEventListener('click', async () => {
    clearFieldErrors(screen);
    const vehicleDescription = description.getValue();
    const plateValue = plate.getValue();
    if (vehicleDescription.length < 2) {
      description.setError('Describe your vehicle');
      return;
    }
    if (plateValue.length < 2) {
      plate.setError('Enter your number plate');
      return;
    }
    const body = {
      providerType: profile.providerType,
      firstName: user && user.firstName,
      lastName: user && user.lastName,
      vehicleDescription,
      plate: plateValue,
      baseLat: Number(profile.baseLat),
      baseLng: Number(profile.baseLng),
      serviceRadiusKm: Number(profile.serviceRadiusKm),
      consent: true,
    };
    if (!body.providerType || !body.firstName || !body.lastName
      || !Number.isFinite(body.baseLat) || !Number.isFinite(body.baseLng)
      || !Number.isInteger(body.serviceRadiusKm)) {
      showError({ code: 'ZD-VAL-001', message: 'Complete your provider profile before editing your vehicle.' });
      return;
    }
    try {
      await withSpinner(apiFetch('/providers/me', {
        method: 'PUT',
        body,
        signal: ctx.signal,
      }));
      await refreshMe();
      toast('Vehicle details saved', 'ok');
    } catch (err) {
      showError(err);
    }
  });
  return screen;
}