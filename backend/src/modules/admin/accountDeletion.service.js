const { pool, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const { logger } = require('../../lib/logger');
const { deleteDocumentAsset } = require('../uploads/cloudinary.service');
const ledger = require('../payments/ledger.service');

async function deleteAccount({ adminId, userId, reason }) {
  return await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock($1)', [userId]);

    const userResult = await client.query(
      'SELECT id, role, status FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (userResult.rows.length === 0) {
      throw new ApiError('ZD-ADM-003', { message: 'User not found' });
    }
    const user = userResult.rows[0];

    if (user.status === 'deleted') {
      throw new ApiError('ZD-ADM-010', { message: 'User is already deleted' });
    }

    const activeRequestResult = await client.query(
      `SELECT 1 FROM requests
       WHERE (driver_id = $1 OR provider_id = $1)
         AND status IN ('searching', 'accepted', 'arrived')
       LIMIT 1`,
      [userId]
    );
    if (activeRequestResult.rows.length > 0) {
      throw new ApiError('ZD-ADM-009');
    }

    if (user.role === 'provider') {
      const balance = await ledger.getBalance(userId, client);
      if (balance !== 0) {
        throw new ApiError('ZD-ADM-010', { message: 'Provider balance must be zero. Record a payout or adjustment first.' });
      }
    }

    await client.query(
      `UPDATE users
       SET first_name = 'Deleted',
           last_name = 'User',
           email = NULL,
           photo_url = NULL,
           phone = 'deleted-' || id,
           status = 'deleted',
           deleted_at = now(),
           suspended_reason = NULL
       WHERE id = $1`,
      [userId]
    );

    await client.query('DELETE FROM saved_places WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM provider_bank_details WHERE provider_user_id = $1', [userId]);
    await client.query('DELETE FROM provider_services WHERE provider_user_id = $1', [userId]);
    await client.query(
      `DELETE FROM request_offers
       WHERE provider_id = $1 AND status <> 'accepted'`,
      [userId]
    );

    await client.query(
      `UPDATE driver_profiles
       SET vehicle_make = NULL,
           vehicle_model = NULL,
           vehicle_colour = NULL,
           plate = NULL
       WHERE user_id = $1`,
      [userId]
    );

    await client.query(
      `UPDATE provider_profiles
       SET is_online = false,
           base_lat = NULL,
           base_lng = NULL,
           last_lat = NULL,
           last_lng = NULL,
           vehicle_description = NULL,
           plate = NULL
       WHERE user_id = $1`,
      [userId]
    );

    await client.query(
      `UPDATE ratings
       SET comment = NULL
       WHERE rater_id = $1 OR ratee_id = $1`,
      [userId]
    );

    await client.query(
      `UPDATE requests
       SET notes = NULL
       WHERE driver_id = $1 OR provider_id = $1`,
      [userId]
    );

    const docsResult = await client.query(
      `SELECT id, cloudinary_public_id FROM provider_documents WHERE provider_user_id = $1`,
      [userId]
    );
    const publicIds = docsResult.rows.map((r) => r.cloudinary_public_id).filter(Boolean);

    await client.query('DELETE FROM provider_documents WHERE provider_user_id = $1', [userId]);

    const orgResult = await client.query(
      `SELECT id FROM organisations WHERE owner_user_id = $1`,
      [userId]
    );
    if (orgResult.rows.length > 0) {
      await client.query(
        `UPDATE organisations
         SET name = 'Deleted organisation',
             reg_number = NULL
         WHERE id = $1`,
        [orgResult.rows[0].id]
      );
    }

    await writeAudit({
      actorType: 'admin',
      actorId: adminId,
      action: 'admin.account_delete',
      entity: 'users',
      entityId: userId,
      meta: { userId, reason },
    }, client);

    return { publicIds };
  });
}

async function cleanupDeletedAssets(publicIds) {
  let failedCount = 0;
  for (const pid of publicIds) {
    try {
      await deleteDocumentAsset(pid);
    } catch (err) {
      failedCount++;
    }
  }
  if (failedCount > 0) {
    logger.warn({
      reqId: '-',
      module: 'admin.accountDeletion',
      message: 'Failed to delete some Cloudinary assets',
      meta: { failedCount },
    });
  }
}

module.exports = { deleteAccount, cleanupDeletedAssets };
