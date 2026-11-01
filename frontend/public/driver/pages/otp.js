// driver/pages/otp.js
import { renderOtpPage } from '../../shared/authFlow.js';
import { consumeNext } from '../../shared/router.js';

function afterLogin(data, ctx) {
  if (data.isNewUser || !data.profileComplete) {
    let target = '/profile-setup';
    if (ctx.query.next) {
      const validated = consumeNext('/home');
      if (validated !== '/home') {
        target += '?next=' + encodeURIComponent(ctx.query.next);
      }
    }
    return target;
  }
  return consumeNext('/home');
}

export default (ctx) => renderOtpPage(ctx, { afterLogin });
