// Verifies that every static import in public/**/*.js points at a real file and, for named
// imports, that the target file really exports those names. Catches the class of bug that
// `node --check` cannot see (it only checks syntax) and that otherwise shows up as a blank page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');
const problems = [];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js') && entry.name !== 'sw.js') out.push(full);
  }
  return out;
}

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const lineOf = (src, index) => src.slice(0, index).split('\n').length;
const rel = (file) => path.relative(root, file).split(path.sep).join('/');

function resolveSpecifier(fromFile, spec) {
  if (spec.startsWith('/')) return path.join(publicDir, spec);
  if (spec.startsWith('.')) return path.resolve(path.dirname(fromFile), spec);
  return null; // bare or URL imports are not checked
}

const exportCache = new Map();
function getExports(file) {
  if (exportCache.has(file)) return exportCache.get(file);
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const names = new Set();
  let hasDefault = /\bexport\s+default\b/.test(src);
  for (const m of src.matchAll(/\bexport\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bexport\s+(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
  for (const m of src.matchAll(/\bexport\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const p = part.trim();
      if (!p) continue;
      const as = p.split(/\s+as\s+/);
      const exported = (as[1] || as[0]).trim();
      if (exported === 'default') hasDefault = true;
      else names.add(exported);
    }
  }
  const result = { names, hasDefault };
  exportCache.set(file, result);
  return result;
}

for (const file of walk(publicDir)) {
  const raw = fs.readFileSync(file, 'utf8');
  const src = stripComments(raw);

  // static imports: import X, { a, b as c } from '...'; import * as N from '...'; import '...'
  for (const m of src.matchAll(/\bimport\s+([\s\S]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    const clause = m[1].trim();
    if (clause.startsWith('(')) continue;
    const spec = m[2];
    const line = lineOf(src, m.index);
    const target = resolveSpecifier(file, spec);
    if (target === null) continue;
    if (!/\.[a-z]+$/i.test(spec)) problems.push(`${rel(file)}:${line} IMPORT '${spec}' needs a file extension (browsers do not add .js)`);
    if (!fs.existsSync(target)) { problems.push(`${rel(file)}:${line} IMPORT cannot find ${spec}`); continue; }
    if (!target.endsWith('.js')) continue;
    const { names, hasDefault } = getExports(target);
    const defaultPart = clause.match(/^([A-Za-z_$][\w$]*)\s*(,|$)/);
    if (defaultPart && !hasDefault) problems.push(`${rel(file)}:${line} IMPORT ${spec} has no default export`);
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      for (const part of braces[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name && !names.has(name)) problems.push(`${rel(file)}:${line} IMPORT '${name}' is not exported by ${spec}`);
      }
    }
  }

  // dynamic imports used for page loading: the file must exist and have a default export
  for (const m of src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1];
    const line = lineOf(src, m.index);
    const target = resolveSpecifier(file, spec);
    if (target === null) continue;
    if (!fs.existsSync(target)) { problems.push(`${rel(file)}:${line} IMPORT cannot find ${spec}`); continue; }
    if (target.endsWith('.js') && !getExports(target).hasDefault) problems.push(`${rel(file)}:${line} IMPORT ${spec} has no default export (page modules must export default)`);
  }
}

if (problems.length) {
  for (const p of problems) console.log(p);
  console.log(`IMPORT CHECK FAILED (${problems.length} problems)`);
  process.exit(1);
}
console.log('IMPORT CHECK PASSED');