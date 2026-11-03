const { requestOtp } = require('./otp.service');
const { verifyLogin, getMe } = require('./auth.service');
const { writeAudit } = require('../../lib/audit');

async function requestOtpHandler(req, res) {
  const result = await requestOtp({
    email: req.body.email,
    app: req.body.app,
    ip: req.ip,
    requestId: req.id,
  });

  res.ok(result);
}

async function verifyOtpHandler(req, res) {
  const result = await verifyLogin({
    email: req.body.email,
    code: req.body.code,
    app: req.body.app,
    ip: req.ip,
    requestId: req.id,
  });

  res.ok({
    token: result.token,
    user: result.user,
    profile: result.profile,
    profileComplete: result.profileComplete,
    providerStatus: result.providerStatus,
    isNewUser: result.isNewUser,
  });
}

async function getMeHandler(req, res) {
  const result = await getMe(req.user.id);
  res.ok(result);
}

async function logoutHandler(req, res) {
  await writeAudit({
    actorType: 'user',
    actorId: req.user.id,
    action: 'auth.logout',
    entity: 'users',
    entityId: req.user.id,
    requestId: req.id,
    ip: req.ip,
  });

  res.ok({ loggedOut: true });
}

module.exports = {
  requestOtpHandler,
  verifyOtpHandler,
  getMeHandler,
  logoutHandler,
};
