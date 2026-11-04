// driver/pages/profileSetup.js
import { getSession, getUser, setSession } from '../../shared/auth.js';
import { apiFetch, ApiError } from '../../shared/api.js';
import { el, clear, toast, withSpinner, modal } from '../../shared/ui.js';
import { clearFieldErrors, showError, renderPageError } from '../../shared/errors.js';
import { createTopbar, createBrandBar } from '../../shared/components/topbar.js';
import { createField } from '../../shared/components/field.js';
import { createPhotoUpload } from '../../shared/components/photo-upload.js';
import { consumeNext } from '../../shared/router.js';
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

const draft = {
  firstName: '',
  lastName: '',
  phone: '',
  vehicleMake: '',
  vehicleModel: '',
  vehicleColour: '',
  plate: '',
  hailPlatform: null,
  consentChecked: false,
};

function renderProfileSetup(ctx, screen) {
  const session = getSession();
  const user = getUser();
  const profile = session && session.profile ? session.profile : {};
  const isEdit = !!((session && session.profileComplete) || ctx.query.edit === 'true');

  const center = el('div', { class: 'page-center' });
  const inner = el('div', { class: 'page-center__inner' });

  const title = isEdit ? 'Your profile' : 'Create your profile';
  if (isEdit) {
    inner.appendChild(createTopbar({
      title,
      onBack: () => ctx.navigate('/account'),
    }));
  } else {
    inner.appendChild(createBrandBar('driver'));
    inner.appendChild(el('h1', {}, title));
  }

  const photo = createPhotoUpload({
    required: false,
    initialUrl: user && user.photoUrl ? user.photoUrl : null,
  });
  inner.appendChild(photo.el);

  const firstName = createField({
    name: 'firstName',
    label: 'First name',
    value: draft.firstName || (user && user.firstName ? user.firstName : ''),
  });
  inner.appendChild(firstName.el);

  const lastName = createField({
    name: 'lastName',
    label: 'Surname',
    value: draft.lastName || (user && user.lastName ? user.lastName : ''),
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
    value: draft.phone || (user && user.phone ? user.phone : ''),
  });
  inner.appendChild(phone.el);
  inner.appendChild(el('p', { class: 'mu' }, 'So your driver or provider can call you'));

  inner.appendChild(el('h3', {}, 'Your vehicle (optional)'));

  const vehicleMake = createField({
    name: 'vehicleMake',
    label: 'Make',
    value: draft.vehicleMake || profile.vehicleMake || '',
  });
  inner.appendChild(vehicleMake.el);

  const vehicleModel = createField({
    name: 'vehicleModel',
    label: 'Model',
    value: draft.vehicleModel || profile.vehicleModel || '',
  });
  inner.appendChild(vehicleModel.el);

  const vehicleColour = createField({
    name: 'vehicleColour',
    label: 'Colour',
    value: draft.vehicleColour || profile.vehicleColour || '',
  });
  inner.appendChild(vehicleColour.el);

  const plate = createField({
    name: 'plate',
    label: 'Number plate',
    value: draft.plate || profile.plate || '',
  });
  inner.appendChild(plate.el);

  const platformField = el('div', { class: 'field', dataset: { field: 'hailPlatform' } });
  platformField.appendChild(el('label', {}, 'E-hailing platform'));
  const chips = el('div', { class: 'chips' });
  const platforms = [
    { value: 'uber', label: 'Uber' },
    { value: 'bolt', label: 'Bolt' },
    { value: 'indrive', label: 'inDrive' },
    { value: 'other', label: 'Other' },
  ];
  let selectedPlatform = (draft.hailPlatform ?? profile.hailPlatform) || null;

  platforms.forEach((p) => {
    const chip = el('button', { class: 'chip', type: 'button' }, p.label);
    if (selectedPlatform === p.value) {
      chip.classList.add('on');
      chip.setAttribute('aria-pressed', 'true');
    }
    chip.addEventListener('click', () => {
      if (selectedPlatform === p.value) {
        selectedPlatform = null;
        draft.hailPlatform = null;
        chip.classList.remove('on');
        chip.removeAttribute('aria-pressed');
      } else {
        selectedPlatform = p.value;
        draft.hailPlatform = p.value;
        chips.querySelectorAll('.chip').forEach(c => {
          c.classList.remove('on');
          c.removeAttribute('aria-pressed');
        });
        chip.classList.add('on');
        chip.setAttribute('aria-pressed', 'true');
      }
    });
    chips.appendChild(chip);
  });
  platformField.appendChild(chips);
  inner.appendChild(platformField);

  let consentChecked = (draft.consentChecked ?? !!profile.consentAt);
  const consentField = el('div', { class: 'check', dataset: { field: 'consent' } });
  if (!isEdit || !profile.consentAt) {
    const checkbox = el('input', { type: 'checkbox' });
    if (consentChecked) {
      checkbox.checked = true;
    }
    checkbox.addEventListener('change', () => {
      consentChecked = checkbox.checked;
      draft.consentChecked = checkbox.checked;
    });
    consentField.appendChild(checkbox);
    const label = el('label', {}, 'I agree to the Terms and Privacy Policy');
    label.addEventListener('click', () => {
      checkbox.checked = !checkbox.checked;
      consentChecked = checkbox.checked;
      draft.consentChecked = checkbox.checked;
    });
    consentField.appendChild(label);
    inner.appendChild(consentField);
  }

  const btn = el('button', { class: 'btn', type: 'button' }, isEdit ? 'Save changes' : 'Create profile');
  inner.appendChild(btn);

  firstName.input.addEventListener('change', () => { draft.firstName = firstName.getValue(); });
  lastName.input.addEventListener('change', () => { draft.lastName = lastName.getValue(); });
  phone.input.addEventListener('change', () => { draft.phone = phone.getValue(); });
  vehicleMake.input.addEventListener('change', () => { draft.vehicleMake = vehicleMake.getValue(); });
  vehicleModel.input.addEventListener('change', () => { draft.vehicleModel = vehicleModel.getValue(); });
  vehicleColour.input.addEventListener('change', () => { draft.vehicleColour = vehicleColour.getValue(); });
  plate.input.addEventListener('change', () => { draft.plate = plate.getValue(); });

  async function handleSubmit(event) {
    event.preventDefault();
    clearFieldErrors();
    const fn = firstName.getValue();
    const ln = lastName.getValue();
    const rawPhone = phone.getValue();
    const vm = vehicleMake.getValue();
    const vmd = vehicleModel.getValue();
    const vc = vehicleColour.getValue();
    const pl = plate.getValue();

    if (!fn) {
      firstName.setError('First name is required');
      return;
    }
    if (!ln) {
      lastName.setError('Surname is required');
      return;
    }
    const phoneValue = validatePhone(rawPhone);
    if (!phoneValue.startsWith('+27')) {
      phone.setError(phoneValue);
      return;
    }
    if (!consentChecked) {
      consentField.classList.add('has-error');
      const err = el('div', { class: 'field-error' }, 'You must agree to the terms');
      consentField.appendChild(err);
      return;
    }

    btn.disabled = true;
    try {
      await withSpinner(async () => {
        const body = {
          firstName: fn,
          lastName: ln,
          phone: phoneValue,
          vehicleMake: vm || null,
          vehicleModel: vmd || null,
          vehicleColour: vc || null,
          plate: pl || null,
          hailPlatform: selectedPlatform || null,
          consent: true,
        };
        const data = await apiFetch('/drivers/me', { method: 'PUT', body });

        const file = photo.getFile();
        if (file) {
          try {
            const fd = new FormData();
            fd.append('photo', file);
            await apiFetch('/users/me/photo', { method: 'POST', body: fd });
          } catch (photoErr) {
            toast('Profile saved, but the photo upload failed. You can add it later from your profile.', 'error');
          }
        }

        if (data && data.profileComplete === false) {
          const missing = (data.profile && data.profile.missing) || [];
          throw new ApiError({ code: 'ZD-PROF-001', message: 'Profile incomplete: ' + missing.join(', ') });
        }

        setSession({
          user: data.user || null,
          profile: data.profile || null,
          profileComplete: data.profileComplete || false,
          providerStatus: data.providerStatus || null,
        });
      });

      toast('Profile saved', 'ok');
      Object.keys(draft).forEach(k => { draft[k] = ''; });
      draft.hailPlatform = null;
      draft.consentChecked = false;
      const target = isEdit ? '/account' : consumeNext('/home');
      ctx.navigate(target, { replace: true });
    } catch (err) {
      if (err.code === 'ZD-VAL-001' && err.field === 'phone') {
        phone.setError(err.message);
      } else {
        showError(err);
      }
    } finally {
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', handleSubmit);

  const onSessionChange = () => {
    const s = getSession();
    if (!s) {
      Object.keys(draft).forEach(k => { draft[k] = ''; });
      draft.hailPlatform = null;
      draft.consentChecked = false;
    }
  };
  window.addEventListener('zd:session', onSessionChange);
  ctx.onLeave(() => {
    window.removeEventListener('zd:session', onSessionChange);
  });

  center.appendChild(inner);
  screen.appendChild(center);
  return screen;
}
