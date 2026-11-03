import { el, clear, formatDate, toast } from '../../shared/ui.js';
import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError, clearError } from '../../shared/errors.js';

const USER_STATUSES = [
  ['all', 'All'],
  ['active', 'Active'],
  ['suspended', 'Suspended'],
  ['deleted', 'Deleted'],
];

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    await renderUsers(ctx, screen);
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderUsers(ctx, screen) {
  const head = el('div', { class: 'page-head' });
  head.appendChild(el('h1', {}, 'Users'));
  screen.appendChild(head);

  const filters = el('div', { class: 'filters' });
  const roleSelect = el('select', { attrs: { 'aria-label': 'Role filter' } });
  [
    ['all', 'All roles'],
    ['driver', 'Drivers'],
    ['provider', 'Providers'],
  ].forEach(([value, label]) => roleSelect.appendChild(el('option', { value }, label)));
  filters.appendChild(roleSelect);

  const statusSelect = el('select', { attrs: { 'aria-label': 'Status filter' } });
  USER_STATUSES.forEach(([value, label]) => statusSelect.appendChild(el('option', { value }, label)));
  filters.appendChild(statusSelect);

  const searchInput = el('input', {
    type: 'text',
    placeholder: 'Name, email or phone',
    attrs: { 'aria-label': 'Search' },
  });
  filters.appendChild(searchInput);
  screen.appendChild(filters);

  const tableWrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'tbl' });
  const thead = el('thead');
  const headerRow = el('tr');
  ['User', 'Email', 'Role', 'Status', 'Provider status', 'Joined', 'Last login', 'Actions']
    .forEach((label) => headerRow.appendChild(el('th', {}, label)));
  thead.appendChild(headerRow);
  const tbody = el('tbody');
  table.appendChild(thead);
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  screen.appendChild(tableWrap);

  const pager = el('div', { class: 'pager' });
  screen.appendChild(pager);
  let searchTimeout = null;
  let currentPage = 1;
  let total = 0;
  const pageSize = 25;

  async function load(clearPreviousError = true) {
    if (clearPreviousError) clearError();
    const params = new URLSearchParams();
    if (roleSelect.value !== 'all') params.set('role', roleSelect.value);
    params.set('status', statusSelect.value);
    if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
    params.set('page', String(currentPage));

    try {
      const data = await apiFetch('/admin/users?' + params.toString(), { signal: ctx.signal });
      if (ctx.signal.aborted) return;
      renderTable(Array.isArray(data.users) ? data.users : [], data.page, data.total);
    } catch (err) {
      if (!ctx.signal.aborted) {
        showError(err);
        renderTable([], 1, 0);
      }
    }
  }

  function renderTable(users, page, count) {
    clear(tbody);
    currentPage = Number(page) || 1;
    total = Number(count) || 0;

    if (!users.length) {
      tbody.appendChild(emptyRow(8, 'No users found'));
    } else {
      users.forEach((user) => {
        const row = el('tr');
        if (user.role === 'provider') {
          row.classList.add('clickable');
          row.addEventListener('click', () => {
            ctx.navigate('/providers/' + encodeURIComponent(user.id));
          });
        }

        const whoCell = el('td');
        const who = el('div', { class: 'who' });
        const avatar = el('div', { class: 'av' }, user.firstName ? user.firstName.charAt(0).toUpperCase() : '?');
        if (user.photoUrl) {
          avatar.style.backgroundImage = 'url(' + user.photoUrl + ')';
          avatar.textContent = '';
        }
        who.appendChild(avatar);
        who.appendChild(el('span', {}, [user.firstName, user.lastName].filter(Boolean).join(' ') || 'User'));
        whoCell.appendChild(who);
        row.appendChild(whoCell);

        row.appendChild(el('td', {}, maskEmail(user.email)));
        row.appendChild(el('td', {}, user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : '—'));
        const statusCell = el('td');
        const statusClass = user.status === 'suspended' ? 'badge rejected'
          : user.status === 'deleted' ? 'badge off' : 'badge';
        statusCell.appendChild(el('span', { class: statusClass },
          user.status ? user.status.charAt(0).toUpperCase() + user.status.slice(1) : 'Unknown'));
        if (user.status === 'suspended' && user.suspendedReason) {
          statusCell.appendChild(el('small', { class: 'admin-user-reason' }, redactPhoneNumbers(user.suspendedReason)));
        }
        if (user.status === 'deleted' && user.deletedAt) {
          statusCell.appendChild(el('small', { class: 'admin-user-reason' }, 'Deleted ' + formatDate(user.deletedAt, 'date')));
        }
        row.appendChild(statusCell);

        const providerStatusCell = el('td');
        if (user.providerStatus) {
          providerStatusCell.appendChild(el('span', { class: 'badge' },
            user.providerStatus.charAt(0).toUpperCase() + user.providerStatus.slice(1)));
        }
        row.appendChild(providerStatusCell);
        row.appendChild(el('td', {}, formatDate(user.createdAt, 'date')));
        row.appendChild(el('td', {}, user.lastLoginAt ? formatDate(user.lastLoginAt, 'datetime') : 'Never'));

        const actions = el('td', { class: 'admin-user-actions' });
        const activity = el('button', { class: 'btn soft', type: 'button' }, 'Activity');
        activity.addEventListener('click', (event) => {
          event.stopPropagation();
          ctx.navigate('/audit?actorType=user&actorId=' + encodeURIComponent(user.id));
        });
        actions.appendChild(activity);
        if (user.status === 'active') {
          const suspend = el('button', { class: 'btn soft', type: 'button' }, 'Suspend');
          suspend.addEventListener('click', async (event) => {
            event.stopPropagation();
            await suspendUser(user);
          });
          actions.appendChild(suspend);
          appendDeleteButton(actions, user);
        } else if (user.status === 'suspended') {
          const unsuspend = el('button', { class: 'btn soft', type: 'button' }, 'Unsuspend');
          unsuspend.addEventListener('click', async (event) => {
            event.stopPropagation();
            await unsuspendUser(user);
          });
          actions.appendChild(unsuspend);
          appendDeleteButton(actions, user);
        }
        row.appendChild(actions);
        tbody.appendChild(row);
      });
    }
    renderPager();
  }

  function appendDeleteButton(parent, user) {
    const deleteButton = el('button', { class: 'btn red', type: 'button' }, 'Delete account');
    deleteButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      await deleteUser(user);
    });
    parent.appendChild(deleteButton);
  }

  function renderPager() {
    clear(pager);
    const maxPage = Math.ceil(total / pageSize) || 1;
    const previous = el('button', { class: 'btn soft', type: 'button' }, 'Previous');
    previous.disabled = currentPage <= 1;
    previous.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage -= 1;
        load();
      }
    });
    const next = el('button', { class: 'btn soft', type: 'button' }, 'Next');
    next.disabled = currentPage >= maxPage;
    next.addEventListener('click', () => {
      if (currentPage < maxPage) {
        currentPage += 1;
        load();
      }
    });
    pager.appendChild(previous);
    pager.appendChild(el('span', {}, 'Page ' + currentPage + ' of ' + maxPage + ' (' + total + ' total)'));
    pager.appendChild(next);
  }

  async function suspendUser(user) {
    const result = await reasonDialog(ctx, {
      title: 'Suspend user',
      confirmLabel: 'Suspend',
    });
    if (!result || ctx.signal.aborted) return;
    await performUserAction(user, '/suspend', { reason: result.reason }, 'User suspended');
  }

  async function unsuspendUser(user) {
    const confirmed = await confirmDialog(ctx, {
      title: 'Unsuspend user?',
      explanation: 'This will restore account access.',
      confirmLabel: 'Unsuspend',
    });
    if (!confirmed || ctx.signal.aborted) return;
    await performUserAction(user, '/unsuspend', undefined, 'User unsuspended');
  }

  async function deleteUser(user) {
    const result = await reasonDialog(ctx, {
      title: 'Delete account',
      explanation: 'This anonymises the account, deletes documents, bank details and saved places, and keeps payment records.',
      confirmLabel: 'Delete account',
      requireDelete: true,
    });
    if (!result || ctx.signal.aborted) return;
    await performUserAction(user, '/delete', {
      confirm: 'DELETE',
      reason: result.reason,
    }, 'Account deleted');
  }

  async function performUserAction(user, action, body, successMessage) {
    try {
      await apiFetch('/admin/users/' + encodeURIComponent(user.id) + action, {
        method: 'POST',
        body,
        signal: ctx.signal,
      });
      if (!ctx.signal.aborted) {
        clearError();
        toast(successMessage, 'ok');
      }
    } catch (err) {
      if (!ctx.signal.aborted) {
        if (err.code === 'ZD-ADM-009') {
          showError({ ...err, message: 'Cancel the active request first' });
        } else {
          showError(err);
        }
      }
    }
    if (!ctx.signal.aborted) await load(false);
  }

  roleSelect.addEventListener('change', () => {
    currentPage = 1;
    load();
  });
  statusSelect.addEventListener('change', () => {
    currentPage = 1;
    load();
  });
  searchInput.addEventListener('input', () => {
    if (searchTimeout !== null) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      searchTimeout = null;
      currentPage = 1;
      load();
    }, 300);
  });
  ctx.onLeave(() => {
    if (searchTimeout !== null) clearTimeout(searchTimeout);
  });
  await load();
}

function reasonDialog(ctx, { title, explanation = '', confirmLabel, requireDelete = false }) {
  if (ctx.signal.aborted) return Promise.resolve(null);
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const dialog = el('div', { class: 'modal', role: 'dialog', attrs: { 'aria-modal': 'true' } });
    dialog.appendChild(el('h3', {}, title));
    if (explanation) dialog.appendChild(el('p', {}, explanation));

    const reason = el('textarea', {
      rows: 4,
      maxLength: 200,
      attrs: { maxlength: '200', placeholder: 'Reason (at least 3 characters)', 'aria-label': 'Reason' },
    });
    dialog.appendChild(el('div', { class: 'field' }, el('label', {}, 'Reason'), reason));

    let deleteConfirmation = null;
    if (requireDelete) {
      deleteConfirmation = el('input', {
        type: 'text',
        autocomplete: 'off',
        attrs: { 'aria-label': 'Type DELETE to confirm', placeholder: 'Type DELETE' },
      });
      dialog.appendChild(el('div', { class: 'field' },
        el('label', {}, 'Type DELETE to confirm'),
        deleteConfirmation
      ));
    }

    const actions = el('div', { class: 'admin-dialog-actions' });
    const cancel = el('button', { class: 'btn soft', type: 'button' }, 'Cancel');
    const confirm = el('button', { class: 'btn red', type: 'button' }, confirmLabel);
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeyDown);
      ctx.signal.removeEventListener('abort', onAbort);
      if (backdrop.parentNode) backdrop.remove();
      resolve(result);
    }
    function updateConfirm() {
      confirm.disabled = reason.value.trim().length < 3
        || (deleteConfirmation !== null && deleteConfirmation.value !== 'DELETE');
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') close(null);
    }
    function onAbort() {
      close(null);
    }

    cancel.addEventListener('click', () => close(null));
    confirm.addEventListener('click', () => {
      updateConfirm();
      if (!confirm.disabled) close({ reason: reason.value.trim() });
    });
    reason.addEventListener('input', updateConfirm);
    if (deleteConfirmation) deleteConfirmation.addEventListener('input', updateConfirm);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(null);
    });
    document.addEventListener('keydown', onKeyDown);
    ctx.signal.addEventListener('abort', onAbort, { once: true });
    updateConfirm();
    if (ctx.signal.aborted) onAbort();
    else reason.focus();
  });
}

function confirmDialog(ctx, { title, explanation, confirmLabel }) {
  if (ctx.signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const backdrop = el('div', { class: 'modal-backdrop' });
    const dialog = el('div', { class: 'modal', role: 'dialog', attrs: { 'aria-modal': 'true' } });
    dialog.appendChild(el('h3', {}, title));
    dialog.appendChild(el('p', {}, explanation));
    const actions = el('div', { class: 'admin-dialog-actions' });
    const cancel = el('button', { class: 'btn soft', type: 'button' }, 'Cancel');
    const confirm = el('button', { class: 'btn', type: 'button' }, confirmLabel);
    actions.appendChild(cancel);
    actions.appendChild(confirm);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);

    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKeyDown);
      ctx.signal.removeEventListener('abort', onAbort);
      if (backdrop.parentNode) backdrop.remove();
      resolve(result);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') close(false);
    }
    function onAbort() {
      close(false);
    }
    cancel.addEventListener('click', () => close(false));
    confirm.addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(false);
    });
    document.addEventListener('keydown', onKeyDown);
    ctx.signal.addEventListener('abort', onAbort, { once: true });
    if (ctx.signal.aborted) onAbort();
    else confirm.focus();
  });
}

function emptyRow(columns, message) {
  const row = el('tr');
  row.appendChild(el('td', { attrs: { colspan: columns } }, message));
  return row;
}

function redactPhoneNumbers(value) {
  return String(value).replace(/(?:\+?27[\s().-]?\d{2}[\s().-]?\d{3}[\s().-]?\d{4}|0\d{9})/g, '[redacted]');
}

function maskEmail(value) {
  if (typeof value !== 'string') return '—';
  const atIndex = value.lastIndexOf('@');
  if (atIndex < 1 || atIndex === value.length - 1) return '—';
  return value[0] + '***@' + value.slice(atIndex + 1);
}
