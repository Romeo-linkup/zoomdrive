// Frontend-only rules (4, 6, 7, 10) belong to the frontend check in Phase 4
// This script implements backend-only rules from BLUEPRINT.md section 10.5

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backendDir = path.join(__dirname, '..');
const srcDir = path.join(backendDir, 'src');
const migrationsDir = path.join(backendDir, 'db', 'migrations');
const blueprintPath = path.join(__dirname, '..', '..', 'BLUEPRINT .md');

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
    }
  });

  checkEnvTracked();
  checkBlueprintCodes();

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
