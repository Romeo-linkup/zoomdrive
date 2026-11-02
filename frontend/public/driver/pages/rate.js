import { apiFetch } from '../../shared/api.js';
import { showError } from '../../shared/errors.js';
import { el, formatZAR, toast } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';

// Phase 12 (P12.1): wire this submit to POST /requests/:id/rate
export default function render(ctx) {
  let active = true;
  let selectedStars = 0;
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Rate your experience', onBack: () => ctx.navigate('/home') }));
  const summary = el('div', { class: 'card' }, el('p', {}, 'Loading request details…'));
  screen.appendChild(summary);
  screen.appendChild(el('h2', {}, 'How was your experience?'));

  const stars = el('div', { class: 'rating-stars', attrs: { role: 'group', 'aria-label': 'Your rating' } });
  const starButtons = [];
  for (let rating = 1; rating <= 5; rating += 1) {
    const star = el('button', {
      class: 'rating-star',
      type: 'button',
      attrs: { 'aria-label': rating + (rating === 1 ? ' star' : ' stars'), 'aria-pressed': 'false' },
    }, '★');
    star.addEventListener('click', () => {
      selectedStars = rating;
      starButtons.forEach((button, index) => {
        const selected = index < selectedStars;
        button.classList.toggle('selected', selected);
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
      });
      submit.disabled = selectedStars === 0;
    });
    starButtons.push(star);
    stars.appendChild(star);
  }
  screen.appendChild(stars);
  const comment = el('textarea', {
    rows: 4,
    maxLength: 300,
    attrs: { maxlength: '300', placeholder: 'Add a comment (optional)' },
  });
  screen.appendChild(el('div', { class: 'field' }, el('label', {}, 'Comment (optional)'), comment));
  const submit = el('button', { class: 'btn', type: 'button' }, 'Submit');
  submit.disabled = true;
  screen.appendChild(submit);
  const skip = el('button', { class: 'link-btn', type: 'button' }, 'Skip');
  screen.appendChild(skip);

  async function loadSummary() {
    try {
      const data = await apiFetch('/requests/' + encodeURIComponent(ctx.params.id), { signal: ctx.signal });
      if (!active) return;
      const request = data.request;
      summary.textContent = '';
      summary.appendChild(el('strong', {}, request.service && request.service.name ? request.service.name : 'Roadside assistance'));
      summary.appendChild(el('p', {}, request.provider && request.provider.firstName
        ? 'Helped by ' + request.provider.firstName
        : 'Thank you for using ZoomDrive'));
      summary.appendChild(el('div', { class: 'line tot' },
        el('span', {}, 'Total'),
        el('b', {}, formatZAR(request.price && request.price.totalCents))
      ));
    } catch (err) {
      if (active && !ctx.signal.aborted) {
        summary.textContent = 'Request details could not be loaded.';
        showError(err);
      }
    }
  }

  submit.addEventListener('click', () => {
    if (!selectedStars || !active) return;
    toast('Thanks for your feedback', 'ok');
    ctx.navigate('/home');
  });
  skip.addEventListener('click', () => ctx.navigate('/home'));
  ctx.onLeave(() => {
    active = false;
  });
  loadSummary();
  return screen;
}