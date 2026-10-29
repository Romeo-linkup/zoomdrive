const multer = require('multer');
const ApiError = require('../lib/ApiError');

const MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOC_TYPES = [...PHOTO_TYPES, 'application/pdf'];

// Detects the real file type from its first bytes, so a renamed .exe or .txt cannot pass as a JPG.
function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

function makeUpload(fieldName, allowed, badTypeMessage) {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      if (!allowed.includes(file.mimetype)) {
        return cb(new ApiError('ZD-UPL-001', { message: badTypeMessage, field: fieldName }));
      }
      return cb(null, true);
    },
  }).single(fieldName);

  return (req, res, next) => {
    parser(req, res, (err) => {
      if (err) {
        if (err instanceof ApiError) return next(err);
        if (err.code === 'LIMIT_FILE_SIZE') return next(new ApiError('ZD-UPL-002', { field: fieldName }));
        if (err instanceof multer.MulterError) {
          return next(new ApiError('ZD-VAL-001', { message: 'Upload failed. Check the file and try again.', field: fieldName }));
        }
        return next(err);
      }
      if (!req.file) {
        return next(new ApiError('ZD-VAL-001', { message: 'Choose a file to upload', field: fieldName }));
      }
      const real = sniffMime(req.file.buffer);
      if (!real || !allowed.includes(real)) {
        return next(new ApiError('ZD-UPL-001', { message: badTypeMessage, field: fieldName }));
      }
      req.file.detectedMime = real;
      return next();
    });
  };
}

const photoUpload = makeUpload('photo', PHOTO_TYPES, 'Use a JPG, PNG or WebP photo');
const documentUpload = makeUpload('file', DOC_TYPES, 'Use a JPG, PNG, WebP or PDF file');

module.exports = { photoUpload, documentUpload, sniffMime };