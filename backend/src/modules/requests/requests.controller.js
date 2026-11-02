const requests = require('./requests.service');

async function quote(req, res) {
  res.ok(await requests.quote(req.body));
}

async function create(req, res) {
  const result = await requests.createRequest({
    driverId: req.user.id,
    body: req.body,
    requestId: req.id,
    ip: req.ip,
  });
  res.ok(result, 201);
}

async function listMine(req, res) {
  res.ok(await requests.listDriverRequests({
    driverId: req.user.id,
    page: req.validated.page,
  }));
}

async function getOne(req, res) {
  const request = await requests.getRequestView({
    requestId: Number(req.params.id),
    user: req.user,
  });
  res.ok({ request });
}

async function cancel(req, res) {
  const result = await requests.cancelRequest({
    requestId: Number(req.params.id),
    actor: { role: req.user.role, id: req.user.id },
    reason: req.body.reason,
    requestIdHeader: req.id,
    ip: req.ip,
  });
  res.ok({ request: result.request });
}

async function accept(req, res) {
  const result = await requests.acceptRequest({
    providerId: req.user.id,
    requestId: Number(req.params.id),
    requestIdHeader: req.id,
    ip: req.ip,
  });
  res.ok({ request: result.request });
}

async function decline(req, res) {
  const result = await requests.declineRequest({
    providerId: req.user.id,
    requestId: Number(req.params.id),
    requestIdHeader: req.id,
    ip: req.ip,
  });
  res.ok({ declined: result.declined });
}

async function arrived(req, res) {
  const result = await requests.markArrived({
    providerId: req.user.id,
    requestId: Number(req.params.id),
    requestIdHeader: req.id,
    ip: req.ip,
  });
  res.ok({ request: result.request });
}

async function complete(req, res) {
  const result = await requests.completeRequest({
    providerId: req.user.id,
    requestId: Number(req.params.id),
    requestIdHeader: req.id,
    ip: req.ip,
  });
  res.ok({ request: result.request });
}

module.exports = { quote, create, listMine, getOne, cancel, accept, decline, arrived, complete };