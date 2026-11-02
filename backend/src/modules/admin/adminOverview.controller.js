const { query } = require('../../db/pool');

async function getOverview(req, res) {
  const driversResult = await query('SELECT COUNT(*) FROM users WHERE role = $1', ['driver']);
  const drivers = Number(driversResult.rows[0].count);

  const providersResult = await query('SELECT COUNT(*) FROM users WHERE role = $1', ['provider']);
  const providers = Number(providersResult.rows[0].count);

  const pendingProvidersResult = await query(`
    SELECT COUNT(*) FROM provider_profiles
    WHERE submitted_at IS NOT NULL AND verification_status = 'pending'
  `);
  const pendingProviders = Number(pendingProvidersResult.rows[0].count);

  const approvedProvidersResult = await query("SELECT COUNT(*) FROM provider_profiles WHERE verification_status = 'approved'");
  const approvedProviders = Number(approvedProvidersResult.rows[0].count);

  const rejectedProvidersResult = await query("SELECT COUNT(*) FROM provider_profiles WHERE verification_status = 'rejected'");
  const rejectedProviders = Number(rejectedProvidersResult.rows[0].count);

  const incompleteProvidersResult = await query('SELECT COUNT(*) FROM provider_profiles WHERE submitted_at IS NULL');
  const incompleteProviders = Number(incompleteProvidersResult.rows[0].count);

  const activeRequestsResult = await query(`
    SELECT COUNT(*) FROM requests
    WHERE status IN ('searching', 'accepted', 'arrived')
  `);
  const activeRequests = Number(activeRequestsResult.rows[0].count);

  const midnightSast = new Date();
  midnightSast.setUTCHours(22, 0, 0, 0);
  if (midnightSast > new Date()) {
    midnightSast.setDate(midnightSast.getDate() - 1);
  }

  const jobsTodayResult = await query(`
    SELECT COUNT(*) FROM requests
    WHERE status = 'completed' AND completed_at >= $1
  `, [midnightSast]);
  const jobsToday = Number(jobsTodayResult.rows[0].count);

  const grossTodayResult = await query(`
    SELECT COALESCE(SUM(total_cents), 0) FROM requests
    WHERE status = 'completed' AND completed_at >= $1
  `, [midnightSast]);
  const grossTodayCents = Number(grossTodayResult.rows[0].coalesce);

  const commissionTodayResult = await query(`
    SELECT COALESCE(SUM(commission_cents), 0) FROM requests
    WHERE status = 'completed' AND completed_at >= $1
  `, [midnightSast]);
  const commissionTodayCents = Number(commissionTodayResult.rows[0].coalesce);

  res.ok({
    drivers,
    providers,
    pendingProviders,
    approvedProviders,
    rejectedProviders,
    incompleteProviders,
    activeRequests,
    jobsToday,
    grossTodayCents,
    commissionTodayCents,
  });
}

module.exports = { getOverview };
