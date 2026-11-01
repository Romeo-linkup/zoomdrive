// shared/components/status-badge.js
import { el } from '../ui.js';

export function createStatusBadge(status) {
  const s = String(status).toLowerCase();
  let cls = 'badge';
  let text = status;

  if (s === 'approved' || s === 'verified') {
    cls = 'badge';
    text = 'Verified';
  } else if (s === 'pending') {
    cls = 'badge pending';
    text = 'In review';
  } else if (s === 'rejected') {
    cls = 'badge rejected';
    text = 'Rejected';
  } else if (s === 'online') {
    cls = 'badge';
    text = 'Online';
  } else if (s === 'offline') {
    cls = 'badge off';
    text = 'Offline';
  } else {
    cls = 'badge off';
    text = status;
  }

  return el('span', { class: cls }, text);
}
