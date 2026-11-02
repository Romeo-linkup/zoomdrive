// admin/pages/providerDetail.js
import { el, clear } from '../../shared/ui.js';
import { apiFetch } from '../../shared/api.js';
import { formatPhone, formatDate } from '../../shared/ui.js';
import { showError, clearError, clearFieldErrors } from '../../shared/errors.js';
import { toast, modal, withSpinner } from '../../shared/ui.js';
import { createStatusBadge } from '../../shared/components/status-badge.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  const userId = ctx.params.userId;
  
  const backLink = el('a', { href: '#/providers', class: 'link-btn' }, '← Providers');
  screen.appendChild(backLink);
  
  const detailHead = el('div', { class: 'detail-head' });
  screen.appendChild(detailHead);
  
  const cols = el('div', { class: 'cols' });
  screen.appendChild(cols);
  
  const docsTitle = el('h2', {}, 'Documents');
  screen.appendChild(docsTitle);
  
  const docsGrid = el('div', { class: 'docs-grid' });
  screen.appendChild(docsGrid);
  
  const reloadBtn = el('button', { class: 'link-btn', type: 'button' }, 'Links expire after 5 minutes: Reload');
  screen.appendChild(reloadBtn);
  
  const actionBar = el('div', { class: 'action-bar' });
  screen.appendChild(actionBar);
  
  async function load() {
    clearError();
    try {
      const data = await apiFetch('/admin/providers/' + userId);
      render(data);
    } catch (err) {
      showError(err);
      render(null);
    }
  }
  
  function render(data) {
    clear(detailHead);
    clear(cols);
    clear(docsGrid);
    clear(actionBar);
    
    if (!data) {
      return;
    }
    
    const { user, status, organisation, services, documents, requiredDocs, canApprove } = data;
    const profile = data.profile || {};
    
    const av = el('div', { class: 'av' }, user.firstName ? user.firstName.charAt(0).toUpperCase() : '?');
    if (user.photoUrl) {
      av.style.backgroundImage = 'url(' + user.photoUrl + ')';
      av.textContent = '';
    }
    detailHead.appendChild(av);
    
    const info = el('div');
    info.appendChild(el('h2', {}, (user.firstName || '') + ' ' + (user.lastName || '')));
    info.appendChild(el('div', {}, formatPhone(user.phone)));
    info.appendChild(createStatusBadge(status));
    info.appendChild(el('div', { class: 'mu' }, 'Submitted ' + formatDate(profile.submittedAt, 'datetime')));
    detailHead.appendChild(info);
    
    const profileCard = el('div', { class: 'card' });
    profileCard.appendChild(el('h3', {}, 'Profile'));
    
    const kv = el('dl', { class: 'kv' });
    
    kv.appendChild(el('dt', {}, 'Type'));
    kv.appendChild(el('dd', {}, profile.providerType === 'company' ? 'Company' : 'Individual'));
    
    if (profile.providerType === 'company') {
      kv.appendChild(el('dt', {}, 'Company name'));
      kv.appendChild(el('dd', {}, organisation ? organisation.name || '' : ''));
      
      kv.appendChild(el('dt', {}, 'Registration number'));
      kv.appendChild(el('dd', {}, organisation ? organisation.regNumber || '' : ''));
    }
    
    kv.appendChild(el('dt', {}, 'Vehicle'));
    kv.appendChild(el('dd', {}, profile.vehicleDescription || ''));
    
    kv.appendChild(el('dt', {}, 'Number plate'));
    kv.appendChild(el('dd', {}, profile.plate || ''));
    
    if (profile.baseLat !== null && profile.baseLat !== undefined &&
        profile.baseLng !== null && profile.baseLng !== undefined) {
      kv.appendChild(el('dt', {}, 'Base location'));
      const mapUrl = 'https://www.openstreetmap.org/?mlat=' + profile.baseLat + '&mlon=' + profile.baseLng + '#map=14/' + profile.baseLat + '/' + profile.baseLng;
      const mapLink = el('a', { href: mapUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Open map');
      kv.appendChild(el('dd', {}, mapLink));
    }
    
    kv.appendChild(el('dt', {}, 'Service radius'));
    kv.appendChild(el('dd', {}, (profile.serviceRadiusKm || 0) + ' km'));
    
    kv.appendChild(el('dt', {}, 'Services'));
    const serviceNames = services.map(s => s.name).join(', ');
    kv.appendChild(el('dd', {}, serviceNames || 'None'));
    
    kv.appendChild(el('dt', {}, 'Consent given'));
    kv.appendChild(el('dd', {}, profile.consentAt ? formatDate(profile.consentAt, 'date') : 'No'));
    
    kv.appendChild(el('dt', {}, 'Joined'));
    kv.appendChild(el('dd', {}, formatDate(user.createdAt, 'date')));
    
    profileCard.appendChild(kv);
    
    if (status === 'rejected' && profile.rejectionReason) {
      const banner = el('div', { class: 'banner bad' }, profile.rejectionReason);
      profileCard.appendChild(banner);
    }
    
    cols.appendChild(profileCard);
    
    if (status === 'approved') {
      const banner = el('div', { class: 'banner' }, 'Approved ' + formatDate(profile.approvedAt, 'date'));
      cols.appendChild(banner);
    } else if (status === 'incomplete') {
      const banner = el('div', { class: 'banner warn' }, 'This provider has not submitted for review yet');
      cols.appendChild(banner);
    } else if (status === 'none') {
      const banner = el('div', { class: 'banner' }, 'No profile yet');
      cols.appendChild(banner);
    }
    
    for (const doc of documents) {
      const card = el('div', { class: 'doc-card' });
      
      card.appendChild(el('h4', {}, doc.label));
      card.appendChild(createStatusBadge(doc.status));
      card.appendChild(el('div', { class: 'mu' }, 'Uploaded ' + formatDate(doc.uploadedAt, 'date')));
      
      if (doc.isPdf) {
        const pdfBlock = el('div', { class: 'pdf' });
        const pdfLink = el('a', { href: doc.viewUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Open PDF');
        pdfBlock.appendChild(pdfLink);
        card.appendChild(pdfBlock);
      } else {
        const img = el('img', { src: doc.viewUrl, alt: doc.label });
        card.appendChild(img);
      }
      
      if (doc.status === 'rejected' && doc.note) {
        const note = el('div', { class: 'note' }, doc.note);
        card.appendChild(note);
      }
      
      const actions = el('div', { class: 'actions' });
      
      if (doc.status !== 'approved') {
        const approveBtn = el('button', { class: 'btn', type: 'button' }, 'Approve');
        approveBtn.addEventListener('click', async () => {
          await withSpinner(reviewDocument(doc.id, 'approved', null));
        });
        actions.appendChild(approveBtn);
      }
      
      if (doc.status !== 'rejected') {
        const rejectBtn = el('button', { class: 'btn red', type: 'button' }, 'Reject');
        rejectBtn.addEventListener('click', async () => {
          const rejectionInput = el('textarea', { placeholder: 'Tell the provider what to fix (for example: the photo is blurry)' });
          const result = await modal({
            title: 'Reject ' + doc.label,
            body: rejectionInput,
            actions: [
              { label: 'Cancel', kind: 'soft', value: false },
              { label: 'Reject', kind: 'red', value: true },
            ],
          });
          if (result) {
            const note = rejectionInput.value.trim();
            if (note.length < 3) {
              toast('Please provide a reason (at least 3 characters)', 'error');
              return;
            }
            await withSpinner(reviewDocument(doc.id, 'rejected', note));
          }
        });
        actions.appendChild(rejectBtn);
      }
      
      card.appendChild(actions);
      docsGrid.appendChild(card);
    }
    
    const missingDocs = requiredDocs.filter(req => !documents.find(d => d.docType === req));
    if (missingDocs.length > 0) {
      const missingBanner = el('div', { class: 'banner warn' }, 'Still missing: ' + missingDocs.join(', '));
      docsGrid.appendChild(missingBanner);
    }
    
    if (status === 'pending') {
      const approveProviderBtn = el('button', { class: 'btn', type: 'button' }, 'Approve provider');
      approveProviderBtn.disabled = !canApprove;
      if (!canApprove) {
        const hint = el('div', { class: 'mu' }, 'Approve every required document first');
        const wrapper = el('div');
        wrapper.appendChild(approveProviderBtn);
        wrapper.appendChild(hint);
        actionBar.appendChild(wrapper);
      } else {
        actionBar.appendChild(approveProviderBtn);
      }
      
      approveProviderBtn.addEventListener('click', async () => {
        await withSpinner(approveProvider());
      });
      
      const rejectProviderBtn = el('button', { class: 'btn red', type: 'button' }, 'Reject provider');
      rejectProviderBtn.addEventListener('click', async () => {
        const rejectionInput = el('textarea', { placeholder: 'Tell the provider why (for example: documents are invalid)' });
        const result = await modal({
          title: 'Reject provider',
          body: rejectionInput,
          actions: [
            { label: 'Cancel', kind: 'soft', value: false },
            { label: 'Reject', kind: 'red', value: true },
          ],
        });
        if (result) {
          const reason = rejectionInput.value.trim();
          if (reason.length < 3) {
            toast('Please provide a reason (at least 3 characters)', 'error');
            return;
          }
          await withSpinner(rejectProvider(reason));
        }
      });
      actionBar.appendChild(rejectProviderBtn);
    }
  }
  
  async function reviewDocument(docId, docStatus, note) {
    clearError();
    clearFieldErrors(screen);
    try {
      const data = await apiFetch('/admin/documents/' + docId + '/review', {
        method: 'POST',
        body: { status: docStatus, note },
      });
      toast('Document ' + (docStatus === 'approved' ? 'approved' : 'rejected'), 'ok');
      render(data);
    } catch (err) {
      await load();
      showError(err);
    }
  }
  
  async function approveProvider() {
    clearError();
    clearFieldErrors(screen);
    try {
      const data = await apiFetch('/admin/providers/' + userId + '/approve', {
        method: 'POST',
      });
      toast('Provider approved', 'ok');
      render(data);
    } catch (err) {
      await load();
      showError(err);
    }
  }
  
  async function rejectProvider(reason) {
    clearError();
    clearFieldErrors(screen);
    try {
      const data = await apiFetch('/admin/providers/' + userId + '/reject', {
        method: 'POST',
        body: { reason },
      });
      toast('Provider rejected', 'ok');
      render(data);
    } catch (err) {
      await load();
      showError(err);
    }
  }
  
  reloadBtn.addEventListener('click', load);
  
  ctx.onLeave(() => {
    // no cleanup needed
  });
  
  await load();
  
  return screen;
}
