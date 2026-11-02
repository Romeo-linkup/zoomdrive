import { el } from '../../shared/ui.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { createPageError } from './pageError.js';

export default async function render(ctx) {
  try {
    const screen = el('div', { class: 'screen' });
    screen.appendChild(createTopbar({ title: 'Inbox' }));
    screen.appendChild(el('div', { class: 'empty' }, 'No messages yet'));
    // Phase 12 (P12.2): load GET /notifications
    return screen;
  } catch (err) {
    return createPageError(err, () => ctx.navigate(ctx.path));
  }
}