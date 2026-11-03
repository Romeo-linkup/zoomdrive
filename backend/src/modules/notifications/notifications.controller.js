const notifications = require('./notifications.service');

async function list(req, res) {
  res.ok(await notifications.listNotifications({
    userId: req.user.id,
    page: req.validated.page,
    unreadOnly: req.validated.unreadOnly,
  }));
}

async function markRead(req, res) {
  res.ok(await notifications.markRead(req.user.id, Number(req.params.id), {
    requestId: req.id,
    ip: req.ip,
  }));
}

async function markAllRead(req, res) {
  res.ok(await notifications.markAllRead(req.user.id));
}

module.exports = { list, markRead, markAllRead };
