import { el } from '../../shared/ui.js';
import { SUPPORT_EMAIL } from '../../shared/config.js';
import { createTopbar } from '../../shared/components/topbar.js';

const FAQ_ITEMS = [
  ['How does pricing work, and why is it fixed?', 'You see the service price and distance fee before confirming. The total is fixed once your request is created.'],
  ['What if nobody is nearby?', 'We keep looking and our team may be able to help arrange a provider.'],
  ['How do I cancel?', 'Use Cancel request on the Searching or Track screen.'],
  ['How do I verify the provider?', 'Before opening the door, check the provider name, photo and plate shown in the app.'],
  ['How do I report a problem?', 'Contact support using the email link below and include your request details.'],
];

export default function render(ctx) {
  const screen = el('div', { class: 'screen' });
  screen.appendChild(createTopbar({ title: 'Support', onBack: () => ctx.navigate('/account') }));
  screen.appendChild(el('h1', {}, 'Frequently asked questions'));
  FAQ_ITEMS.forEach(([question, answer]) => {
    const item = el('details', { class: 'faq-item' });
    item.appendChild(el('summary', {}, question));
    item.appendChild(el('p', {}, answer));
    screen.appendChild(item);
  });
  const contact = el('a', {
    class: 'item contact-support',
    href: 'mailto:' + SUPPORT_EMAIL,
    attrs: { 'aria-label': 'Contact support at ' + SUPPORT_EMAIL },
  });
  contact.appendChild(el('div', { class: 'ic' }, '✉️'));
  contact.appendChild(el('div', { class: 't' }, 'Contact support'));
  contact.appendChild(el('span', { class: 'r' }, SUPPORT_EMAIL));
  screen.appendChild(contact);
  return screen;
}