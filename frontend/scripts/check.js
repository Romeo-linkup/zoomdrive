// frontend/scripts/check.js
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.join(__dirname, '..');
const publicDir = path.join(frontendDir, 'public');

const problems = [];

function addProblem(file, line, rule, message) {
  const rel = path.relative(frontendDir, file);
  problems.push(`${rel}:${line} ${rule} ${message}`);
}

function walkDir(dir, callback) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walkDir(fullPath, callback);
    } else if (entry.isFile()) {
      callback(fullPath);
    }
  }
}

// Rule 1: SYNTAX - node --check on every .js file under public/ and scripts/
function rule1Syntax() {
  const nodePath = process.execPath;
  walkDir(publicDir, (file) => {
    if (file.endsWith('.js')) {
      const result = spawnSync(nodePath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) {
        addProblem(file, 1, 'SYNTAX', 'node --check failed');
      }
    }
  });
  walkDir(path.join(frontendDir, 'scripts'), (file) => {
    if (file.endsWith('.js') && file !== __filename) {
      const result = spawnSync(nodePath, ['--check', file], { encoding: 'utf8' });
      if (result.status !== 0) {
        addProblem(file, 1, 'SYNTAX', 'node --check failed');
      }
    }
  });
}

// Rule 2: EMPTY - empty or only comments/TODO
function rule2Empty() {
  const extensions = ['.js', '.css', '.html', '.webmanifest', '.json'];
  walkDir(publicDir, (file) => {
    if (extensions.some(ext => file.endsWith(ext))) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('/*') && !l.trim().startsWith('*') && !l.trim().toLowerCase().includes('todo'));
      if (lines.length === 0 || content.trim().length === 0) {
        addProblem(file, 1, 'EMPTY', 'file is empty or only comments/TODO');
      }
    }
  });
}

// Rule 4: LOCALHOST - forbidden in public/ except shared/config.js
function rule4Localhost() {
  walkDir(publicDir, (file) => {
    if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
      if (file.endsWith('config.js')) return;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (line.includes('localhost') || line.includes('127.0.0.1')) {
          addProblem(file, i + 1, 'LOCALHOST', 'forbidden string');
        }
      });
    }
  });
}

// Rule 5: SECRETS - .env files tracked, secret patterns
function rule5Secrets() {
  const repoRoot = path.join(frontendDir, '..');
  try {
    const gitResult = spawnSync('git', ['ls-files', '.env'], { cwd: repoRoot, encoding: 'utf8' });
    if (gitResult.stdout && gitResult.stdout.trim()) {
      addProblem('.env', 1, 'SECRETS', '.env file is tracked by git');
    }
  } catch (e) {
    // git unavailable, skip silently
  }

  const secretPatterns = ['sk_live', 'sk_test', 'postgres://', 'postgresql://', 'Bearer ey'];
  walkDir(publicDir, (file) => {
    if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css') || file.endsWith('.json')) {
      if (file === __filename) return;
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        secretPatterns.forEach(pattern => {
          if (line.includes(pattern)) {
            addProblem(file, i + 1, 'SECRETS', `forbidden pattern: ${pattern}`);
          }
        });
      });
    }
  });
}

// Rule 6: APIRESULT - no .ok or .json() on apiFetch results
function rule6ApiResult() {
  walkDir(publicDir, (file) => {
    if (file.endsWith('.js') && !file.endsWith('api.js')) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      const apiFetchVars = [];
      lines.forEach((line, i) => {
        const match = line.match(/(?:const|let|var)\s+(\w+)\s*=\s*(?:await\s+)?apiFetch\(/);
        if (match) {
          apiFetchVars.push(match[1]);
        }
      });
      lines.forEach((line, i) => {
        apiFetchVars.forEach(v => {
          if (line.includes(`${v}.ok`) || line.includes(`${v}.json(`)) {
            addProblem(file, i + 1, 'APIRESULT', `forbidden use of .ok or .json() on apiFetch result`);
          }
        });
        if (line.includes('apiFetch(') && (line.includes('.ok') || line.includes('.json('))) {
          addProblem(file, i + 1, 'APIRESULT', 'forbidden use of .ok or .json() on apiFetch result');
        }
      });
    }
  });
}

// Rule 7: INNERHTML - no innerHTML with variables unless wrapped in escapeHtml
function rule7InnerHtml() {
  walkDir(publicDir, (file) => {
    if (file.endsWith('.js')) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (line.includes('.innerHTML') || line.includes('.outerHTML') || line.includes('insertAdjacentHTML')) {
          const match = line.match(/(innerHTML|outerHTML|insertAdjacentHTML)\s*(?:[\+\=]|=)/);
          if (match) {
            const afterMatch = line.substring(line.indexOf(match[0]) + match[0].length);
            if (!afterMatch.includes('escapeHtml') && !afterMatch.match(/^['"]/) && afterMatch.trim() !== '') {
              addProblem(file, i + 1, 'INNERHTML', 'innerHTML assignment with variable not wrapped in escapeHtml');
            }
          }
        }
      });
    }
  });
}

// Rule 10: TAPTARGET - min-height 44px for tap targets
function rule10TapTarget() {
  const componentsCss = path.join(publicDir, 'shared/styles/components.css');
  if (!fs.existsSync(componentsCss)) return;
  const content = fs.readFileSync(componentsCss, 'utf8');
  const selectors = ['button', '.btn', '.tile', '.chip', '.item', '.opt', '.doc', '.nav-item'];
  
  const combinedSelector = selectors.join(',');
  const regex = new RegExp(combinedSelector.replace('.', '\\.') + '[^\\{]*\\{[^}]*min-height', 's');
  
  if (!regex.test(content)) {
    addProblem(componentsCss, 1, 'TAPTARGET', `missing min-height for: ${selectors.join(', ')}`);
  }
}

// Rule 11: PWA - manifests, icons, service workers
function rule11Pwa() {
  const driverManifest = path.join(publicDir, 'driver/manifest.webmanifest');
  const providerManifest = path.join(publicDir, 'provider/manifest.webmanifest');
  const driverSw = path.join(publicDir, 'driver/sw.js');
  const providerSw = path.join(publicDir, 'provider/sw.js');

  if (!fs.existsSync(driverManifest)) {
    addProblem(driverManifest, 1, 'PWA', 'driver manifest missing');
    return;
  }
  if (!fs.existsSync(providerManifest)) {
    addProblem(providerManifest, 1, 'PWA', 'provider manifest missing');
    return;
  }

  let driverJson, providerJson;
  try {
    driverJson = JSON.parse(fs.readFileSync(driverManifest, 'utf8'));
    providerJson = JSON.parse(fs.readFileSync(providerManifest, 'utf8'));
  } catch (e) {
    addProblem(driverManifest, 1, 'PWA', 'manifest parse error');
    return;
  }

  if (driverJson.id === providerJson.id) {
    addProblem(driverManifest, 1, 'PWA', 'manifests have same id');
  }
  if (driverJson.scope === providerJson.scope) {
    addProblem(driverManifest, 1, 'PWA', 'manifests have same scope');
  }
  if (driverJson.start_url !== driverJson.scope) {
    addProblem(driverManifest, 1, 'PWA', 'start_url does not equal scope');
  }
  if (providerJson.start_url !== providerJson.scope) {
    addProblem(providerManifest, 1, 'PWA', 'start_url does not equal scope');
  }

  const iconPaths = [];
  if (driverJson.icons) {
    driverJson.icons.forEach(icon => {
      iconPaths.push(path.join(publicDir, icon.src.replace(/^\//, '')));
    });
  }
  if (providerJson.icons) {
    providerJson.icons.forEach(icon => {
      iconPaths.push(path.join(publicDir, icon.src.replace(/^\//, '')));
    });
  }
  iconPaths.forEach(iconPath => {
    if (!fs.existsSync(iconPath)) {
      addProblem(iconPath, 1, 'PWA', 'icon file missing');
    }
  });

  if (fs.existsSync(driverSw)) {
    const swContent = fs.readFileSync(driverSw, 'utf8');
    const shellMatch = swContent.match(/const SHELL\s*=\s*\[([\s\S]*?)\]/);
    if (shellMatch) {
      const shellContent = shellMatch[1];
      if (shellContent.includes('/api/')) {
        addProblem(driverSw, 1, 'PWA', 'service worker SHELL array caches /api');
      }
    }
  }
  if (fs.existsSync(providerSw)) {
    const swContent = fs.readFileSync(providerSw, 'utf8');
    const shellMatch = swContent.match(/const SHELL\s*=\s*\[([\s\S]*?)\]/);
    if (shellMatch) {
      const shellContent = shellMatch[1];
      if (shellContent.includes('/api/')) {
        addProblem(providerSw, 1, 'PWA', 'service worker SHELL array caches /api');
      }
    }
  }
}

// Rule 12: NOFETCH - flag any use of fetch( except in api.js and sw.js
function rule12NoFetch() {
  walkDir(publicDir, (file) => {
    if (file.endsWith('.js') && !file.endsWith('api.js') && !file.endsWith('sw.js')) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (line.includes('fetch(') && !line.includes('//')) {
          addProblem(file, i + 1, 'NOFETCH', 'forbidden use of fetch()');
        }
      });
    }
  });
}

// Run all rules
rule1Syntax();
rule2Empty();
rule4Localhost();
rule5Secrets();
rule6ApiResult();
rule7InnerHtml();
rule10TapTarget();
rule11Pwa();
rule12NoFetch();

if (problems.length > 0) {
  problems.forEach(p => console.log(p));
  console.error(`CHECK FAILED (${problems.length} problems)`);
  process.exit(1);
} else {
  console.log('CHECK PASSED');
  process.exit(0);
}
