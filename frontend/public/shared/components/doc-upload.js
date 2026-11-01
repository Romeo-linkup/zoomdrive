// shared/components/doc-upload.js
import { el, toast } from '../ui.js';

export function createDocUpload({ docType, label, onSelect }) {
  const fileInput = el('input', { type: 'file', attrs: { accept: 'image/jpeg,image/png,image/webp,application/pdf' } });
  fileInput.style.display = 'none';

  const docBtn = el('button', { class: 'doc', type: 'button' });
  const labelSpan = el('span', {}, String(label));
  const statusI = el('i', {}, 'Upload');
  docBtn.appendChild(labelSpan);
  docBtn.appendChild(statusI);

  docBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast('File must be 5 MB or smaller', 'error');
      fileInput.value = '';
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      toast('Invalid file type', 'error');
      fileInput.value = '';
      return;
    }

    fileInput.value = '';

    if (onSelect) {
      try { onSelect(file); } catch (e) { try { console.debug(e); } catch (e2) {} }
    }
  });

  return {
    el: docBtn,
    setState({ status, note }) {
      docBtn.classList.remove('on', 'bad');
      if (status === 'none') {
        statusI.textContent = 'Upload';
      } else if (status === 'uploading') {
        statusI.textContent = 'Uploading...';
      } else if (status === 'pending') {
        docBtn.classList.add('on');
        statusI.textContent = 'Uploaded ✓ (in review)';
      } else if (status === 'approved') {
        docBtn.classList.add('on');
        statusI.textContent = 'Approved ✓';
      } else if (status === 'rejected') {
        docBtn.classList.add('bad');
        statusI.textContent = 'Rejected: upload again';
        let small = docBtn.querySelector('small');
        if (!small) {
          small = el('small', {});
          docBtn.appendChild(small);
        }
        small.textContent = note || '';
      }
    },
  };
}
