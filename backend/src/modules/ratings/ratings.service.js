const { pool, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const { notifyBestEffort } = require('../notifications/notifications.service');

async function rateRequest({ userId, requestId, stars, comment }) {
  const cleanComment = typeof comment === 'string' && comment.trim()
    ? comment.trim()
    : null;

  const result = await withTransaction(async (client) => {
    const requestResult = await client.query(
      'SELECT id, driver_id, provider_id, status FROM requests WHERE id = $1 FOR UPDATE',
      [requestId]
    );
    const request = requestResult.rows[0];
    if (!request) throw new ApiError('ZD-REQ-001');

    const isDriver = Number(request.driver_id) === Number(userId);
    const isProvider = Number(request.provider_id) === Number(userId);
    if (!isDriver && !isProvider) throw new ApiError('ZD-REQ-007');
    if (request.status !== 'completed') throw new ApiError('ZD-RAT-001');

    const raterRole = isDriver ? 'driver' : 'provider';
    const rateeId = isDriver ? request.provider_id : request.driver_id;
    const existingResult = await client.query(
      `SELECT id, (now() - created_at > interval '24 hours') AS locked
       FROM ratings
       WHERE request_id = $1 AND rater_id = $2
       FOR UPDATE`,
      [requestId, userId]
    );
    const existing = existingResult.rows[0];
    if (existing && existing.locked) throw new ApiError('ZD-RAT-002');

    let firstRating = false;
    if (existing) {
      await client.query(
        `UPDATE ratings
         SET stars = $1, comment = $2, updated_at = now()
         WHERE id = $3`,
        [stars, cleanComment, existing.id]
      );
    } else {
      firstRating = true;
      await client.query(
        `INSERT INTO ratings (request_id, rater_id, ratee_id, rater_role, stars, comment, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())`,
        [requestId, userId, rateeId, raterRole, stars, cleanComment]
      );
    }

    if (raterRole === 'driver') {
      const profileResult = await client.query(
        'SELECT user_id FROM provider_profiles WHERE user_id = $1 FOR UPDATE',
        [rateeId]
      );
      if (!profileResult.rows[0]) {
        throw new ApiError('ZD-SYS-001', { message: 'Provider profile not found while updating rating average' });
      }
      const averageResult = await client.query(
        `SELECT ROUND(AVG(stars)::numeric, 2) AS rating_avg, COUNT(*)::int AS rating_count
         FROM ratings
         WHERE ratee_id = $1 AND rater_role = 'driver'`,
        [rateeId]
      );
      const average = averageResult.rows[0];
      await client.query(
        `UPDATE provider_profiles
         SET rating_avg = $1, rating_count = $2
         WHERE user_id = $3`,
        [average.rating_avg, average.rating_count, rateeId]
      );
    }

    await writeAudit({
      actorType: 'user',
      actorId: userId,
      action: 'request.rated',
      entity: 'request',
      entityId: requestId,
      meta: { stars, raterRole },
    }, client);

    return {
      myRating: await getMyRating(requestId, userId, client),
      firstRating,
      rateeId,
    };
  });

  if (result.firstRating) {
    await notifyBestEffort({
      userId: result.rateeId,
      title: 'You received a new rating',
      kind: 'rating',
      data: { requestId },
    });
  }
  return { myRating: result.myRating };
}

async function getMyRating(requestId, userId, client = pool) {
  const result = await client.query(
    `SELECT stars, comment, (now() - created_at <= interval '24 hours') AS can_edit
     FROM ratings
     WHERE request_id = $1 AND rater_id = $2`,
    [requestId, userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    stars: Number(row.stars),
    comment: row.comment,
    canEdit: row.can_edit,
  };
}

async function getAverageFor(userId, raterRole, client = pool) {
  const result = await client.query(
    `SELECT ROUND(AVG(stars)::numeric, 1) AS avg, COUNT(*)::int AS count
     FROM ratings
     WHERE ratee_id = $1 AND rater_role = $2`,
    [userId, raterRole]
  );
  const row = result.rows[0];
  const count = Number(row.count);
  return {
    avg: row.avg === null ? null : Number(row.avg),
    count,
  };
}

module.exports = { rateRequest, getMyRating, getAverageFor };
