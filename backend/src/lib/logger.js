function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  if (phone.length <= 4) return '****';
  return '***' + phone.slice(-4);
}

function maskEmail(email) {
  if (typeof email !== 'string') return '***';
  const atIndex = email.lastIndexOf('@');
  if (atIndex < 1 || atIndex === email.length - 1) return '***';
  return `${email[0]}***@${email.slice(atIndex + 1)}`;
}

function maskEmailAddresses(value) {
  return String(value).replace(
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    '[redacted]'
  ).replace(/(?:\+27|0)\s?\d{2}[\s-]?\d{3}[\s-]?\d{4}\b/g, '[redacted]');
}

function redactMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const redacted = {};
  const sensitiveKeyPattern = /token|secret|password|authorization|code_hash|file_url|api_key|bank|account|document|url|comment|note/i;

  for (const [key, value] of Object.entries(meta)) {
    if (sensitiveKeyPattern.test(key)) {
      redacted[key] = '[redacted]';
    } else if (key === 'phone' || key === 'email' || key === 'to') {
      redacted[key] = '[redacted]';
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function log(level, { reqId = '-', module, code, message, meta }) {
  const timestamp = new Date().toISOString();
  const codePart = code ? code : '';
  const metaPart = meta && Object.keys(meta).length > 0
    ? maskEmailAddresses(JSON.stringify(redactMeta(meta)))
    : '';
  const line = `[${timestamp}] [${level}] [${reqId}] [${module}] ${codePart} ${maskEmailAddresses(message || '')} ${metaPart}`.trim();
  console.log(line);
}

const logger = {
  info: (params) => log('INFO', params),
  warn: (params) => log('WARN', params),
  error: (params) => log('ERROR', params),
};

module.exports = { logger, maskPhone, maskEmail };
