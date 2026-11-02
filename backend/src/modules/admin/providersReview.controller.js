const { pool, query, withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { writeAudit } = require('../../lib/audit');
const { createNotification } = require('../notifications/notifications.service');
const { signedDocumentUrl } = require('../uploads/cloudinary.service');
const { getRegistrationState } = require('../payments/charges.service');

const DOC_LABELS = {
  id_document: 'ID document',
  drivers_licence: "Driver's licence",
  vehicle_insurance: 'Vehicle and insurance',
  company_registration: 'Company registration certificate',
};

function requiredDocs(providerType) {
  const required = ['id_document', 'drivers_licence', 'vehicle_insurance'];
  if (providerType === 'company') {
    required.push('company_registration');
  }
  return required;
}

function providerStatusOf(profileRow) {
  if (!profileRow) return 'none';
  if (!profileRow.submitted_at) return 'incomplete';
  return profileRow.verification_status;
}

async function buildProviderDetail(userId, client = null) {
  const q = client ? (text, params) => client.query(text, params) : query;

  const userResult = await q(
    `SELECT id, phone, first_name, last_name, photo_url, status, created_at, last_login_at
     FROM users WHERE id = $1 AND role = 'provider'`,
    [userId]
  );
  if (userResult.rows.length === 0) {
    throw new ApiError('ZD-ADM-003', { message: 'Provider not found' });
  }
  const user = userResult.rows[0];

  const profileResult = await q('SELECT * FROM provider_profiles WHERE user_id = $1', [userId]);
  const profile = profileResult.rows[0];

  let organisation = null;
  if (profile && profile.organisation_id) {
    const orgResult = await q('SELECT id, name, reg_number, status FROM organisations WHERE id = $1', [profile.organisation_id]);
    if (orgResult.rows.length > 0) {
      const org = orgResult.rows[0];
      organisation = {
        id: org.id,
        name: org.name,
        regNumber: org.reg_number,
        status: org.status,
      };
    }
  }

  const servicesResult = await q(
    `SELECT s.id, s.code, s.name
     FROM provider_services ps
     JOIN services s ON s.id = ps.service_id
     WHERE ps.provider_user_id = $1
     ORDER BY s.sort_order, s.id`,
    [userId]
  );
  const services = servicesResult.rows;

  const docsResult = await q(
    `SELECT id, doc_type, file_url, cloudinary_public_id, status, note, uploaded_at, reviewed_at
     FROM provider_documents
     WHERE provider_user_id = $1
     ORDER BY uploaded_at ASC`,
    [userId]
  );

  const documents = docsResult.rows.map((row) => {
    const urlWithoutQuery = row.file_url.split('?')[0];
    const extMatch = urlWithoutQuery.match(/\.([^.]+)$/);
    const isPdf = extMatch ? extMatch[1].toLowerCase() === 'pdf' : false;
    return {
      id: row.id,
      docType: row.doc_type,
      label: DOC_LABELS[row.doc_type] || row.doc_type,
      status: row.status,
      note: row.note,
      uploadedAt: row.uploaded_at,
      reviewedAt: row.reviewed_at,
      isPdf,
      viewUrl: signedDocumentUrl(row.cloudinary_public_id, row.file_url),
    };
  });

  const required = requiredDocs(profile ? profile.provider_type : 'individual');

  const canApprove = profile && profile.verification_status === 'pending';
  let allRequiredApproved = false;
  if (canApprove) {
    const approvedDocs = new Set(docsResult.rows.filter((r) => r.status === 'approved').map((r) => r.doc_type));
    allRequiredApproved = required.every((rt) => approvedDocs.has(rt));
  }
  const registration = await getRegistrationState(userId, client || pool);

  return {
    user: {
      id: user.id,
      phone: user.phone,
      firstName: user.first_name,
      lastName: user.last_name,
      photoUrl: user.photo_url,
      status: user.status,
      createdAt: user.created_at,
      lastLoginAt: user.last_login_at,
    },
    profile: profile
      ? {
          providerType: profile.provider_type,
          vehicleDescription: profile.vehicle_description,
          plate: profile.plate,
          baseLat: profile.base_lat,
          baseLng: profile.base_lng,
          serviceRadiusKm: profile.service_radius_km,
          verificationStatus: profile.verification_status,
          rejectionReason: profile.rejection_reason,
          submittedAt: profile.submitted_at,
          approvedAt: profile.approved_at,
          consentAt: profile.consent_at,
          ratingAvg: profile.rating_avg,
          jobsCompleted: profile.jobs_completed,
        }
      : null,
    status: providerStatusOf(profile),
    organisation,
    services,
    documents,
    requiredDocs: required,
    canApprove: canApprove && allRequiredApproved,
    registration,
  };
}

async function listProviders(req, res) {
  const { status, q, page } = req.validated;
  const pageSize = 25;
  const offset = (page - 1) * pageSize;

  let whereClauses = ["u.role = 'provider'"];
  let params = [];
  let paramIndex = 1;

  if (status === 'incomplete') {
    whereClauses.push('pp.user_id IS NOT NULL AND pp.submitted_at IS NULL');
  } else if (status === 'pending') {
    whereClauses.push('pp.submitted_at IS NOT NULL AND pp.verification_status = $1');
    params.push('pending');
    paramIndex++;
  } else if (status === 'approved') {
    whereClauses.push("pp.verification_status = $1");
    params.push('approved');
    paramIndex++;
  } else if (status === 'rejected') {
    whereClauses.push("pp.verification_status = $1");
    params.push('rejected');
    paramIndex++;
  }

  if (q) {
    const escapedQ = q.replace(/%/g, '\\%').replace(/_/g, '\\_');
    whereClauses.push(`(u.phone ILIKE $${paramIndex} OR u.first_name ILIKE $${paramIndex} OR u.last_name ILIKE $${paramIndex})`);
    params.push(`%${escapedQ}%`);
    paramIndex++;
  }

  const whereClause = whereClauses.join(' AND ');

  const orderBy = status === 'pending' ? 'pp.submitted_at ASC' : 'u.created_at DESC';

  const { rows } = await query(`
    SELECT
      u.id AS "userId",
      u.first_name AS "firstName",
      u.last_name AS "lastName",
      u.phone,
      u.photo_url AS "photoUrl",
      pp.provider_type AS "providerType",
      org.name AS "companyName",
      pp.verification_status AS "status",
      pp.submitted_at AS "submittedAt",
      (SELECT COUNT(*) FROM provider_documents pd WHERE pd.provider_user_id = u.id AND pd.status = 'approved') AS "docsApproved",
      (SELECT COUNT(*) FROM provider_documents pd WHERE pd.provider_user_id = u.id) AS "docsTotal"
    FROM users u
    LEFT JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN organisations org ON org.id = pp.organisation_id
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `, [...params, pageSize, offset]);

  const countResult = await query(`
    SELECT COUNT(*) FROM users u
    LEFT JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN organisations org ON org.id = pp.organisation_id
    WHERE ${whereClause}
  `, params);
  const total = Number(countResult.rows[0].count);

  res.ok({
    providers: rows,
    page,
    pageSize,
    total,
  });
}

async function getProvider(req, res) {
  const userId = Number(req.params.userId);
  res.ok(await buildProviderDetail(userId));
}

async function approve(req, res) {
  const userId = Number(req.params.userId);

  await withTransaction(async (client) => {
    const profileResult = await client.query('SELECT * FROM provider_profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    if (profileResult.rows.length === 0) {
      throw new ApiError('ZD-ADM-003', { message: 'Provider not found' });
    }
    const profile = profileResult.rows[0];

    const status = providerStatusOf(profile);
    if (status !== 'pending') {
      throw new ApiError('ZD-ADM-002', { message: `This provider is not waiting for review (status: ${status})` });
    }

    const required = requiredDocs(profile.provider_type);
    const docsResult = await client.query(
      "SELECT doc_type, status FROM provider_documents WHERE provider_user_id = $1",
      [userId]
    );
    const approvedDocs = new Set(docsResult.rows.filter((r) => r.status === 'approved').map((r) => r.doc_type));
    const pending = [];
    for (const rt of required) {
      if (!approvedDocs.has(rt)) {
        pending.push(rt);
      }
    }
    if (pending.length > 0) {
      throw new ApiError('ZD-ADM-004', { message: 'Approve all required documents first', details: { pending } });
    }

    await client.query(
      `UPDATE provider_profiles
       SET verification_status = 'approved', approved_at = now(), approved_by = $1, rejection_reason = NULL
       WHERE user_id = $2`,
      [req.admin.id, userId]
    );

    if (profile.organisation_id) {
      await client.query("UPDATE organisations SET status = 'approved' WHERE id = $1", [profile.organisation_id]);
    }

    await writeAudit(
      {
        actorType: 'admin',
        actorId: req.admin.id,
        action: 'admin.provider_approve',
        entity: 'provider_profiles',
        entityId: userId,
        requestId: req.id,
        ip: req.ip,
      },
      client
    );

    await createNotification(
      {
        userId,
        title: 'You are approved',
        body: 'Your ZoomDrive Partner profile is approved. You can now go online and accept jobs.',
        kind: 'provider_approved',
      },
      client
    );
  });

  res.ok(await buildProviderDetail(userId));
}

async function reject(req, res) {
  const userId = Number(req.params.userId);
  const { reason } = req.body;

  await withTransaction(async (client) => {
    const profileResult = await client.query('SELECT * FROM provider_profiles WHERE user_id = $1 FOR UPDATE', [userId]);
    if (profileResult.rows.length === 0) {
      throw new ApiError('ZD-ADM-003', { message: 'Provider not found' });
    }
    const profile = profileResult.rows[0];

    const status = providerStatusOf(profile);
    if (status !== 'pending') {
      throw new ApiError('ZD-ADM-002', { message: `This provider is not waiting for review (status: ${status})` });
    }

    await client.query(
      `UPDATE provider_profiles
       SET verification_status = 'rejected', rejection_reason = $1
       WHERE user_id = $2`,
      [reason, userId]
    );

    await writeAudit(
      {
        actorType: 'admin',
        actorId: req.admin.id,
        action: 'admin.provider_reject',
        entity: 'provider_profiles',
        entityId: userId,
        meta: { reason },
        requestId: req.id,
        ip: req.ip,
      },
      client
    );

    await createNotification(
      {
        userId,
        title: 'Your profile needs changes',
        body: reason,
        kind: 'provider_rejected',
      },
      client
    );
  });

  res.ok(await buildProviderDetail(userId));
}

async function reviewDocument(req, res) {
  const id = Number(req.params.id);
  const { status, note } = req.body;

  await withTransaction(async (client) => {
    const docResult = await client.query(
      `SELECT pd.*, pp.verification_status, pp.user_id, pp.provider_type
       FROM provider_documents pd
       JOIN provider_profiles pp ON pp.user_id = pd.provider_user_id
       WHERE pd.id = $1 FOR UPDATE`,
      [id]
    );
    if (docResult.rows.length === 0) {
      throw new ApiError('ZD-ADM-003', { message: 'Document not found' });
    }
    const doc = docResult.rows[0];
    const userId = doc.user_id;

    await client.query(
      `UPDATE provider_documents
       SET status = $1, note = $2, reviewed_at = now(), reviewed_by = $3
       WHERE id = $4`,
      [status, status === 'approved' ? null : note, req.admin.id, id]
    );

    await writeAudit(
      {
        actorType: 'admin',
        actorId: req.admin.id,
        action: 'admin.document_review',
        entity: 'provider_documents',
        entityId: id,
        meta: { docType: doc.doc_type, status },
        requestId: req.id,
        ip: req.ip,
      },
      client
    );

    if (status === 'rejected' && doc.verification_status === 'pending') {
      const rejectionReason = `${DOC_LABELS[doc.doc_type]}: ${note}`;
      await client.query(
        `UPDATE provider_profiles
         SET verification_status = 'rejected', rejection_reason = $1
         WHERE user_id = $2`,
        [rejectionReason, userId]
      );

      await writeAudit(
        {
          actorType: 'admin',
          actorId: req.admin.id,
          action: 'admin.provider_reject',
          entity: 'provider_profiles',
          entityId: userId,
          meta: { reason: rejectionReason, via: 'document' },
          requestId: req.id,
          ip: req.ip,
        },
        client
      );

      await createNotification(
        {
          userId,
          title: 'A document needs to be replaced',
          body: rejectionReason,
          kind: 'provider_rejected',
        },
        client
      );
    }
  });

  const docResult = await query('SELECT provider_user_id FROM provider_documents WHERE id = $1', [id]);
  if (docResult.rows.length > 0) {
    res.ok(await buildProviderDetail(docResult.rows[0].provider_user_id));
  } else {
    res.ok({});
  }
}

async function waiveRegistration(req, res) {
  const userId = Number(req.params.userId);
  await withTransaction(async (client) => {
    const provider = await client.query(
      `SELECT pp.user_id
       FROM provider_profiles pp
       JOIN users u ON u.id = pp.user_id
       WHERE pp.user_id = $1 AND u.role = 'provider'
       FOR UPDATE OF pp`,
      [userId]
    );
    if (provider.rows.length === 0) {
      throw new ApiError('ZD-ADM-003', { message: 'Provider not found' });
    }

    await client.query(
      'UPDATE provider_profiles SET registration_waived = true WHERE user_id = $1',
      [userId]
    );
    await writeAudit({
      actorType: 'admin',
      actorId: req.admin.id,
      action: 'admin.provider_waive_registration',
      entity: 'provider_profiles',
      entityId: userId,
      requestId: req.id,
      ip: req.ip,
    }, client);
  });
  res.ok({ waived: true });
}

module.exports = { listProviders, getProvider, approve, reject, reviewDocument, waiveRegistration };
