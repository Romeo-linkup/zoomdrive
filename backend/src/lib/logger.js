function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return phone;
  if (phone.length <= 4) return '****';
  return '***' + phone.slice(-4);
}

function redactMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const redacted = {};
  const sensitiveKeyPattern = /token|secret|password|authorization|code_hash|file_url|api_key/i;

  for (const [key, value] of Object.entries(meta)) {
    if (sensitiveKeyPattern.test(key)) {
      redacted[key] = '[redacted]';
    } else if (key === 'phone') {
      redacted[key] = maskPhone(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

function log(level, { reqId = '-', module, code, message, meta }) {
  const timestamp = new Date().toISOString();
  const codePart = code ? code : '';
  const metaPart = meta && Object.keys(meta).length > 0 ? JSON.stringify(redactMeta(meta)) : '';
  const line = `[${timestamp}] [${level}] [${reqId}] [${module}] ${codePart} ${message} ${metaPart}`.trim();
  console.log(line);
}

const logger = {
  info: (params) => log('INFO', params),
  warn: (params) => log('WARN', params),
  error: (params) => log('ERROR', params),
};

module.exports = { logger, maskPhone };
