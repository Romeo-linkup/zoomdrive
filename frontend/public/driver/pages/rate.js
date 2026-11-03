import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError } from '../../shared/errors.js';
import { el, formatZAR, toast } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { createRatingStars } from '../../shared/components/rating-stars.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    await renderRate(ctx, screen);
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderRate(ctx, screen) {
  let active = true;
  const listeners = new AbortController();
  screen.appendChild(createTopbar({ title: 'Rate your experience', onBack: () => ctx.navigate('/home') }));
  const summary = el('div', { class: 'card' }, el('p', {}, 'Loading request details…'));
  screen.appendChild(summary);
  const form = el('div');
  screen.appendChild(form);
  const skip = el('a', { class: 'link-btn', href: '#/home' }, 'Skip');
  screen.appendChild(skip);

  function updateCommentCounter(counter, comment) {
    counter.textContent = comment.value.length + '/300';
  }

  function showRatingForm(request, rating, readOnly) {
    form.textContent = '';
    form.appendChild(el('h2', {}, 'How was your experience?'));
    const starsField = el('div', { class: 'field', dataset: { field: 'stars' } });
    starsField.appendChild(el('label', {}, 'Your rating'));
    let stars;

    function clearStarsError() {
      starsField.classList.remove('has-error');
      const error = starsField.querySelector('.field-error');
      if (error) error.remove();
    }

    function showStarsError() {
      starsField.classList.add('has-error');
      let error = starsField.querySelector('.field-error');
      if (!error) {
        error = el('div', { class: 'field-error', attrs: { role: 'alert' } });
        starsField.appendChild(error);
      }
      error.textContent = 'Choose 1 to 5 stars';
    }

    stars = createRatingStars({
      value: rating && rating.stars,
      readOnly,
      onChange: clearStarsError,
    });
    starsField.appendChild(stars.el);
    form.appendChild(starsField);

    const comment = el('textarea', {
      rows: 4,
      maxLength: 300,
      value: rating && typeof rating.comment === 'string' ? rating.comment : '',
      attrs: { maxlength: '300', placeholder: 'Add a comment (optional)' },
    });
    comment.disabled = readOnly;
    const counter = el('small', { class: 'mu' });
    updateCommentCounter(counter, comment);
    const commentField = el('div', { class: 'field' },
      el('label', {}, 'Comment (optional)'),
      comment,
      counter
    );
    form.appendChild(commentField);
    comment.addEventListener('input', () => updateCommentCounter(counter, comment), { signal: listeners.signal });

    if (readOnly) {
      form.appendChild(el('p', { class: 'mu' }, "Ratings can't be changed after 24 hours."));
      return;
    }

    const submit = el('button', { class: 'btn', type: 'button' }, 'Submit rating');
    submit.addEventListener('click', async () => {
      const starsValue = stars.getValue();
      if (!starsValue) {
        showStarsError();
        return;
      }
      submit.disabled = true;
      const body = { stars: starsValue };
      if (comment.value.trim()) body.comment = comment.value.trim();
      try {
        await apiFetch('/requests/' + encodeURIComponent(ctx.params.id) + '/rate', {
          method: 'POST',
          body,
          signal: ctx.signal,
        });
        if (!active) return;
        toast('Thanks for your feedback', 'ok');
        ctx.navigate('/home');
      } catch (err) {
        if (!active || ctx.signal.aborted) return;
        if (err.code === 'ZD-RAT-002') {
          showRatingForm(request, { stars: starsValue, comment: comment.value, canEdit: false }, true);
        } else {
          submit.disabled = false;
          showError(err);
        }
      }
    }, { signal: listeners.signal });
    form.appendChild(submit);
  }

  ctx.onLeave(() => {
    active = false;
    listeners.abort();
  });

  const data = await apiFetch('/requests/' + encodeURIComponent(ctx.params.id), { signal: ctx.signal });
  if (!active) return;
  const request = data.request;
  if (!request) throw new Error('Request details are unavailable.');
  if (request.status !== 'completed') {
    ctx.navigate('/activity');
    return;
  }
  summary.textContent = '';
  summary.appendChild(el('strong', {}, request.service && request.service.name ? request.service.name : 'Roadside assistance'));
  const provider = request.provider;
  if (provider) {
    const providerRow = el('div', { class: 'pr' });
    const avatar = el('div', { class: 'av avatar-lg' });
    if (provider.photoUrl) {
      avatar.classList.add('has-photo');
      avatar.appendChild(el('img', {
        class: 'provider-photo',
        attrs: { src: provider.photoUrl, alt: provider.firstName || 'Provider' },
      }));
    } else {
      avatar.textContent = (provider.firstName || '?').charAt(0).toUpperCase();
    }
    providerRow.appendChild(avatar);
    providerRow.appendChild(el('strong', {}, provider.firstName || 'Your provider'));
    summary.appendChild(providerRow);
  }
  summary.appendChild(el('div', { class: 'line tot' },
    el('span', {}, 'Total'),
    el('b', {}, formatZAR(request.price && request.price.totalCents))
  ));
  const savedRating = request.myRating || null;
  showRatingForm(request, savedRating, Boolean(savedRating && savedRating.canEdit === false));
}