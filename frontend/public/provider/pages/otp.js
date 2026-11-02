import { renderOtpPage } from '../../shared/authFlow.js';
import { consumeNext } from '../../shared/router.js';

function afterLogin(data, ctx) {
  if (data.isNewUser || !data.profile) {
    return '/type' + (ctx.query.next ? '?next=' + encodeURIComponent(ctx.query.next) : '');
  }
  if (data.providerStatus === 'pending' || data.providerStatus === 'rejected') {
    return '/pending';
  }
  if (data.profile && data.profile.providerType) {
    return consumeNext('/documents');
  }
  return '/type';
}

export default (ctx) => renderOtpPage(ctx, { afterLogin });
