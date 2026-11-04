// provider/pages/profileSetup.js
import { getSession, getUser, refreshMe } from '../../shared/auth.js';
import { apiFetch } from '../../shared/api.js';
import { clear, el, toast, withSpinner } from '../../shared/ui.js';
import { clearFieldErrors, showError, renderPageError } from '../../shared/errors.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { createField } from '../../shared/components/field.js';
import { createPhotoUpload } from '../../shared/components/photo-upload.js';
import { loadServices, serviceEmoji } from '../../shared/services.js';
import { onboardingRoute } from '../onboarding.js';
import { validatePhone } from '../../shared/authFlow.js';

export default function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    return renderProfileSetup(ctx, screen);
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

function renderProfileSetup(ctx, screen) {
  const session = getSession();
  const user = getUser();
  const profile = session && session.profile ? session.profile : {};
  const providerType = ctx.query.type || profile.providerType;

  if (!providerType) {
    ctx.navigate('/type');
    return el('div', {});
  }

  const center = el('div', { class: 'page-center' });
  const inner = el('div', { class: 'page-center__inner' });

  const isCompany = providerType === 'company';
  const isEdit = !!profile.providerType;

  inner.appendChild(createTopbar({
    title: 'Your details',
    onBack: () => ctx.navigate(isEdit ? '/menu' : '/type'),
  }));

  inner.appendChild(el('span', { class: 'badge dark' }, isCompany ? 'Company' : 'Individual'));

  const photo = createPhotoUpload({
    required: true,
    initialUrl: user && user.photoUrl ? user.photoUrl : null,
    label: 'Add profile photo',
  });
  inner.appendChild(photo.el);
  inner.appendChild(el('p', { class: 'mu' }, 'A clear photo of your face is compulsory. Drivers see it when you arrive.'));

  const firstName = createField({
    name: 'firstName',
    label: 'First name',
    value: user && user.firstName ? user.firstName : '',
  });
  inner.appendChild(firstName.el);

  const lastName = createField({
    name: 'lastName',
    label: 'Surname',
    value: user && user.lastName ? user.lastName : '',
  });
  inner.appendChild(lastName.el);
  inner.appendChild(el('p', { class: 'mu' }, 'Signed in as ' + (user && user.email ? user.email : '')));

  const phone = createField({
    name: 'phone',
    label: 'Mobile number',
    type: 'tel',
    inputmode: 'tel',
    autocomplete: 'tel',
    required: true,
    value: user && user.phone ? user.phone : '',
  });
  inner.appendChild(phone.el);
  inner.appendChild(el('p', { class: 'mu' }, 'So your driver or provider can call you'));

  let companyNameField;
  let regNumberField;
  if (isCompany) {
    inner.appendChild(el('h3', {}, 'Company details'));
    companyNameField = createField({
      name: 'name',
      label: 'Company name',
      value: profile.organisation && profile.organisation.name ? profile.organisation.name : '',
    });
    inner.appendChild(companyNameField.el);
    regNumberField = createField({
      name: 'regNumber',
      label: 'Registration number',
      value: profile.organisation && profile.organisation.regNumber ? profile.organisation.regNumber : '',
    });
    inner.appendChild(regNumberField.el);
  }

  inner.appendChild(el('h3', {}, 'Your vehicle'));
  const vehicleDescription = createField({
    name: 'vehicleDescription',
    label: 'Vehicle (for example White Hilux bakkie)',
    value: profile.vehicleDescription || '',
  });
  inner.appendChild(vehicleDescription.el);

  const plate = createField({
    name: 'plate',
    label: 'Number plate',
    value: profile.plate || '',
  });
  inner.appendChild(plate.el);

  inner.appendChild(el('h3', {}, 'Where are you based?'));
  const locationField = el('div', { class: 'field', dataset: { field: 'baseLat' } });
  const useLocationBtn = el('button', { class: 'btn soft', type: 'button' }, 'Use my current location');
  const manualToggle = el('button', { class: 'link-btn', type: 'button' }, 'Enter coordinates manually');
  const manualFields = el('div', {});
  manualFields.style.display = 'none';

  const baseLatField = createField({
    name: 'baseLat',
    label: 'Latitude',
    inputmode: 'decimal',
    value: profile.baseLat !== null && profile.baseLat !== undefined ? String(profile.baseLat) : '',
  });
  const baseLngField = createField({
    name: 'baseLng',
    label: 'Longitude',
    inputmode: 'decimal',
    value: profile.baseLng !== null && profile.baseLng !== undefined ? String(profile.baseLng) : '',
  });

  manualFields.appendChild(baseLatField.el);
  manualFields.appendChild(baseLngField.el);
  locationField.appendChild(useLocationBtn);
  locationField.appendChild(manualToggle);
  locationField.appendChild(manualFields);
  inner.appendChild(locationField);

  let latFromLocation = null;
  let lngFromLocation = null;

  useLocationBtn.addEventListener('click', () => {
    if (!navigator.geolocation) {
      toast('Geolocation is not supported by your browser', 'error');
      manualToggle.click();
      return;
    }

    useLocationBtn.disabled = true;
    useLocationBtn.textContent = 'Getting location...';
    navigator.geolocation.getCurrentPosition(
      (position) => {
        latFromLocation = Number(position.coords.latitude);
        lngFromLocation = Number(position.coords.longitude);
        baseLatField.setValue(latFromLocation.toFixed(4));
        baseLngField.setValue(lngFromLocation.toFixed(4));
        useLocationBtn.textContent = 'Location set (' + latFromLocation.toFixed(4) + ', ' + lngFromLocation.toFixed(4) + ')';
        useLocationBtn.disabled = false;
      },
      (err) => {
        let message = 'Location is unavailable';
        if (err && err.code === 1) message = 'Location permission denied';
        else if (err && err.code === 2) message = 'Location is unavailable';
        else if (err && err.code === 3) message = 'Location request timed out';
        toast(message, 'error');
        useLocationBtn.disabled = false;
        useLocationBtn.textContent = 'Use my current location';
        manualFields.style.display = '';
        manualToggle.style.display = 'none';
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });

  manualToggle.addEventListener('click', () => {
    manualFields.style.display = manualFields.style.display === 'none' ? '' : 'none';
  });

  inner.appendChild(el('h3', {}, 'How far will you travel?'));
  const radiusField = el('div', { class: 'field', dataset: { field: 'serviceRadiusKm' } });
  const radiusSelect = el('select');
  [5, 10, 25, 50, 100].forEach((value) => {
    const option = el('option', { value: String(value) }, String(value) + ' km');
    if (Number(profile.serviceRadiusKm) === value || (!profile.serviceRadiusKm && value === 25)) {
      option.selected = true;
    }
    radiusSelect.appendChild(option);
  });
  radiusField.appendChild(radiusSelect);
  inner.appendChild(radiusField);

  inner.appendChild(el('h3', {}, 'Services you offer'));
  const servicesField = el('div', { class: 'field', dataset: { field: 'serviceIds' } });
  const servicesChips = el('div', { class: 'chips' });
  const selectedServiceIds = new Set(Array.isArray(profile.serviceIds) ? profile.serviceIds : []);
  const loadingLabel = el('div', {}, 'Loading services...');
  servicesField.appendChild(loadingLabel);

  function renderServices() {
    clear(servicesChips);
    const allServices = Array.isArray(thisServices) ? thisServices : [];
    allServices.forEach((service) => {
      const chip = el('button', { class: 'chip', type: 'button' }, serviceEmoji(service.service) + ' ' + service.name);
      if (selectedServiceIds.has(service.id)) {
        chip.classList.add('on');
        chip.setAttribute('aria-pressed', 'true');
      }
      chip.addEventListener('click', () => {
        if (selectedServiceIds.has(service.id)) {
          selectedServiceIds.delete(service.id);
          chip.classList.remove('on');
          chip.removeAttribute('aria-pressed');
        } else {
          selectedServiceIds.add(service.id);
          chip.classList.add('on');
          chip.setAttribute('aria-pressed', 'true');
        }
      });
      servicesChips.appendChild(chip);
    });
  }

  let thisServices = [];
  function loadServiceOptions() {
    servicesField.removeChild(loadingLabel);
    servicesField.appendChild(servicesChips);
    renderServices();
  }

  loadServices().then((services) => {
    thisServices = Array.isArray(services) ? services : [];
    loadServiceOptions();
  }).catch((err) => {
    servicesField.removeChild(loadingLabel);
    showError(err);
    const retry = el('button', { class: 'btn soft', type: 'button' }, 'Try again');
    retry.addEventListener('click', () => {
      servicesField.removeChild(retry);
      servicesField.appendChild(loadingLabel);
      loadServices().then((services) => {
        thisServices = Array.isArray(services) ? services : [];
        loadServiceOptions();
      }).catch((nextErr) => {
        servicesField.removeChild(loadingLabel);
        showError(nextErr);
        servicesField.appendChild(retry);
      });
    });
    servicesField.appendChild(retry);
  });
  inner.appendChild(servicesField);

  let consentChecked = !!profile.consentAt;
  const consentField = el('div', { class: 'check', dataset: { field: 'consent' } });
  if (!isEdit || !profile.consentAt) {
    const checkbox = el('input', { type: 'checkbox' });
    if (consentChecked) checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      consentChecked = checkbox.checked;
    });
    consentField.appendChild(checkbox);
    const label = el('label', {}, 'I agree to the Terms and Privacy Policy');
    label.addEventListener('click', () => {
      checkbox.checked = !checkbox.checked;
      consentChecked = checkbox.checked;
    });
    consentField.appendChild(label);
    inner.appendChild(consentField);
  }

  const saveButton = el('button', { class: 'btn', type: 'button' }, 'Save and continue');
  inner.appendChild(saveButton);

  async function handleSubmit() {
    clearFieldErrors();
    if (!photo.validate()) {
      return;
    }

    const firstNameValue = firstName.getValue();
    const lastNameValue = lastName.getValue();
    const phoneValue = validatePhone(phone.getValue());
    const vehicleValue = vehicleDescription.getValue();
    const plateValue = plate.getValue();
    const rawLat = baseLatField.getValue();
    const rawLng = baseLngField.getValue();
    const parsedLat = Number(rawLat || latFromLocation);
    const parsedLng = Number(rawLng || lngFromLocation);
    const radiusKm = Number(radiusSelect.value);

    if (!firstNameValue) {
      firstName.setError('First name is required');
      return;
    }
    if (!lastNameValue) {
      lastName.setError('Surname is required');
      return;
    }
    if (!phoneValue.startsWith('+27')) {
      phone.setError(phoneValue);
      return;
    }
    if (isCompany) {
      if (!companyNameField || !companyNameField.getValue()) {
        companyNameField.setError('Company name is required');
        return;
      }
      if (!regNumberField || !regNumberField.getValue()) {
        regNumberField.setError('Registration number is required');
        return;
      }
    }
    if (!vehicleValue) {
      vehicleDescription.setError('Vehicle description is required');
      return;
    }
    if (!plateValue) {
      plate.setError('Number plate is required');
      return;
    }
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      locationField.classList.add('has-error');
      let error = locationField.querySelector('.field-error');
      if (!error) {
        error = el('div', { class: 'field-error' });
        locationField.appendChild(error);
      }
      error.textContent = 'Set your base location';
      return;
    }
    if (selectedServiceIds.size === 0) {
      servicesField.classList.add('has-error');
      let error = servicesField.querySelector('.field-error');
      if (!error) {
        error = el('div', { class: 'field-error' });
        servicesField.appendChild(error);
      }
      error.textContent = 'Choose at least one service';
      return;
    }
    if (!consentChecked) {
      consentField.classList.add('has-error');
      let error = consentField.querySelector('.field-error');
      if (!error) {
        error = el('div', { class: 'field-error' });
        consentField.appendChild(error);
      }
      error.textContent = 'You must agree to the Terms and Privacy Policy';
      return;
    }

    try {
      await withSpinner(async () => {
        await apiFetch('/providers/me', {
          method: 'PUT',
          body: {
            providerType,
            firstName: firstNameValue,
            lastName: lastNameValue,
            phone: phoneValue,
            vehicleDescription: vehicleValue,
            plate: plateValue,
            baseLat: parsedLat,
            baseLng: parsedLng,
            serviceRadiusKm: radiusKm,
            consent: true,
          },
        });

        if (isCompany && companyNameField && regNumberField) {
          await apiFetch('/providers/me/organisation', {
            method: 'PUT',
            body: {
              name: companyNameField.getValue(),
              regNumber: regNumberField.getValue(),
            },
          });
        }

        await apiFetch('/providers/me/services', {
          method: 'PUT',
          body: { serviceIds: Array.from(selectedServiceIds) },
        });

        const file = photo.getFile();
        if (file) {
          const data = new FormData();
          data.append('photo', file);
          await apiFetch('/users/me/photo', { method: 'POST', body: data });
        }

        await refreshMe();
      });

      ctx.navigate(isEdit ? '/menu' : onboardingRoute(getSession()), { replace: true });
    } catch (err) {
      if (err.code === 'ZD-VAL-001' && err.field === 'phone') {
        phone.setError(err.message);
      } else {
        showError(err);
      }
    }
  }

  saveButton.addEventListener('click', handleSubmit);
  center.appendChild(inner);
  screen.appendChild(center);
  return screen;
}
