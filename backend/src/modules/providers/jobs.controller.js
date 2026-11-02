const requests = require('../requests/requests.service');

async function online(req, res) {
  const result = await requests.setOnline({
    providerId: req.user.id,
    online: req.body.online,
    lat: req.body.lat,
    lng: req.body.lng,
    requestIdHeader: req.id,
    ip: req.ip,
  });
  res.ok(result);
}

async function heartbeat(req, res) {
  const result = await requests.heartbeat({
    providerId: req.user.id,
    lat: req.body.lat,
    lng: req.body.lng,
  });
  res.ok(result);
}

async function offers(req, res) {
  res.ok({ offers: await requests.listProviderOffers(req.user.id) });
}

async function jobs(req, res) {
  res.ok(await requests.listProviderJobs(req.user.id));
}

module.exports = { online, heartbeat, offers, jobs };