const bcrypt = require('bcryptjs');
const { query } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const adminAuth = require('../../middleware/adminAuth');

const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

async function login(req, res) {
  const { email, password } = req.body;

  const { rows } = await query('SELECT id, email, name, password_hash FROM admin_users WHERE email = $1', [email]);
  const admin = rows[0];
  const hash = admin ? admin.password_hash : DUMMY_HASH;

  const match = await bcrypt.compare(password, hash);
  if (!match) {
    await writeAudit({
      actorType: 'system',
      action: 'admin.login_failed',
      meta: { email },
      requestId: req.id,
      ip: req.ip,
    });
    throw new ApiError('ZD-ADM-001', { message: 'Wrong email or password' });
  }

  await query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [admin.id]);

  await writeAudit({
    actorType: 'admin',
    actorId: admin.id,
    action: 'admin.login',
    requestId: req.id,
    ip: req.ip,
  });

  res.ok({
    token: adminAuth.signAdminToken(admin),
    admin: { id: admin.id, email: admin.email, name: admin.name },
  });
}

async function me(req, res) {
  res.ok({ admin: req.admin });
}

module.exports = { login, me };
