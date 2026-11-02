// admin/pages/users.js
import { el, clear } from '../../shared/ui.js';
import { apiFetch } from '../../shared/api.js';
import { formatPhone, formatDate } from '../../shared/ui.js';
import { showError, clearError } from '../../shared/errors.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  
  const head = el('div', { class: 'page-head' });
  head.appendChild(el('h1', {}, 'Users'));
  screen.appendChild(head);
  
  const filters = el('div', { class: 'filters' });
  
  const roleSelect = el('select', { attrs: { 'aria-label': 'Role filter' } });
  const roleOptions = [
    { value: 'all', label: 'All roles' },
    { value: 'driver', label: 'Drivers' },
    { value: 'provider', label: 'Providers' },
  ];
  for (const opt of roleOptions) {
    const option = el('option', { value: opt.value }, opt.label);
    roleSelect.appendChild(option);
  }
  filters.appendChild(roleSelect);
  
  const statusSelect = el('select', { attrs: { 'aria-label': 'Status filter' } });
  const statusOptions = [
    { value: 'all', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'suspended', label: 'Suspended' },
  ];
  for (const opt of statusOptions) {
    const option = el('option', { value: opt.value }, opt.label);
    statusSelect.appendChild(option);
  }
  filters.appendChild(statusSelect);
  
  const searchInput = el('input', { 
    type: 'text', 
    placeholder: 'Search name or phone',
    attrs: { 'aria-label': 'Search' }
  });
  filters.appendChild(searchInput);
  
  screen.appendChild(filters);
  
  const tableWrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'tbl' });
  const thead = el('thead');
  const headerRow = el('tr');
  headerRow.appendChild(el('th', {}, 'User'));
  headerRow.appendChild(el('th', {}, 'Phone'));
  headerRow.appendChild(el('th', {}, 'Role'));
  headerRow.appendChild(el('th', {}, 'Status'));
  headerRow.appendChild(el('th', {}, 'Provider status'));
  headerRow.appendChild(el('th', {}, 'Joined'));
  headerRow.appendChild(el('th', {}, 'Last login'));
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = el('tbody');
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  screen.appendChild(tableWrap);
  
  const pager = el('div', { class: 'pager' });
  screen.appendChild(pager);
  
  let searchTimeout = null;
  let currentPage = 1;
  let total = 0;
  const pageSize = 25;
  
  async function load() {
    clearError();
    const role = roleSelect.value;
    const status = statusSelect.value;
    const q = searchInput.value.trim();
    
    const params = new URLSearchParams();
    if (role !== 'all') params.set('role', role);
    if (status !== 'all') params.set('status', status);
    if (q) params.set('q', q);
    params.set('page', String(currentPage));
    
    try {
      const data = await apiFetch('/admin/users?' + params.toString());
      renderTable(data.users, data.page, data.total);
    } catch (err) {
      showError(err);
      renderTable([], 1, 0);
    }
  }
  
  function renderTable(users, page, tot) {
    clear(tbody);
    currentPage = page;
    total = tot;
    
    if (users.length === 0) {
      const tr = el('tr');
      const td = el('td', { attrs: { colspan: 7 } }, 'No users found');
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      for (const user of users) {
        const tr = el('tr');
        if (user.role === 'provider') {
          tr.classList.add('clickable');
          tr.addEventListener('click', () => {
            ctx.navigate('/providers/' + user.userId);
          });
        }
        
        const whoTd = el('td');
        const who = el('div', { class: 'who' });
        const av = el('div', { class: 'av' }, user.firstName ? user.firstName.charAt(0).toUpperCase() : '?');
        if (user.photoUrl) {
          av.style.backgroundImage = 'url(' + user.photoUrl + ')';
          av.textContent = '';
        }
        who.appendChild(av);
        who.appendChild(el('span', {}, (user.firstName || '') + ' ' + (user.lastName || '')));
        whoTd.appendChild(who);
        tr.appendChild(whoTd);
        
        tr.appendChild(el('td', {}, formatPhone(user.phone)));
        tr.appendChild(el('td', {}, user.role.charAt(0).toUpperCase() + user.role.slice(1)));
        
        const statusTd = el('td');
        const statusBadge = el('span', { class: user.status === 'suspended' ? 'badge rejected' : 'badge' }, user.status.charAt(0).toUpperCase() + user.status.slice(1));
        statusTd.appendChild(statusBadge);
        tr.appendChild(statusTd);
        
        const providerStatusTd = el('td');
        if (user.providerStatus) {
          const psBadge = el('span', { class: 'badge' }, user.providerStatus.charAt(0).toUpperCase() + user.providerStatus.slice(1));
          providerStatusTd.appendChild(psBadge);
        }
        tr.appendChild(providerStatusTd);
        
        tr.appendChild(el('td', {}, formatDate(user.createdAt, 'date')));
        tr.appendChild(el('td', {}, user.lastLoginAt ? formatDate(user.lastLoginAt, 'datetime') : 'Never'));
        
        tbody.appendChild(tr);
      }
    }
    
    renderPager();
  }
  
  function renderPager() {
    clear(pager);
    const maxPage = Math.ceil(total / pageSize) || 1;
    
    const prevBtn = el('button', { class: 'btn soft', type: 'button' }, 'Previous');
    prevBtn.disabled = currentPage <= 1;
    prevBtn.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        load();
      }
    });
    pager.appendChild(prevBtn);
    
    const info = el('span', {}, 'Page ' + currentPage + ' of ' + maxPage + ' (' + total + ' total)');
    pager.appendChild(info);
    
    const nextBtn = el('button', { class: 'btn soft', type: 'button' }, 'Next');
    nextBtn.disabled = currentPage >= maxPage;
    nextBtn.addEventListener('click', () => {
      if (currentPage < maxPage) {
        currentPage++;
        load();
      }
    });
    pager.appendChild(nextBtn);
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
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      load();
    }, 300);
  });
  
  ctx.onLeave(() => {
    if (searchTimeout) clearTimeout(searchTimeout);
  });
  
  await load();
  
  return screen;
}
