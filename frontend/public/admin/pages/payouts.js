import { apiFetch } from '../../shared/api.js';
import { clearError, clearFieldErrors, renderPageError, showError } from '../../shared/errors.js';
import { clear, el, formatDate, formatPhone, formatZAR, modal, toast, withSpinner } from '../../shared/ui.js';

const ENTRY_LABELS = {
  earning: 'Card earning',
  commission: 'Cash commission',
  payout: 'Payout',
  adjustment: 'Adjustment',
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'owed', label: 'Owed to providers' },
  { value: 'owing', label: 'Owing ZoomDrive' },
];

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    if (ctx.params.providerId) {
      await renderProviderDetail(ctx, screen);
    } else {
      await renderProviderList(ctx, screen);
    }
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderProviderList(ctx, screen) {
  screen.appendChild(pageHeading('Payouts'));
  const filters = el('div', { class: 'filters admin-payout-filters' });
  screen.appendChild(filters);
  const rowsWrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'tbl' });
  const head = el('thead');
  const header = el('tr');
  ['Provider', 'Balance', 'Jobs', 'Last payout', 'Bank details'].forEach((label) => {
    header.appendChild(el('th', {}, label));
  });
  head.appendChild(header);
  const tbody = el('tbody');
  table.appendChild(head);
  table.appendChild(tbody);
  rowsWrap.appendChild(table);
  screen.appendChild(rowsWrap);
  const pager = el('div', { class: 'pager' });
  screen.appendChild(pager);

  let filter = ctx.query.filter || 'all';
  if (!FILTERS.some((item) => item.value === filter)) filter = 'all';
  let currentPage = 1;
  let pageSize = 25;
  let total = 0;
  let searchTimer = null;
  const exportRevokeTimers = new Set();
  const exportObjectUrls = new Set();
  const search = el('input', {
    type: 'search',
    placeholder: 'Search name or phone',
    attrs: { 'aria-label': 'Search providers' },
  });
  search.value = ctx.query.q || '';

  const from = el('input', { type: 'date', attrs: { 'aria-label': 'Export from date' } });
  const to = el('input', { type: 'date', attrs: { 'aria-label': 'Export to date' } });
  const today = new Date();
  to.value = localDateValue(today);
  const firstDay = new Date(today);
  firstDay.setDate(firstDay.getDate() - 30);
  from.value = localDateValue(firstDay);
  const exportButton = el('button', { class: 'btn soft', type: 'button' }, 'Export CSV');

  function renderFilters() {
    clear(filters);
    FILTERS.forEach((item) => {
      const button = el('button', {
        class: filter === item.value ? 'btn admin-filter on' : 'btn soft admin-filter',
        type: 'button',
        attrs: { 'aria-pressed': filter === item.value ? 'true' : 'false' },
      }, item.label);
      button.addEventListener('click', () => {
        filter = item.value;
        currentPage = 1;
        renderFilters();
        load();
      });
      filters.appendChild(button);
    });
    filters.appendChild(search);
    const exportGroup = el('div', { class: 'admin-export-controls' });
    exportGroup.appendChild(from);
    exportGroup.appendChild(to);
    exportGroup.appendChild(exportButton);
    filters.appendChild(exportGroup);
  }

  function renderRows(providers) {
    clear(tbody);
    if (!providers.length) {
      tbody.appendChild(emptyRow(5, 'No providers found.'));
      return;
    }
    providers.forEach((provider) => {
      const row = el('tr', { class: 'clickable' });
      row.addEventListener('click', () => ctx.navigate('/payouts/' + encodeURIComponent(provider.providerId)));
      const nameCell = el('td');
      nameCell.appendChild(el('strong', {}, [provider.firstName, provider.lastName].filter(Boolean).join(' ')));
      if (provider.companyName) nameCell.appendChild(el('small', { class: 'admin-company-name' }, provider.companyName));
      row.appendChild(nameCell);

      const balanceCell = el('td');
      balanceCell.appendChild(el('strong', {
        class: provider.balanceCents > 0 ? 'admin-money-positive' :
          provider.balanceCents < 0 ? 'admin-money-negative' : '',
      }, formatZAR(provider.balanceCents)));
      row.appendChild(balanceCell);
      row.appendChild(el('td', {}, String(provider.jobsCount)));
      row.appendChild(el('td', {}, provider.lastPayoutAt ? formatDate(provider.lastPayoutAt, 'date') : '—'));
      const bankCell = el('td');
      bankCell.appendChild(provider.hasBankDetails
        ? el('span', { class: 'badge' }, 'Saved')
        : el('span', { class: 'badge rejected' }, 'No bank details'));
      row.appendChild(bankCell);
      tbody.appendChild(row);
    });
  }

  function renderPager() {
    clear(pager);
    const pageCount = Math.max(1, Math.ceil(total / pageSize));
    const previous = el('button', { class: 'btn soft', type: 'button' }, 'Previous');
    previous.disabled = currentPage <= 1;
    previous.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage -= 1;
        load();
      }
    });
    const next = el('button', { class: 'btn soft', type: 'button' }, 'Next');
    next.disabled = currentPage >= pageCount;
    next.addEventListener('click', () => {
      if (currentPage < pageCount) {
        currentPage += 1;
        load();
      }
    });
    pager.appendChild(previous);
    pager.appendChild(el('span', {}, 'Page ' + currentPage + ' of ' + pageCount + ' (' + total + ' total)'));
    pager.appendChild(next);
  }

  async function load() {
    clearError();
    const params = new URLSearchParams();
    params.set('filter', filter);
    params.set('page', String(currentPage));
    if (search.value.trim()) params.set('q', search.value.trim());
    try {
      const data = await apiFetch('/admin/payouts?' + params.toString(), { signal: ctx.signal });
      if (ctx.signal.aborted) return;
      pageSize = data.pageSize || pageSize;
      currentPage = data.page || currentPage;
      total = data.total || 0;
      renderRows(Array.isArray(data.providers) ? data.providers : []);
      renderPager();
    } catch (err) {
      if (!ctx.signal.aborted) {
        showError(err);
        renderRows([]);
        total = 0;
        renderPager();
      }
    }
  }

  async function exportCsv() {
    if (!from.value || !to.value || from.value > to.value) {
      showError({ code: 'ZD-VAL-001', message: 'Choose a valid export date range.' });
      return;
    }
    exportButton.disabled = true;
    try {
      const params = new URLSearchParams({ from: from.value, to: to.value });
      const data = await withSpinner(apiFetch('/admin/payouts/export?' + params.toString(), {
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
      const revokeTimer = window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        exportObjectUrls.delete(objectUrl);
        exportRevokeTimers.delete(revokeTimer);
      }, 1000);
      exportRevokeTimers.add(revokeTimer);
      toast('CSV export downloaded', 'ok');
    } catch (err) {
      if (!ctx.signal.aborted) showError(err);
    } finally {
      exportButton.disabled = false;
    }
  }

  search.addEventListener('input', () => {
    if (searchTimer !== null) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchTimer = null;
      currentPage = 1;
      load();
    }, 400);
  });
  exportButton.addEventListener('click', exportCsv);
  renderFilters();
  ctx.onLeave(() => {
    if (searchTimer !== null) clearTimeout(searchTimer);
    exportRevokeTimers.forEach((timer) => clearTimeout(timer));
    exportObjectUrls.forEach((objectUrl) => URL.revokeObjectURL(objectUrl));
  });
  await load();
}

async function renderProviderDetail(ctx, screen) {
  const providerId = encodeURIComponent(ctx.params.providerId);
  const back = el('a', { href: '#/payouts', class: 'link-btn' }, '← Payouts');
  screen.appendChild(back);
  const content = el('div');
  screen.appendChild(content);
  let revealTimer = null;
  let revealedNumber = null;
  let busy = false;

  function hideAccountNumber() {
    if (revealTimer !== null) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }
    if (revealedNumber) {
      clear(revealedNumber);
      revealedNumber = null;
    }
  }

  async function loadDetail() {
    hideAccountNumber();
    clearError();
    try {
      const data = await apiFetch('/admin/payouts/' + providerId, { signal: ctx.signal });
      if (!ctx.signal.aborted) renderDetail(data);
    } catch (err) {
      if (ctx.signal.aborted) return;
      showError(err);
      renderPageError(content, err, loadDetail);
    }
  }

  function renderDetail(data) {
    hideAccountNumber();
    clear(content);
    const provider = data.provider;
    const heading = el('div', { class: 'detail-head' });
    const identity = el('div');
    identity.appendChild(el('h1', {}, [provider.firstName, provider.lastName].filter(Boolean).join(' ')));
    if (provider.companyName) identity.appendChild(el('div', { class: 'mu' }, provider.companyName));
    identity.appendChild(el('div', {}, formatPhone(provider.phone)));
    heading.appendChild(identity);
    heading.appendChild(el('strong', {
      class: data.balanceCents > 0 ? 'admin-money-positive' :
        data.balanceCents < 0 ? 'admin-money-negative' : '',
    }, 'Balance: ' + formatZAR(data.balanceCents)));
    content.appendChild(heading);

    if (data.bank && data.bank.saved) {
      const bankCard = el('section', { class: 'card admin-bank-card' });
      bankCard.appendChild(el('h2', {}, 'Payout bank details'));
      const bankInfo = el('dl', { class: 'kv' });
      appendKv(bankInfo, 'Bank', data.bank.bankName);
      appendKv(bankInfo, 'Account holder', data.bank.accountHolder);
      appendKv(bankInfo, 'Account type', data.bank.accountType);
      appendKv(bankInfo, 'Branch code', data.bank.branchCode);
      appendKv(bankInfo, 'Account number', 'Account ending ' + data.bank.accountLast4);
      appendKv(bankInfo, 'Updated', formatDate(data.bank.updatedAt, 'datetime'));
      bankCard.appendChild(bankInfo);
      if (data.bank.recentlyChanged) {
        bankCard.appendChild(el('div', { class: 'banner warn' },
          'Bank details were changed on ' + formatDate(data.bank.updatedAt, 'date') +
          '. Confirm with the provider by phone before paying.'));
      }
      const revealArea = el('div', { class: 'admin-reveal-area' });
      const revealButton = el('button', { class: 'btn soft', type: 'button' }, 'Show account number');
      revealButton.addEventListener('click', () => revealBankNumber(revealButton, revealArea));
      bankCard.appendChild(revealButton);
      bankCard.appendChild(revealArea);
      content.appendChild(bankCard);
    } else {
      content.appendChild(el('div', { class: 'banner warn' }, 'No payout bank details saved.'));
    }

    renderPayoutForm(data, provider, content);
    renderAdjustmentForm(provider, content);
    renderLedger(data.entries || [], content);
    renderPayoutHistory(data.payouts || [], content);
  }

  async function revealBankNumber(button, area) {
    if (revealedNumber) {
      hideAccountNumber();
      button.textContent = 'Show account number';
      return;
    }
    button.disabled = true;
    try {
      const data = await apiFetch('/admin/payouts/' + providerId + '/bank-details', { signal: ctx.signal });
      if (ctx.signal.aborted) return;
      const row = el('div', { class: 'admin-bank-number-row' });
      const number = el('code', { class: 'admin-bank-number' });
      number.textContent = data.accountNumber;
      const copy = el('button', { class: 'btn soft', type: 'button' }, 'Copy');
      copy.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(number.textContent);
          toast('Account number copied', 'ok');
        } catch (err) {
          toast('Could not copy the account number.', 'error');
        }
      });
      row.appendChild(number);
      row.appendChild(copy);
      area.appendChild(row);
      revealedNumber = area;
      button.textContent = 'Hide account number';
      revealTimer = setTimeout(() => {
        hideAccountNumber();
        button.textContent = 'Show account number';
      }, 30000);
    } catch (err) {
      if (!ctx.signal.aborted) showError(err);
    } finally {
      button.disabled = false;
    }
  }

  function renderPayoutForm(data, provider, parent) {
    const card = el('section', { class: 'card settings-form' });
    card.appendChild(el('h2', {}, 'Record payout'));
    const amount = inputField('payout-amount', 'Amount (R)', 'number');
    amount.input.step = '0.01';
    amount.input.min = '0.01';
    amount.input.value = data.balanceCents > 0 ? (data.balanceCents / 100).toFixed(2) : '';
    const method = selectField('payout-method', 'Method', [
      ['eft', 'EFT'],
      ['cash', 'Cash'],
      ['other', 'Other'],
    ]);
    const reference = inputField('reference', 'Reference', 'text');
    reference.input.maxLength = 60;
    const note = inputField('payout-note', 'Note (optional)', 'text');
    note.input.maxLength = 200;
    [amount.wrapper, method.wrapper, reference.wrapper, note.wrapper].forEach((field) => card.appendChild(field));
    const submit = el('button', { class: 'btn', type: 'button' }, 'Record payout');
    submit.addEventListener('click', async () => {
      if (busy) return;
      clearFieldErrors(card);
      const amountValue = Number(amount.input.value);
      const amountCents = Math.round(amountValue * 100);
      if (!Number.isFinite(amountValue) || amountValue <= 0 ||
          Math.abs(amountValue * 100 - amountCents) > 0.000001) {
        setFieldError(amount.wrapper, 'Enter an amount in rands with up to two decimal places.');
        return;
      }
      if (reference.input.value.trim().length < 3) {
        setFieldError(reference.wrapper, 'Reference must be at least 3 characters.');
        return;
      }
      const confirmed = await modal({
        title: 'Confirm payout',
        body: el('p', {}, formatZAR(amountCents) + ' to ' +
          [provider.firstName, provider.lastName].filter(Boolean).join(' ') +
          ' using ' + method.select.value.toUpperCase() + ' (reference: ' + reference.input.value.trim() + ')'),
        actions: [
          { label: 'Cancel', kind: 'soft', value: false },
          { label: 'Record payout', kind: 'primary', value: true },
        ],
      });
      if (!confirmed) return;
      busy = true;
      submit.disabled = true;
      clearError();
      try {
        await withSpinner(apiFetch('/admin/payouts/' + providerId, {
          method: 'POST',
          body: {
            amountCents,
            method: method.select.value,
            reference: reference.input.value.trim(),
            note: note.input.value.trim() || undefined,
          },
          signal: ctx.signal,
        }));
        if (ctx.signal.aborted) return;
        toast('Payout recorded', 'ok');
        await loadDetail();
      } catch (err) {
        if (ctx.signal.aborted) return;
        if (err.code === 'ZD-PAY-007' && err.details) {
          showError({
            code: err.code,
            message: 'That is more than the balance of ' + formatZAR(err.details.balanceCents),
            requestId: err.requestId,
          });
        } else {
          showError(err);
        }
      } finally {
        busy = false;
        submit.disabled = false;
      }
    });
    card.appendChild(submit);
    parent.appendChild(card);
  }

  function renderAdjustmentForm(provider, parent) {
    const card = el('section', { class: 'card settings-form' });
    card.appendChild(el('h2', {}, 'Adjustment'));
    const amount = inputField('adjustment-amount', 'Signed amount (R)', 'number');
    amount.input.step = '0.01';
    amount.input.placeholder = 'For example, -25.00 or 25.00';
    const note = inputField('adjustment-note', 'Reason', 'text');
    note.input.maxLength = 200;
    card.appendChild(amount.wrapper);
    card.appendChild(note.wrapper);
    const submit = el('button', { class: 'btn soft', type: 'button' }, 'Record adjustment');
    submit.addEventListener('click', async () => {
      if (busy) return;
      clearFieldErrors(card);
      const amountValue = Number(amount.input.value);
      const amountCents = Math.round(amountValue * 100);
      if (!Number.isFinite(amountValue) || amountValue === 0 ||
          Math.abs(amountValue * 100 - amountCents) > 0.000001) {
        setFieldError(amount.wrapper, 'Enter a non-zero signed amount in rands with up to two decimal places.');
        return;
      }
      if (note.input.value.trim().length < 3) {
        setFieldError(note.wrapper, 'Enter a reason of at least 3 characters.');
        return;
      }
      const confirmed = await modal({
        title: 'Confirm adjustment',
        body: el('p', {}, formatZAR(amountCents) + ' for ' +
          [provider.firstName, provider.lastName].filter(Boolean).join(' ') +
          '. Reason: ' + note.input.value.trim()),
        actions: [
          { label: 'Cancel', kind: 'soft', value: false },
          { label: 'Record adjustment', kind: 'primary', value: true },
        ],
      });
      if (!confirmed) return;
      busy = true;
      submit.disabled = true;
      clearError();
      try {
        await withSpinner(apiFetch('/admin/payouts/' + providerId + '/adjustment', {
          method: 'POST',
          body: { amountCents, note: note.input.value.trim() },
          signal: ctx.signal,
        }));
        if (ctx.signal.aborted) return;
        toast('Adjustment recorded', 'ok');
        await loadDetail();
      } catch (err) {
        if (!ctx.signal.aborted) showError(err);
      } finally {
        busy = false;
        submit.disabled = false;
      }
    });
    card.appendChild(submit);
    parent.appendChild(card);
  }

  function renderLedger(entries, parent) {
    const section = el('section', { class: 'card' });
    section.appendChild(el('h2', {}, 'Ledger'));
    const wrap = el('div', { class: 'table-wrap' });
    const table = el('table', { class: 'tbl' });
    appendTableHeader(table, ['Date', 'Type', 'Amount', 'Note', 'Request']);
    const tbody = el('tbody');
    if (!entries.length) {
      tbody.appendChild(emptyRow(5, 'No ledger entries yet.'));
    } else {
      entries.forEach((entry) => {
        const row = el('tr');
        row.appendChild(el('td', {}, formatDate(entry.createdAt, 'datetime')));
        row.appendChild(el('td', {}, ENTRY_LABELS[entry.type] || entry.type));
        row.appendChild(el('td', { class: entry.amountCents > 0 ? 'admin-money-positive' :
          entry.amountCents < 0 ? 'admin-money-negative' : '' },
        (entry.amountCents > 0 ? '+' : '') + formatZAR(entry.amountCents)));
        row.appendChild(el('td', {}, entry.note || '—'));
        row.appendChild(el('td', {}, entry.requestId || '—'));
        tbody.appendChild(row);
      });
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    parent.appendChild(section);
  }

  function renderPayoutHistory(payouts, parent) {
    const section = el('section', { class: 'card' });
    section.appendChild(el('h2', {}, 'Payout history'));
    const wrap = el('div', { class: 'table-wrap' });
    const table = el('table', { class: 'tbl' });
    appendTableHeader(table, ['Date', 'Amount', 'Method', 'Reference']);
    const tbody = el('tbody');
    if (!payouts.length) {
      tbody.appendChild(emptyRow(4, 'No payouts recorded yet.'));
    } else {
      payouts.forEach((payout) => {
        const row = el('tr');
        row.appendChild(el('td', {}, formatDate(payout.paidAt, 'datetime')));
        row.appendChild(el('td', {}, formatZAR(payout.amountCents)));
        row.appendChild(el('td', {}, payout.method.toUpperCase()));
        row.appendChild(el('td', {}, payout.reference));
        tbody.appendChild(row);
      });
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);
    parent.appendChild(section);
  }

  ctx.onLeave(() => {
    hideAccountNumber();
    clear(content);
  });
  await loadDetail();
}

function pageHeading(title) {
  const head = el('div', { class: 'page-head' });
  head.appendChild(el('h1', {}, title));
  return head;
}

function inputField(name, label, type) {
  const wrapper = el('div', { class: 'field', dataset: { field: name } });
  const input = el('input', { type, attrs: { 'aria-label': label } });
  wrapper.appendChild(el('label', {}, label));
  wrapper.appendChild(input);
  return { wrapper, input };
}

function selectField(name, label, options) {
  const wrapper = el('div', { class: 'field', dataset: { field: name } });
  const select = el('select', { attrs: { 'aria-label': label } });
  options.forEach(([value, text]) => select.appendChild(el('option', { value }, text)));
  wrapper.appendChild(el('label', {}, label));
  wrapper.appendChild(select);
  return { wrapper, select };
}

function setFieldError(field, message) {
  field.classList.add('has-error');
  field.appendChild(el('div', { class: 'field-error' }, message));
}

function appendKv(list, label, value) {
  list.appendChild(el('dt', {}, label));
  list.appendChild(el('dd', {}, value || '—'));
}

function appendTableHeader(table, labels) {
  const head = el('thead');
  const row = el('tr');
  labels.forEach((label) => row.appendChild(el('th', {}, label)));
  head.appendChild(row);
  table.appendChild(head);
}

function emptyRow(columns, message) {
  const row = el('tr');
  row.appendChild(el('td', { attrs: { colspan: columns } }, message));
  return row;
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}