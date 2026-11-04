import { el, toast } from '../../shared/ui.js';
import { CONFIG } from '../../shared/config.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { renderPageError } from '../../shared/errors.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    return await renderReferrals(ctx, screen);
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderReferrals(ctx, screen) {
  screen.appendChild(createTopbar({ title: 'Referrals', onBack: () => ctx.navigate('/menu') }));
  screen.appendChild(el('h1', {}, 'Invite a provider'));

  const intro = el('div', { class: 'card' });
  intro.appendChild(el('p', {}, 'Share the ZoomDrive Partner app with other providers so they can receive jobs nearby.'));
  intro.appendChild(el('p', { class: 'mu' }, 'Rewards are not live yet and there is no tracking or bonus program at this time.'));
  screen.appendChild(intro);

  const appUrl = CONFIG.APPS.provider.path;

  const shareCard = el('div', { class: 'card' });
  shareCard.appendChild(el('h2', {}, 'Share'));
  const shareButton = el('button', { class: 'btn', type: 'button' }, 'Share app');
  shareButton.addEventListener('click', async () => {
    const shareData = {
      title: 'ZoomDrive Partner',
      text: 'Earn by helping drivers nearby. Join the ZoomDrive Partner app.',
      url: appUrl,
    };
    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // User cancelled or share failed; fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(appUrl);
      toast('App link copied to clipboard');
    } catch (err) {
      toast('Could not copy link', 'error');
    }
  });
  shareCard.appendChild(shareButton);
  screen.appendChild(shareCard);

  return screen;
}
