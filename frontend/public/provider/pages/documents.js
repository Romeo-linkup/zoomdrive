// provider/pages/documents.js
import { getSession, refreshMe } from '../../shared/auth.js';
import { apiFetch } from '../../shared/api.js';
import { clear, el, toast, withSpinner } from '../../shared/ui.js';
import { showError } from '../../shared/errors.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { createDocUpload } from '../../shared/components/doc-upload.js';
import { DOC_LABELS, requiredDocs, profileGaps, missingDocs } from '../onboarding.js';

export default (ctx) => {
  const session = getSession();
  const profile = session && session.profile ? session.profile : {};
  const providerType = profile.providerType || 'individual';

  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({
    title: 'Your documents',
    onBack: () => ctx.navigate('/profile-setup'),
  }));

  screen.appendChild(el('h2', {}, 'Upload your documents'));
  screen.appendChild(el('p', { class: 'mu' }, 'JPG, PNG or PDF, up to 5 MB each. Only our verification team can see them.'));

  const rowRoot = el('div', {});
  screen.appendChild(rowRoot);

  let documents = Array.isArray(profile.documents) ? profile.documents.slice() : [];

  function renderRows() {
    clear(rowRoot);
    const required = requiredDocs(providerType);

    required.forEach((docType) => {
      const existing = documents.find((documentRow) => documentRow.docType === docType);
      const upload = createDocUpload({
        docType,
        label: DOC_LABELS[docType] || docType,
        onSelect: async (file) => {
          const backup = documents.slice();
          upload.setState({ status: 'uploading', note: null });
          try {
            const body = new FormData();
            body.append('doc_type', docType);
            body.append('file', file);
            const data = await apiFetch('/providers/me/documents', { method: 'POST', body });
            documents = Array.isArray(data.documents) ? data.documents : [];
            renderRows();
            updateChecklist();
          } catch (err) {
            documents = backup;
            const previousStatus = existing && existing.status ? existing.status : 'none';
            const previousNote = existing && existing.note ? existing.note : null;
            upload.setState({ status: previousStatus, note: previousNote });
            showError(err);
          }
        },
      });

      const status = existing && existing.status ? existing.status : 'none';
      upload.setState({ status, note: existing && existing.note ? existing.note : null });
      rowRoot.appendChild(upload.el);
    });
  }

  renderRows();

  const checklist = el('div', { class: 'card' });
  checklist.appendChild(el('h3', {}, 'To submit you still need:'));
  const checklistItems = el('div', {});
  checklist.appendChild(checklistItems);
  screen.appendChild(checklist);

  const submitButton = el('button', { class: 'btn', type: 'button' }, 'Submit for review');
  submitButton.disabled = true;
  screen.appendChild(submitButton);

  function updateChecklist() {
    const state = getSession();
    const gaps = profileGaps(state);
    const missing = missingDocs(state);
    const canSubmit = gaps.length === 0 && missing.length === 0;

    submitButton.disabled = !canSubmit;
    clear(checklistItems);

    if (gaps.length === 0 && missing.length === 0) {
      checklist.style.display = 'none';
      return;
    }

    checklist.style.display = '';
    gaps.forEach((gap) => {
      const item = el('div', { class: 'check' });
      item.appendChild(el('span', {}, String(gap)));
      const fix = el('button', { class: 'link-btn', type: 'button' }, 'Fix');
      fix.addEventListener('click', () => ctx.navigate('/profile-setup'));
      item.appendChild(fix);
      checklistItems.appendChild(item);
    });

    missing.forEach((label) => {
      const item = el('div', { class: 'check' });
      item.appendChild(el('span', {}, String(label)));
      checklistItems.appendChild(item);
    });
  }

  updateChecklist();

  submitButton.addEventListener('click', async () => {
    try {
      await withSpinner(async () => {
        await apiFetch('/providers/me/submit', { method: 'POST' });
        await refreshMe();
      });
      toast('Submitted for review', 'ok');
      ctx.navigate('/pending', { replace: true });
    } catch (err) {
      showError(err);
      if (err && err.code === 'ZD-PROV-001') {
        const fixProfile = el('button', { class: 'link-btn', type: 'button' }, 'Fix profile');
        fixProfile.addEventListener('click', () => ctx.navigate('/profile-setup'));
        checklist.appendChild(fixProfile);
      }
    }
  });

  return screen;
};
