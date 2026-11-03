import { apiFetch } from '../../shared/api.js';
import { clear, el, formatDate } from '../../shared/ui.js';
import { renderPageError, showError } from '../../shared/errors.js';

const PAGE_SIZE = 50;
const FILTERS = [
  ['actorType', 'Actor type'],
  ['actorId', 'Actor ID'],
  ['action', 'Action prefix'],
  ['entity', 'Entity'],
  ['entityId', 'Entity ID'],
  ['ref', 'Error ref'],
  ['from', 'From'],
  ['to', 'To'],
];

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    await renderAudit(ctx, screen);
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderAudit(ctx, screen) {
  screen.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Audit log')));

  const form = el('form', { class: 'filters admin-audit-filters' });
  const fields = {};
  FILTERS.forEach(([key, label]) => {
    const field = el('label', { class: 'field admin-audit-filter' });
    field.appendChild(el('span', {}, label));
    let input;
    if (key === 'actorType') {
      input = el('select', { attrs: { 'aria-label': label } });
      [['', 'All actors'], ['user', 'User'], ['admin', 'Admin'], ['system', 'System']]
        .forEach(([value, text]) => input.appendChild(el('option', { value }, text)));
    } else {
      input = el('input', {
        type: key === 'from' || key === 'to' ? 'date' : 'text',
        attrs: { 'aria-label': label },
      });
      if (key === 'action') input.placeholder = 'e.g. request.';
      if (key === 'ref') input.placeholder = 'The ref shown on error banners';
    }
    input.name = key;
    input.value = ctx.query[key] || '';
    field.appendChild(input);
    if (key === 'ref') {
      field.appendChild(el('small', {}, 'The ref shown on error banners'));
    }
    fields[key] = input;
    form.appendChild(field);
  });

  const actions = el('div', { class: 'admin-audit-actions' });
  actions.appendChild(el('button', { class: 'btn', type: 'submit' }, 'Apply'));
  const reset = el('button', { class: 'btn soft', type: 'button' }, 'Reset');
  actions.appendChild(reset);
  form.appendChild(actions);
  screen.appendChild(form);

  const tableWrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'tbl' });
  const head = el('thead');
  const header = el('tr');
  ['Time', 'Actor', 'Action', 'Entity and ID', 'Ref', 'Details'].forEach((label) => {
    header.appendChild(el('th', {}, label));
  });
  head.appendChild(header);
  const tbody = el('tbody');
  table.appendChild(head);
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  screen.appendChild(tableWrap);

  const pager = el('div', { class: 'pager' });
  screen.appendChild(pager);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    ctx.navigate('/audit?' + buildQuery(fields, 1).toString());
  });
  reset.addEventListener('click', () => ctx.navigate('/audit'));

  try {
    const filters = buildApiFilters(fields);
    const page = positivePage(ctx.query.page);
    if (filters.ref) {
      const all = await loadEntriesForRef(filters, ctx.signal);
      if (ctx.signal.aborted) return;
      const matched = all.filter((entry) => String(entry.requestId || '').startsWith(filters.ref));
      const pageCount = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
      const selectedPage = Math.min(page, pageCount);
      renderRows(matched.slice((selectedPage - 1) * PAGE_SIZE, selectedPage * PAGE_SIZE));
      renderPager(selectedPage, pageCount, matched.length);
    } else {
      const params = new URLSearchParams(filters.api);
      params.set('page', String(page));
      const data = await apiFetch('/admin/audit?' + params.toString(), { signal: ctx.signal });
      if (ctx.signal.aborted) return;
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const total = Number(data.total) || 0;
      const pageSize = Number(data.pageSize) || PAGE_SIZE;
      const selectedPage = Number(data.page) || page;
      renderRows(entries);
      renderPager(selectedPage, Math.max(1, Math.ceil(total / pageSize)), total);
    }
  } catch (err) {
    if (!ctx.signal.aborted) {
      showError(err);
      renderRows([]);
      clear(pager);
    }
  }

  function renderRows(entries) {
    clear(tbody);
    if (!entries.length) {
      tbody.appendChild(emptyRow('No audit entries found.'));
      return;
    }
    entries.forEach((entry) => {
      const row = el('tr');
      row.appendChild(el('td', {}, formatDate(entry.createdAt, 'datetime') || '—'));
      row.appendChild(el('td', {}, [entry.actorType, entry.actorId]
        .filter((value) => value !== null && value !== undefined).join(' ') || '—'));
      row.appendChild(el('td', {}, entry.action || '—'));
      row.appendChild(el('td', {}, [entry.entity, entry.entityId]
        .filter((value) => value !== null && value !== undefined).join(' #') || '—'));
      row.appendChild(el('td', {}, entry.requestId || '—'));
      const detailCell = el('td');
      const details = el('button', { class: 'btn soft', type: 'button' }, 'Details');
      details.addEventListener('click', () => showMeta(ctx, entry));
      detailCell.appendChild(details);
      row.appendChild(detailCell);
      tbody.appendChild(row);
    });
  }

  function renderPager(page, pageCount, total) {
    clear(pager);
    const previous = el('button', { class: 'btn soft', type: 'button' }, 'Previous');
    previous.disabled = page <= 1;
    previous.addEventListener('click', () => {
      if (page > 1) ctx.navigate('/audit?' + buildQuery(fields, page - 1).toString());
    });
    const next = el('button', { class: 'btn soft', type: 'button' }, 'Next');
    next.disabled = page >= pageCount;
    next.addEventListener('click', () => {
      if (page < pageCount) ctx.navigate('/audit?' + buildQuery(fields, page + 1).toString());
    });
    pager.appendChild(previous);
    pager.appendChild(el('span', {}, 'Page ' + page + ' of ' + pageCount + ' (' + total + ' total)'));
    pager.appendChild(next);
  }
}

function buildQuery(fields, page) {
  const params = new URLSearchParams();
  Object.keys(fields).forEach((key) => {
    const value = fields[key].value.trim();
    if (value) params.set(key, value);
  });
  if (page > 1) params.set('page', String(page));
  return params;
}

function buildApiFilters(fields) {
  const api = new URLSearchParams();
  const ref = fields.ref.value.trim();
  Object.keys(fields).forEach((key) => {
    if (key === 'ref') return;
    const value = fields[key].value.trim();
    if (value) api.set(key, value);
  });
  return { api, ref };
}

async function loadEntriesForRef(filters, signal) {
  const firstParams = new URLSearchParams(filters.api);
  firstParams.set('page', '1');
  const firstPage = await apiFetch('/admin/audit?' + firstParams.toString(), { signal });
  const pageSize = Number(firstPage.pageSize) || PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil((Number(firstPage.total) || 0) / pageSize));
  const entries = Array.isArray(firstPage.entries) ? firstPage.entries.slice() : [];

  for (let page = 2; page <= pageCount; page += 1) {
    if (signal.aborted) return [];
    const params = new URLSearchParams(filters.api);
    params.set('page', String(page));
    const data = await apiFetch('/admin/audit?' + params.toString(), { signal });
    if (Array.isArray(data.entries)) entries.push(...data.entries);
  }
  return entries;
}

function positivePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function emptyRow(message) {
  const row = el('tr');
  row.appendChild(el('td', { attrs: { colspan: 6 } }, message));
  return row;
}

function showMeta(ctx, entry) {
  const backdrop = el('div', { class: 'modal-backdrop' });
  const dialog = el('div', { class: 'modal', role: 'dialog', attrs: { 'aria-modal': 'true' } });
  dialog.appendChild(el('h3', {}, 'Audit details'));
  const pre = el('pre', { class: 'admin-audit-meta' });
  pre.textContent = JSON.stringify(sanitizeMeta(entry.meta === undefined ? {} : entry.meta), null, 2);
  dialog.appendChild(pre);
  const closeButton = el('button', { class: 'btn', type: 'button' }, 'Close');
  dialog.appendChild(closeButton);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeyDown);
    ctx.signal.removeEventListener('abort', close);
    if (backdrop.parentNode) backdrop.remove();
  }
  function onKeyDown(event) {
    if (event.key === 'Escape') close();
  }
  closeButton.addEventListener('click', close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKeyDown);
  ctx.signal.addEventListener('abort', close, { once: true });
  closeButton.focus();
}

function sanitizeMeta(value, key = '') {
  if (/phone|comment|bank|account|card|secret|token|password|credential/i.test(key)) {
    return '[redacted]';
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeMeta(item));
  if (value && typeof value === 'object') {
    const safe = {};
    Object.keys(value).forEach((childKey) => {
      safe[childKey] = sanitizeMeta(value[childKey], childKey);
    });
    return safe;
  }
  if (typeof value === 'string') {
    return value.replace(/(?:\+?27[\s().-]?\d{2}[\s().-]?\d{3}[\s().-]?\d{4}|0\d{9})/g, '[redacted]');
  }
  return value;
}
