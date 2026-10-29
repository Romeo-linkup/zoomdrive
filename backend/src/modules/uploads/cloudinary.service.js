const { v2: cloudinary } = require('cloudinary');
const { env } = require('../../config/env');
const ApiError = require('../../lib/ApiError');
const { logger } = require('../../lib/logger');

let configured = false;

function configure() {
  if (configured) return;
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new ApiError('ZD-UPL-003', { message: 'File uploads are not configured on the server' });
  }
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

function root() {
  return `zoomdrive/${env.NODE_ENV}`;
}

function uploadBuffer(buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => (err ? reject(err) : resolve(result)));
    stream.end(buffer);
  });
}

function failUpload(err) {
  logger.error({ module: 'uploads', message: `Cloudinary upload failed: ${(err && err.message) || 'unknown error'}` });
  return new ApiError('ZD-UPL-003');
}

// Public profile photo. One photo per user: uploading again overwrites the old one.
async function uploadProfilePhoto(buffer, userId) {
  configure();
  try {
    const r = await uploadBuffer(buffer, {
      public_id: `${root()}/photos/user_${userId}`,
      overwrite: true,
      invalidate: true,
      resource_type: 'image',
      type: 'upload',
      transformation: [{ width: 800, height: 800, crop: 'limit' }],
    });
    return { url: r.secure_url, publicId: r.public_id };
  } catch (err) {
    throw failUpload(err);
  }
}

// Private ID/licence/insurance documents (type "authenticated"): not viewable without a signed URL (Phase 7).
async function uploadDocument(buffer, { userId, docType }) {
  configure();
  try {
    const r = await uploadBuffer(buffer, {
      public_id: `${root()}/documents/user_${userId}/${docType}_${Date.now()}`,
      overwrite: false,
      resource_type: 'auto',
      type: 'authenticated',
    });
    return { url: r.secure_url, publicId: r.public_id };
  } catch (err) {
    throw failUpload(err);
  }
}

// Best effort: a failed delete must never block the user.
async function deleteDocumentAsset(publicId) {
  if (!publicId) return;
  try {
    configure();
    await cloudinary.uploader.destroy(publicId, { type: 'authenticated', resource_type: 'image', invalidate: true });
  } catch (err) {
    logger.warn({ module: 'uploads', message: `Could not delete old document asset: ${(err && err.message) || 'unknown error'}` });
  }
}

async function ping() {
  configure();
  await cloudinary.api.ping();
  return true;
}

module.exports = { uploadProfilePhoto, uploadDocument, deleteDocumentAsset, ping };