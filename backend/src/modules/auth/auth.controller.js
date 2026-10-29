const { assertValidPhone } = require('../../lib/phone');
const { requestOtp } = require('./otp.service');
const { verifyLogin, getMe } = require('./auth.service');
const { writeAudit } = require('../../lib/audit');

async function requestOtpHandler(req, res) {
  const phone = assertValidPhone(req.body.phone);
  const result = await requestOtp({
    phone,
    app: req.body.app,
    ip: req.ip,
    requestId: req.id,
  });

  const response = { expiresInSeconds: result.expiresInSeconds };
  if (result.devCode !== undefined) {
    response.devCode = result.devCode;
  }

  res.ok(response);
}

async function verifyOtpHandler(req, res) {
  const phone = assertValidPhone(req.body.phone);
  const result = await verifyLogin({
    phone,
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
  writeAudit({
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
