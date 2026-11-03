import { apiFetch } from '../../shared/api.js';
import { clear, el, formatDate, formatZAR, toast, withSpinner } from '../../shared/ui.js';
import { clearError, renderPageError, showError } from '../../shared/errors.js';

const TABS = [
  ['summary', 'Summary'],
  ['transactions', 'Transactions'],
  ['reconcile', 'Reconcile'],
];
const RANGE_OPTIONS = [
  ['this-month', 'This month'],
  ['last-month', 'Last month'],
  ['last-7-days', 'Last 7 days'],
  ['custom', 'Custom from/to'],
];
const TRANSACTION_TYPES = [
  ['all', 'All types'],
  ['ride_payment', 'Ride payment'],
  ['registration_fee', 'Registration fee'],
  ['driver_plus', 'Driver Plus'],
  ['payout', 'Payout'],
  ['adjustment', 'Adjustment'],
];
const TYPE_LABELS = Object.fromEntries(TRANSACTION_TYPES.slice(1));

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    await renderRevenue(ctx, screen);
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderRevenue(ctx, screen) {
  screen.appendChild(el('div', { class: 'page-head' }, el('h1', {}, 'Revenue')));

  const tab = TABS.some(([value]) => value === ctx.query.tab) ? ctx.query.tab : 'summary';
  const rangeOptions = RANGE_OPTIONS.map(([value]) => value);
  let range = rangeOptions.includes(ctx.query.range)
    ? ctx.query.range
    : ctx.query.from || ctx.query.to ? 'custom' : 'this-month';
  const dates = initialDates(range, ctx.query.from, ctx.query.to);
  const rangeBar = el('div', { class: 'filters admin-revenue-range' });
  const rangeSelect = el('select', { attrs: { 'aria-label': 'Date range preset' } });
  RANGE_OPTIONS.forEach(([value, label]) => rangeSelect.appendChild(el('option', { value }, label)));
  rangeSelect.value = range;
  const from = el('input', { type: 'date', value: dates.from, attrs: { 'aria-label': 'From date' } });
  const to = el('input', { type: 'date', value: dates.to, attrs: { 'aria-label': 'To date' } });
  const applyRange = el('button', { class: 'btn soft', type: 'button' }, 'Apply range');
  rangeBar.appendChild(rangeSelect);
  rangeBar.appendChild(from);
  rangeBar.appendChild(to);
  rangeBar.appendChild(applyRange);
  screen.appendChild(rangeBar);

  const tabList = el('div', { class: 'admin-revenue-tabs', attrs: { role: 'tablist', 'aria-label': 'Revenue views' } });
  TABS.forEach(([value, label]) => {
    const button = el('button', {
      class: value === tab ? 'btn admin-filter on' : 'btn soft admin-filter',
      type: 'button',
      attrs: { role: 'tab', 'aria-selected': value === tab ? 'true' : 'false' },
    }, label);
    button.addEventListener('click', () => navigate({ tab: value, page: '1' }));
    tabList.appendChild(button);
  });
  screen.appendChild(tabList);

  const content = el('div', { class: 'admin-revenue-content' });
  screen.appendChild(content);
  const searchTimerSet = new Set();
  const exportRevokeTimers = new Set();
  const exportObjectUrls = new Set();
  ctx.onLeave(() => {
    searchTimerSet.forEach((timer) => clearTimeout(timer));
    exportRevokeTimers.forEach((timer) => clearTimeout(timer));
    exportObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  });

  function getRange() {
    return range === 'custom' ? { from: from.value, to: to.value } : initialDates(range);
  }

  function buildQuery(overrides = {}) {
    const dateRange = getRange();
    const state = {
      tab,
      range,
      from: dateRange.from,
      to: dateRange.to,
      type: ctx.query.type || 'all',
      q: ctx.query.q || '',
      page: ctx.query.page || '1',
      ...overrides,
    };
    const params = new URLSearchParams();
    Object.entries(state).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value) !== '') params.set(key, String(value));
    });
    return params;
  }

  function navigate(overrides = {}) {
    ctx.navigate('/revenue?' + buildQuery(overrides).toString());
  }

  function applyCustomRange() {
    if (!from.value || !to.value || from.value > to.value) {
      showError({ code: 'ZD-VAL-001', message: 'Choose a valid date range.' });
      return;
    }
    navigate({ range: 'custom', from: from.value, to: to.value, page: '1' });
  }

  rangeSelect.addEventListener('change', () => {
    range = rangeSelect.value;
    if (range === 'custom') return;
    const selectedDates = initialDates(range);
    navigate({ range, from: selectedDates.from, to: selectedDates.to, page: '1' });
  });
  applyRange.addEventListener('click', applyCustomRange);
  from.addEventListener('change', () => {
    if (range !== 'custom') {
      range = 'custom';
      rangeSelect.value = range;
    }
  });
  to.addEventListener('change', () => {
    if (range !== 'custom') {
      range = 'custom';
      rangeSelect.value = range;
    }
  });

  if (tab === 'summary') await renderSummary();
  else if (tab === 'transactions') await renderTransactions();
  else renderReconcile();

  async function renderSummary() {
    clear(content);
    content.appendChild(el('p', { class: 'mu' }, 'Loading revenue summary…'));
    clearError();
    const params = new URLSearchParams(getRange());
    try {
      const [summary, daily] = await Promise.all([
        apiFetch('/admin/revenue/summary?' + params.toString(), { signal: ctx.signal }),
        apiFetch('/admin/revenue/daily?' + params.toString(), { signal: ctx.signal }),
      ]);
      if (ctx.signal.aborted) return;
      clear(content);
      renderSummaryCards(summary, content);
      renderVolumeSplit(summary, content);
      renderDailyTable(Array.isArray(daily.rows) ? daily.rows : [], content);
    } catch (err) {
      if (!ctx.signal.aborted) renderPageError(content, err, renderSummary);
    }
  }

  async function renderTransactions() {
    clear(content);
    const filters = el('div', { class: 'filters admin-revenue-filters' });
    const typeSelect = el('select', { attrs: { 'aria-label': 'Transaction type' } });
    TRANSACTION_TYPES.forEach(([value, label]) => typeSelect.appendChild(el('option', { value }, label)));
    typeSelect.value = TRANSACTION_TYPES.some(([value]) => value === ctx.query.type)
      ? ctx.query.type
      : 'all';
    const search = el('input', {
      type: 'search',
      value: ctx.query.q || '',
      placeholder: 'Reference, request id or name',
      attrs: { 'aria-label': 'Search transactions' },
    });
    const exportButton = el('button', { class: 'btn soft', type: 'button' }, 'Export CSV');
    filters.appendChild(typeSelect);
    filters.appendChild(search);
    filters.appendChild(exportButton);
    content.appendChild(filters);
    const errorArea = el('div');
    content.appendChild(errorArea);
    const wrap = el('div', { class: 'table-wrap' });
    const table = el('table', { class: 'tbl' });
    const thead = el('thead');
    const header = el('tr');
    ['Date', 'Type', 'Amount', 'Commission', 'Gateway fee', 'Method', 'Reference', 'Request', 'Driver', 'Provider', 'Note']
      .forEach((label) => header.appendChild(el('th', {}, label)));
    thead.appendChild(header);
    const tbody = el('tbody');
    table.appendChild(thead);
    table.appendChild(tbody);
    wrap.appendChild(table);
    content.appendChild(wrap);
    const pager = el('div', { class: 'pager' });
    content.appendChild(pager);

    typeSelect.addEventListener('change', () => navigate({ type: typeSelect.value, page: '1' }));
    search.addEventListener('input', () => {
      searchTimerSet.forEach((timer) => clearTimeout(timer));
      searchTimerSet.clear();
      const timer = window.setTimeout(() => {
        searchTimerSet.delete(timer);
        navigate({ q: search.value.trim(), page: '1' });
      }, 400);
      searchTimerSet.add(timer);
    });

    async function loadTransactions(page = positivePage(ctx.query.page)) {
      clearError();
      const params = new URLSearchParams(getRange());
      params.set('page', String(page));
      params.set('type', typeSelect.value);
      if (search.value.trim()) params.set('q', search.value.trim());
      try {
        const data = await apiFetch('/admin/revenue/transactions?' + params.toString(), { signal: ctx.signal });
        if (ctx.signal.aborted) return;
        const transactions = Array.isArray(data.transactions) ? data.transactions : [];
        clear(errorArea);
        clear(tbody);
        if (!transactions.length) {
          tbody.appendChild(emptyRow(11, 'No transactions found.'));
        } else {
          transactions.forEach((transaction) => tbody.appendChild(transactionRow(transaction)));
        }
        renderPager(data.page || page, data.pageSize || 50, data.total || 0);
      } catch (err) {
        if (!ctx.signal.aborted) renderPageError(errorArea, err, () => loadTransactions(page));
      }
    }

    function renderPager(page, pageSize, total) {
      clear(pager);
      const pageCount = Math.max(1, Math.ceil(total / pageSize));
      const previous = el('button', { class: 'btn soft', type: 'button' }, 'Previous');
      previous.disabled = page <= 1;
      previous.addEventListener('click', () => navigate({ page: String(page - 1) }));
      const next = el('button', { class: 'btn soft', type: 'button' }, 'Next');
      next.disabled = page >= pageCount;
      next.addEventListener('click', () => navigate({ page: String(page + 1) }));
      pager.appendChild(previous);
      pager.appendChild(el('span', {}, 'Page ' + page + ' of ' + pageCount + ' (' + total + ' total)'));
      pager.appendChild(next);
    }

    exportButton.addEventListener('click', exportCsv);
    async function exportCsv() {
      const dateRange = getRange();
      if (!dateRange.from || !dateRange.to || dateRange.from > dateRange.to) {
        showError({ code: 'ZD-VAL-001', message: 'Choose a valid date range.' });
        return;
      }
      exportButton.disabled = true;
      try {
        const params = new URLSearchParams(dateRange);
        const data = await withSpinner(apiFetch('/admin/revenue/export?' + params.toString(), {
          signal: ctx.signal,
        }));
        if (ctx.signal.aborted) return;
        const blob = new Blob(['\uFEFF', data.csv], { type: 'text/csv;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        exportObjectUrls.add(objectUrl);
        const link = el('a', { href: objectUrl, download: data.filename });
        document.body.appendChild(link);
        link.click();
        link.remove();
        const timer = window.setTimeout(() => {
          URL.revokeObjectURL(objectUrl);
          exportObjectUrls.delete(objectUrl);
          exportRevokeTimers.delete(timer);
        }, 1000);
        exportRevokeTimers.add(timer);
        toast('CSV export downloaded', 'ok');
      } catch (err) {
        if (!ctx.signal.aborted) showError(err);
      } finally {
        exportButton.disabled = false;
      }
    }

    await loadTransactions();
  }

  function renderReconcile() {
    clear(content);
    const card = el('section', { class: 'card admin-reconcile-card' });
    card.appendChild(el('h2', {}, 'Financial reconciliation'));
    card.appendChild(el('p', {}, 'Compare settled payments, provider ledger entries and payouts.'));
    const runButton = el('button', { class: 'btn', type: 'button' }, 'Run check');
    const output = el('div', { class: 'admin-reconcile-output' });
    card.appendChild(runButton);
    card.appendChild(output);
    content.appendChild(card);
    runButton.addEventListener('click', runCheck);

    async function runCheck() {
      runButton.disabled = true;
      clearError();
      try {
        const data = await apiFetch('/admin/revenue/reconcile', { signal: ctx.signal });
        if (ctx.signal.aborted) return;
        clear(output);
        const issues = Array.isArray(data.issues) ? data.issues : [];
        output.appendChild(el('p', {
          class: data['ok'] ? 'admin-reconcile-ok' : 'admin-reconcile-failed',
          attrs: { role: 'status' },
        }, data['ok'] ? 'All records agree' : 'Reconciliation issues found'));
        if (data.checkedAt) {
          output.appendChild(el('p', { class: 'mu' }, 'Checked ' + (formatDate(data.checkedAt, 'datetime') || data.checkedAt)));
        }
        if (issues.length) {
          const list = el('ul', { class: 'admin-reconcile-issues' });
          issues.forEach((issue) => {
            const isInfo = issue.code === 'UNPAID_OLD';
            const item = el('li', { class: isInfo ? 'info' : 'problem' });
            item.appendChild(el('strong', {}, issue.code || 'Issue'));
            if (issue.requestId !== null && issue.requestId !== undefined) {
              item.appendChild(document.createTextNode(' '));
              item.appendChild(el('a', {
                href: '#/requests/' + encodeURIComponent(issue.requestId),
              }, 'Request #' + issue.requestId));
            }
            item.appendChild(el('p', {}, safeText(issue.detail || '')));
            list.appendChild(item);
          });
          output.appendChild(list);
        }
      } catch (err) {
        if (!ctx.signal.aborted) renderPageError(output, err, runCheck);
      } finally {
        runButton.disabled = false;
      }
    }
  }
}

function renderSummaryCards(summary, parent) {
  const registrationAndPlus = Number(summary.registrationFeesCents || 0) + Number(summary.plusRevenueCents || 0);
  const metrics = [
    ['Net revenue', summary.netRevenueCents],
    ['Gross bookings', summary.grossBookingsCents],
    ['Commission earned', summary.commissionEarnedCents],
    ['Registration and Plus fees', registrationAndPlus],
    ['Gateway fees', summary.gatewayFeesCents],
    ['Payouts made', summary.payoutsMadeCents],
    ['Owed to providers', summary.owedToProvidersCents],
    ['Owed by providers', summary.owedByProvidersCents],
  ];
  const grid = el('div', { class: 'admin-revenue-kpis' });
  metrics.forEach(([label, amount]) => {
    const card = el('section', { class: 'card admin-revenue-kpi' });
    card.appendChild(el('span', { class: 'mu' }, label));
    card.appendChild(el('strong', {}, formatZAR(Number(amount || 0))));
    if (label === 'Gateway fees' && Number(summary.unknownFeeCount) > 0) {
      card.appendChild(el('small', { class: 'admin-revenue-note' },
        Number(summary.unknownFeeCount) + ' payments had no fee data'));
    }
    grid.appendChild(card);
  });
  parent.appendChild(grid);
}

function renderVolumeSplit(summary, parent) {
  const card = el('section', { class: 'card admin-revenue-volume' });
  card.appendChild(el('h2', {}, 'Payment volume'));
  const cardCents = Number(summary.cardVolumeCents || 0);
  const offlineCents = Number(summary.offlineVolumeCents || 0);
  const total = cardCents + offlineCents;
  const cardPercent = total > 0 ? Math.round(cardCents / total * 100) : 0;
  const split = el('div', { class: 'admin-volume-bar', attrs: { role: 'img', 'aria-label': 'Card and offline payment volume split' } });
  const cardSegment = el('span', { class: 'card-volume' });
  cardSegment.style.width = cardPercent + '%';
  const offlineSegment = el('span', { class: 'offline-volume' });
  offlineSegment.style.width = (100 - cardPercent) + '%';
  split.appendChild(cardSegment);
  split.appendChild(offlineSegment);
  card.appendChild(split);
  const labels = el('div', { class: 'admin-volume-labels' });
  labels.appendChild(el('span', {}, 'Card · ' + formatZAR(cardCents)));
  labels.appendChild(el('span', {}, 'Offline · ' + formatZAR(offlineCents)));
  card.appendChild(labels);
  parent.appendChild(card);
}

function renderDailyTable(rows, parent) {
  const card = el('section', { class: 'card admin-revenue-daily' });
  card.appendChild(el('h2', {}, 'Daily totals'));
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'tbl' });
  const head = el('thead');
  const header = el('tr');
  ['Date', 'Jobs', 'Gross', 'Commission', 'Fees', 'Other revenue', 'Net revenue', 'Trend']
    .forEach((label) => header.appendChild(el('th', {}, label)));
  head.appendChild(header);
  const body = el('tbody');
  if (!rows.length) {
    body.appendChild(emptyRow(8, 'No daily totals found.'));
  } else {
    const maxNet = Math.max(1, ...rows.map((row) => Math.abs(Number(row.netCents || 0))));
    rows.forEach((row) => {
      const tr = el('tr');
      tr.appendChild(el('td', {}, row.date || '—'));
      tr.appendChild(el('td', {}, String(Number(row.jobs || 0))));
      tr.appendChild(el('td', {}, formatZAR(Number(row.grossCents || 0))));
      tr.appendChild(el('td', {}, formatZAR(Number(row.commissionCents || 0))));
      tr.appendChild(el('td', {}, formatZAR(Number(row.feesCents || 0))));
      tr.appendChild(el('td', {}, formatZAR(Number(row.otherRevenueCents || 0))));
      const net = Number(row.netCents || 0);
      tr.appendChild(el('td', { class: net < 0 ? 'admin-money-negative' : 'admin-money-positive' }, formatZAR(net)));
      const trend = el('td');
      const bars = el('div', { class: 'bars admin-revenue-bars', attrs: { 'aria-label': 'Net revenue ' + formatZAR(net) } });
      const bar = el('i', { class: net === 0 ? 'z' : '' });
      bar.style.height = Math.max(net === 0 ? 2 : 5, Math.round(Math.abs(net) / maxNet * 34)) + 'px';
      bars.appendChild(bar);
      trend.appendChild(bars);
      tr.appendChild(trend);
      body.appendChild(tr);
    });
  }
  table.appendChild(head);
  table.appendChild(body);
  wrap.appendChild(table);
  card.appendChild(wrap);
  parent.appendChild(card);
}

function transactionRow(transaction) {
  const row = el('tr');
  row.appendChild(el('td', {}, formatDate(transaction.at, 'datetime') || '—'));
  row.appendChild(el('td', {}, TYPE_LABELS[transaction.type] || transaction.type || '—'));
  const rawAmount = Number(transaction.amountCents || 0);
  const amount = transaction.type === 'payout' ? -Math.abs(rawAmount)
    : transaction.type === 'adjustment' ? rawAmount : Math.abs(rawAmount);
  row.appendChild(el('td', {
    class: amount < 0 ? 'admin-money-negative' : amount > 0 ? 'admin-money-positive' : '',
  }, (amount > 0 ? '+' : '') + formatZAR(amount)));
  row.appendChild(el('td', {}, formatZAR(Number(transaction.commissionCents || 0))));
  row.appendChild(el('td', {}, transaction.gatewayFeeCents === null
    ? '—'
    : formatZAR(Number(transaction.gatewayFeeCents || 0))));
  row.appendChild(el('td', {}, transaction.method || '—'));
  row.appendChild(el('td', {}, safeText(transaction.reference || '—')));
  const request = el('td');
  if (transaction.requestId !== null && transaction.requestId !== undefined) {
    request.appendChild(el('a', {
      href: '#/requests/' + encodeURIComponent(transaction.requestId),
    }, 'Request #' + transaction.requestId));
  } else {
    request.textContent = '—';
  }
  row.appendChild(request);
  row.appendChild(el('td', {}, safeText(transaction.driverName || '—')));
  row.appendChild(el('td', {}, safeText(transaction.providerName || '—')));
  row.appendChild(el('td', {}, safeText(transaction.note || '—')));
  return row;
}

function initialDates(range, from, to) {
  if (range === 'custom') return { from: from || '', to: to || '' };
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let start;
  if (range === 'last-month') {
    start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    end.setDate(0);
  } else if (range === 'last-7-days') {
    start = new Date(end);
    start.setDate(start.getDate() - 6);
  } else {
    start = new Date(end.getFullYear(), end.getMonth(), 1);
  }
  return { from: localDateValue(start), to: localDateValue(end) };
}

function localDateValue(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
    + '-' + String(date.getDate()).padStart(2, '0');
}

function positivePage(value) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function emptyRow(columns, message) {
  const row = el('tr');
  row.appendChild(el('td', { attrs: { colspan: columns } }, message));
  return row;
}

function safeText(value) {
  return String(value)
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[redacted]')
    .replace(/(?:\+?27[\s().-]?\d{2}[\s().-]?\d{3}[\s().-]?\d{4}|0\d{9})/g, '[redacted]')
    .replace(/\b\d{8,}\b/g, '[redacted]');
}