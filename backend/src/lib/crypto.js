const crypto = require('crypto');
const { env } = require('../config/env');

const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getKey() {
  if (!env.DATA_ENCRYPTION_KEY) {
    throw new Error('DATA_ENCRYPTION_KEY is unavailable');
  }
  const key = Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY is invalid');
  }
  return key;
}

function encrypt(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Value to encrypt must be a string');
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

function decrypt(value) {
  try {
    if (typeof value !== 'string') throw new Error();
    const parts = value.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') throw new Error();
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const ciphertext = Buffer.from(parts[3], 'base64');
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) throw new Error();
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Encrypted value could not be decrypted');
  }
}

module.exports = { encrypt, decrypt };