import { el } from '../ui.js';

function normalizeValue(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5 ? number : 0;
}

export function createRatingStars({ value = 0, onChange, readOnly = false } = {}) {
  let currentValue = normalizeValue(value);
  const buttons = [];
  const group = el('div', {
    class: 'rating-stars',
    attrs: { role: 'group', 'aria-label': 'Your rating' },
  });

  function updateButtons() {
    buttons.forEach((button, index) => {
      const selected = index < currentValue;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  for (let rating = 1; rating <= 5; rating += 1) {
    const button = el('button', {
      class: 'rating-star',
      type: 'button',
      attrs: {
        'aria-label': rating + ' stars',
        'aria-pressed': 'false',
      },
    });
    button.textContent = '★';
    button.disabled = readOnly;
    button.addEventListener('click', () => {
      if (readOnly) return;
      currentValue = rating;
      updateButtons();
      if (typeof onChange === 'function') onChange(currentValue);
    });
    buttons.push(button);
    group.appendChild(button);
  }

  updateButtons();

  return {
    el: group,
    getValue() {
      return currentValue;
    },
    setValue(nextValue) {
      currentValue = normalizeValue(nextValue);
      updateButtons();
    },
  };
}