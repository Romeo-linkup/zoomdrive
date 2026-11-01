// shared/components/photo-upload.js
import { el, toast } from '../ui.js';

export function createPhotoUpload({ required = false, initialUrl = null, label = 'Add profile photo', onChange }) {
  let currentUrl = initialUrl;
  let currentFile = null;
  let currentObjectUrl = null;

  const fileInput = el('input', { type: 'file', attrs: { accept: 'image/jpeg,image/png,image/webp' } });
  fileInput.style.display = 'none';

  const photoBtn = el('div', { class: 'ph' }, '📷');
  if (currentUrl) {
    photoBtn.style.backgroundImage = 'url("' + currentUrl + '")';
    photoBtn.classList.add('has');
  }

  photoBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.type !== 'image/jpeg' && file.type !== 'image/png' && file.type !== 'image/webp') {
      toast('Use a JPG, PNG or WebP photo', 'error');
      fileInput.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast('Photo must be 5 MB or smaller', 'error');
      fileInput.value = '';
      return;
    }

    if (currentObjectUrl) {
      try { URL.revokeObjectURL(currentObjectUrl); } catch (e) {}
    }

    currentFile = file;
    currentObjectUrl = URL.createObjectURL(file);
    currentUrl = currentObjectUrl;
    photoBtn.style.backgroundImage = 'url("' + currentUrl + '")';
    photoBtn.classList.add('has');
    photoBtn.classList.remove('bad');
    fileInput.value = '';

    if (onChange) {
      try { onChange(file); } catch (e) { try { console.debug(e); } catch (e2) {} }
    }
  });

  const wrapper = el('div', {});
  wrapper.appendChild(photoBtn);
  wrapper.appendChild(fileInput);

  return {
    el: wrapper,
    getFile() {
      return currentFile;
    },
    validate() {
      if (required && !currentFile && !currentUrl) {
        photoBtn.classList.add('bad');
        const err = el('div', { class: 'field-error' }, 'A profile photo is required');
        wrapper.appendChild(err);
        return false;
      }
      return true;
    },
    setUrl(url) {
      if (currentObjectUrl) {
        try { URL.revokeObjectURL(currentObjectUrl); } catch (e) {}
        currentObjectUrl = null;
      }
      currentUrl = url;
      currentFile = null;
      if (url) {
        photoBtn.style.backgroundImage = 'url("' + url + '")';
        photoBtn.classList.add('has');
        photoBtn.classList.remove('bad');
      } else {
        photoBtn.style.backgroundImage = '';
        photoBtn.classList.remove('has');
        photoBtn.classList.remove('bad');
      }
    },
    setError(message) {
      photoBtn.classList.add('bad');
      let err = wrapper.querySelector('.field-error');
      if (!err) {
        err = el('div', { class: 'field-error' });
        wrapper.appendChild(err);
      }
      err.textContent = message || '';
    },
  };
}
