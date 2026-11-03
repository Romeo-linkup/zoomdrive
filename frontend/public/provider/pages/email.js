import { renderEmailPage } from '../../shared/authFlow.js';
import { renderPageError } from '../../shared/errors.js';
import { el } from '../../shared/ui.js';

export default function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    return renderEmailPage(ctx);
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}