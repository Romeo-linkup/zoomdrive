const plus = require('./plus.service');

async function getState(req, res) {
  res.ok(await plus.getPlusState(req.user.id));
}

async function join(req, res) {
  res.ok(await plus.join(req.user.id, { requestId: req.id, ip: req.ip }));
}

async function pay(req, res) {
  res.ok(await plus.startPay(req.user, { requestId: req.id, ip: req.ip }));
}

module.exports = { getState, join, pay };