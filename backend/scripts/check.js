// Frontend-only rules (4, 6, 7, 10) belong to the frontend check in Phase 4
// This script implements backend-only rules from BLUEPRINT.md section 10.5

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backendDir = path.join(__dirname, '..');
const srcDir = path.join(backendDir, 'src');
const migrationsDir = path.join(backendDir, 'db', 'migrations');
const blueprintPath = path.join(__dirname, '..', '..', 'BLUEPRINT.md');

const problems = [];

function addProblem(filePath, line, rule, message) {
  const relPath = path.relative(backendDir, filePath);
  problems.push(`${relPath}:${line} ${rule} ${message}`);
}

// Rule 1 SYNTAX: node --check on every .js file
function checkSyntax(filePath) {
  if (path.extname(filePath) !== '.js') return;
  const result = spawnSync(process.execPath, ['--check', filePath], { encoding: 'utf8' });
  if (result.status !== 0) {
    addProblem(filePath, 1, 'SYNTAX', 'node --check failed');
  }
}

// Rule 2 EMPTY: .js or .sql file with 0 bytes, or containing only whitespace, comments or TODO
function checkEmpty(filePath, content) {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    addProblem(filePath, 1, 'EMPTY', 'file is empty');
    return;
  }

  const lines = content.split('\n');
  const nonCommentLines = lines.filter(line => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('--') || trimmed.startsWith('/*')) return false;
    if (trimmed === 'TODO' || trimmed.startsWith('TODO:')) return false;
    return true;
  });

  if (nonCommentLines.length === 0) {
    addProblem(filePath, 1, 'EMPTY', 'file contains only comments/TODO');
  }
}

// Rule 20 REQUIRE_ALL: every file under src/ (except server.js) must require without error
function checkRequireAll() {
  const stubEnv = {
    NODE_ENV: 'development',
    PORT: '4000',
    DATABASE_URL: 'postgresql://localhost:5432/test',
    JWT_SECRET: '0123456789012345678901234567890123456789012345678901234567890123',
    JWT_EXPIRES_IN: '30d',
    TRUST_PROXY_HOPS: '1',
    FRONTEND_ORIGINS: 'http://localhost:3000',
    OTP_DRIVER: 'console',
    OTP_DAILY_EMAIL_CAP: '250',
    OTP_DEV_ECHO: 'true',
    OTP_ALLOW_CONSOLE_IN_PRODUCTION: 'false',
    SIGNUP_ENABLED: 'true',
    APP_VERSION: '1.0.0',
    CLOUDINARY_CLOUD_NAME: 'test',
    CLOUDINARY_API_KEY: 'test',
    CLOUDINARY_API_SECRET: 'test',
    SMS_API_KEY: 'test',
    SMS_API_SECRET: 'test',
    SMS_SENDER_ID: 'ZoomDrive',
    PAYSTACK_SECRET_KEY: 'sk_test_xxx',
    PAYSTACK_PUBLIC_KEY: 'pk_test_xxx',
    PAYSTACK_FALLBACK_EMAIL_DOMAIN: 'example.com',
    DATA_ENCRYPTION_KEY: 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=',
    EMAIL_DRIVER: 'console',
    EMAIL_FROM: 'noreply@example.com',
    EMAIL_FROM_NAME: 'ZoomDrive',
    BREVO_API_KEY: 'test',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '25',
    SMTP_USER: 'test',
    SMTP_PASS: 'test',
    EMAIL_FALLBACK_DOMAIN: 'example.com',
    PRICING_CHANGE_COOLDOWN_HOURS: '24',
    TRANSACTIONAL_EMAIL_DAILY_CAP: '150',
    ADMIN_ALERT_EMAIL: 'alert@example.com',
  };
  for (const [key, value] of Object.entries(stubEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  walkDir(srcDir, (filePath) => {
    if (path.extname(filePath) !== '.js') return;
    if (filePath === __filename) return;
    if (path.basename(filePath) === 'server.js') return;
    try {
      require(filePath);
    } catch (err) {
      addProblem(filePath, 1, 'REQUIRE_ALL', `${err.name}: ${err.message}`);
    }
  });
}

// Rule 3 MIGRATION: every backend/db/migrations/*.sql must contain CREATE or ALTER
function checkMigration(filePath, content) {
  const upper = content.toUpperCase();
  if (!upper.includes('CREATE') && !upper.includes('ALTER')) {
    addProblem(filePath, 1, 'MIGRATION', 'must contain CREATE or ALTER');
  }
}

// Rule 5 SECRETS: fail if '.env' is tracked; also fail on patterns in any scanned file
function checkSecrets(filePath, content) {
  const patterns = ['sk_live', 'sk_test', 'postgres://', 'postgresql://', 'Bearer ey'];
  for (const pattern of patterns) {
    if (content.includes(pattern)) {
      addProblem(filePath, 1, 'SECRETS', `contains pattern "${pattern}"`);
    }
  }
}

function checkEnvTracked() {
  const result = spawnSync('git', ['ls-files', '.env'], {
    cwd: path.join(__dirname, '..', '..'),
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (result.status === 0 && result.stdout.trim()) {
    addProblem(path.join(backendDir, '.env'), 1, 'SECRETS', '.env is tracked in git');
  }
}

// Rule 8 THROW: 'throw new Error(' anywhere outside backend/src/lib/ and backend/scripts/
function checkThrow(filePath, content) {
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('throw new Error(')) {
      const relPath = path.relative(backendDir, filePath);
      if (!relPath.startsWith('src' + path.sep + 'lib') && !relPath.startsWith('scripts')) {
        addProblem(filePath, idx + 1, 'THROW', 'use ApiError instead of throw new Error');
      }
    }
  });
}

// Rule 9 CODES: every ZD-XXX-NNN code used must exist in ERRORS; every ERRORS key must be in BLUEPRINT
function checkCodes(filePath, content) {
  const errorsPath = path.join(srcDir, 'lib', 'errors.js');
  if (filePath === errorsPath) return;

  const codeRegex = /ZD-[A-Z]+-\d{3}/g;
  const matches = content.match(codeRegex);
  if (!matches) return;

  const uniqueCodes = new Set(matches);

  let errorsContent;
  try {
    errorsContent = fs.readFileSync(errorsPath, 'utf8');
  } catch (e) {
    addProblem(filePath, 1, 'CODES', 'cannot read lib/errors.js');
    return;
  }

  const errorsRegex = /['"]ZD-[A-Z]+-\d{3}['"]:/g;
  const registeredCodes = new Set();
  let match;
  while ((match = errorsRegex.exec(errorsContent)) !== null) {
    const codeMatch = match[0].match(/ZD-[A-Z]+-\d{3}/);
    if (codeMatch) {
      registeredCodes.add(codeMatch[0]);
    }
  }

  for (const code of uniqueCodes) {
    if (!registeredCodes.has(code)) {
      addProblem(filePath, 1, 'CODES', `code "${code}" not in lib/errors.js`);
    }
  }
}

function checkBlueprintCodes() {
  const errorsPath = path.join(srcDir, 'lib', 'errors.js');
  let blueprintContent;
  try {
    blueprintContent = fs.readFileSync(blueprintPath, 'utf8');
  } catch (e) {
    addProblem(blueprintPath, 1, 'CODES', 'cannot read BLUEPRINT.md');
    return;
  }

  const errorsContent = fs.readFileSync(errorsPath, 'utf8');

  const blueprintRegex = /\| (ZD-[A-Z]+-\d{3})/g;
  const blueprintCodes = new Set();
  let match;
  while ((match = blueprintRegex.exec(blueprintContent)) !== null) {
    blueprintCodes.add(match[1]);
  }

  const errorsRegex = /['"]ZD-[A-Z]+-\d{3}['"]:/g;
  const errorsCodes = new Set();
  while ((match = errorsRegex.exec(errorsContent)) !== null) {
    const codeMatch = match[0].match(/ZD-[A-Z]+-\d{3}/);
    if (codeMatch) {
      errorsCodes.add(codeMatch[0]);
    }
  }

  for (const code of errorsCodes) {
    if (!blueprintCodes.has(code)) {
      addProblem(errorsPath, 1, 'CODES', `code "${code}" not in BLUEPRINT.md section 10.1`);
    }
  }
}

// Rule 15 ZODSTR: every z.string() must have .max/.length/.regex/.email/.uuid on same or next 2 lines
function checkZodString(filePath, content) {
  if (!filePath.includes(path.join('src'))) return;
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/z\.string\(\)/.test(line)) {
      const window = lines.slice(idx, idx + 3).join('\n');
      if (!/\.max\(|\.length\(|\.regex\(|\.email\(|\.uuid\(/.test(window)) {
        addProblem(filePath, idx + 1, 'ZODSTR', 'z.string() missing bound');
      }
    }
  });
}

// Rule 16 CORS: no origin:true, no origin:'*', no argument-less cors()
function checkCors(filePath, content) {
  if (!filePath.includes(path.join('src'))) return;
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/origin:\s*true/.test(line) || /origin:\s*['"]\*['"]/.test(line) || /\bcors\(\s*\)/.test(line)) {
      addProblem(filePath, idx + 1, 'CORS', 'unsafe CORS configuration');
    }
  });
}

// Rule 17 EMPTYCATCH: no empty catch blocks in src/ or scripts/
function checkEmptyCatch(filePath, content) {
  if (!filePath.includes(path.join('src')) && !filePath.includes(path.join('scripts'))) return;
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
      addProblem(filePath, idx + 1, 'EMPTYCATCH', 'empty catch block');
    }
  });
}

function walkDir(dir, callback) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.env') {
        walkDir(fullPath, callback);
      }
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

function main() {
  walkDir(backendDir, (filePath) => {
    const ext = path.extname(filePath);
    if (ext !== '.js' && ext !== '.sql') return;

    const relPath = path.relative(backendDir, filePath);
    if (relPath === '.env') return;

    const content = fs.readFileSync(filePath, 'utf8');

    checkSyntax(filePath);
    checkEmpty(filePath, content);

    if (relPath.startsWith('db' + path.sep + 'migrations') && ext === '.sql') {
      checkMigration(filePath, content);
    }

    if (filePath !== __filename) {
      checkSecrets(filePath, content);
    }

    if (ext === '.js' && filePath !== __filename) {
      checkThrow(filePath, content);
      checkCodes(filePath, content);
      checkZodString(filePath, content);
      checkCors(filePath, content);
      checkEmptyCatch(filePath, content);
    }
  });

  checkEnvTracked();
  checkBlueprintCodes();
  checkRequireAll();

  if (problems.length > 0) {
    console.log('CHECK FAILED (' + problems.length + ' problems)');
    problems.forEach(p => console.log(p));
    process.exit(1);
  } else {
    console.log('CHECK PASSED');
    process.exit(0);
  }
}

main();
