import { el } from '../../shared/ui.js';
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP } from '../../shared/config.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { renderPageError } from '../../shared/errors.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    return await renderHelp(ctx, screen);
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

const FAQ_ITEMS = [
  ['How are jobs offered to me?',
   'When a driver requests help nearby, you receive a job offer with the service type, distance and earning. Accept within the countdown or the offer goes to the next provider.'],
  ['How do payouts work?',
   'Completed card payments and cash jobs are added to your balance. Use Payout methods to add your bank details, then request a payout from the Earnings screen.'],
  ['What is the commission?',
   'ZoomDrive takes a platform commission on each completed job. The earning shown on a job offer is what you receive before any commission is applied. Commission details are in Settings > Pricing (read-only).'],
  ['What if a driver cancels?',
   'If a driver cancels before you start, you are not charged and the job returns to the offer pool. If they cancel after you arrive, you may be eligible for a cancellation fee.'],
  ['How do I reach support?',
   'Use the email or WhatsApp buttons below. Include your phone number and, if relevant, the job or request id.'],
];

function contactButton(icon, label, href) {
  const button = el('a', { class: 'item contact-support', href, attrs: { 'aria-label': label } });
  button.appendChild(el('div', { class: 'ic' }, icon));
  button.appendChild(el('div', { class: 't' }, label));
  button.appendChild(el('span', { class: 'r' }, href));
  return button;
}

async function renderHelp(ctx, screen) {
  screen.appendChild(createTopbar({ title: 'Help', onBack: () => ctx.navigate('/menu') }));
  screen.appendChild(el('h1', {}, 'Frequently asked questions'));
  FAQ_ITEMS.forEach(([question, answer]) => {
    const item = el('details', { class: 'faq-item' });
    item.appendChild(el('summary', {}, question));
    item.appendChild(el('p', {}, answer));
    screen.appendChild(item);
  });

  const contact = el('div', { class: 'card' });
  contact.appendChild(el('h2', {}, 'Contact support'));
  contact.appendChild(contactButton('✉️', 'Email support', 'mailto:' + SUPPORT_EMAIL));
  contact.appendChild(contactButton('💬', 'WhatsApp support', 'https://wa.me/' + SUPPORT_WHATSAPP));
  screen.appendChild(contact);

  return screen;
}
