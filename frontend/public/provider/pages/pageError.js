import { el } from '../../shared/ui.js';
import { renderPageError } from '../../shared/errors.js';

export function createPageError(err, retry) {
  const screen = el('div', { class: 'screen' });
  renderPageError(screen, err, retry);
  return screen;
}
