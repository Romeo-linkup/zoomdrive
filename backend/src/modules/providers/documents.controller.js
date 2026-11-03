const { withTransaction } = require('../../db/pool');
const ApiError = require('../../lib/ApiError');
const { getMe } = require('../auth/auth.service');
const { writeAudit } = require('../../lib/audit');
const { uploadDocument, deleteDocumentAsset } = require('../uploads/cloudinary.service');

async function listDocumentsFor(userId, client = null) {
  const q = client ? (text, params) => client.query(text, params) : require('../../db/pool').query;
  const result = await q(
    'SELECT id, doc_type, status, note, uploaded_at, reviewed_at FROM provider_documents WHERE provider_user_id = $1 ORDER BY uploaded_at ASC',
    [userId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    docType: row.doc_type,
    status: row.status,
    note: row.note,
    uploadedAt: row.uploaded_at,
    reviewedAt: row.reviewed_at,
  }));
}

async function listDocuments(req, res) {
  const documents = await listDocumentsFor(req.user.id);
  res.ok({ documents });
}

async function uploadDocumentHandler(req, res) {
  const userId = req.user.id;
  const docType = req.body.doc_type;

  if (docType === 'company_registration') {
    const profileResult = await require('../../db/pool').query('SELECT provider_type FROM provider_profiles WHERE user_id = $1', [userId]);
    if (profileResult.rows.length === 0 || profileResult.rows[0].provider_type !== 'company') {
      throw new ApiError('ZD-PROV-004', { message: 'Company registration only applies to company accounts' });
    }
  }

  // Upload the buffer first with uploadDocument(req.file.buffer, { userId, docType })
  const uploadResult = await uploadDocument(req.file.buffer, { userId, docType });

  let oldPublicIds = [];
  try {
    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        'SELECT id, doc_type, cloudinary_public_id FROM provider_documents WHERE provider_user_id = $1 AND doc_type = $2 FOR UPDATE',
        [userId, docType]
      );
      oldPublicIds = existing.rows.map((r) => r.cloudinary_public_id).filter(Boolean);

      await client.query('DELETE FROM provider_documents WHERE provider_user_id = $1 AND doc_type = $2', [userId, docType]);
      const inserted = await client.query(
        `INSERT INTO provider_documents (provider_user_id, doc_type, file_url, cloudinary_public_id, status)
         VALUES ($1, $2, $3, $4, 'pending')
         RETURNING id`,
        [userId, docType, uploadResult.url, uploadResult.publicId]
      );

      await writeAudit(
        {
          actorType: 'user',
          actorId: userId,
          action: 'provider.document_upload',
          entity: 'provider_documents',
          entityId: inserted.rows[0].id,
          meta: { docType },
          requestId: req.id,
          ip: req.ip,
        },
        client
      );
      for (const oldDocument of existing.rows) {
        await writeAudit({
          actorType: 'user',
          actorId: userId,
          action: 'provider.document_delete',
          entity: 'provider_documents',
          entityId: oldDocument.id,
          meta: { docType: oldDocument.doc_type, reason: 'replacement' },
          requestId: req.id,
          ip: req.ip,
        }, client);
      }
    });

    // After commit, call deleteDocumentAsset for each old public id (best effort)
    for (const pid of oldPublicIds) {
      try {
        await deleteDocumentAsset(pid);
      } catch (e) {
        // best effort
      }
    }

    const documents = await listDocumentsFor(userId);
    return res.ok({ documents }, 201);
  } catch (err) {
    // If the database step fails, best-effort delete the asset just uploaded and rethrow
    try {
      await deleteDocumentAsset(uploadResult.publicId);
    } catch (e) {
      // best effort
    }
    throw err;
  }
}

module.exports = { listDocuments, uploadDocument: uploadDocumentHandler, listDocumentsFor };
