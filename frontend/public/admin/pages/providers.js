// admin/pages/providers.js
import { el, clear } from '../../shared/ui.js';
import { apiFetch } from '../../shared/api.js';
import { formatPhone, formatDate } from '../../shared/ui.js';
import { showError, clearError } from '../../shared/errors.js';
import { createStatusBadge } from '../../shared/components/status-badge.js';

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  
  const head = el('div', { class: 'page-head' });
  head.appendChild(el('h1', {}, 'Providers'));
  screen.appendChild(head);
  
  const filters = el('div', { class: 'filters' });
  
  const statusSelect = el('select', { attrs: { 'aria-label': 'Status filter' } });
  const statusOptions = [
    { value: 'pending', label: 'Pending review' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'incomplete', label: 'Incomplete sign-ups' },
    { value: 'all', label: 'All' },
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
  headerRow.appendChild(el('th', {}, 'Provider'));
  headerRow.appendChild(el('th', {}, 'Phone'));
  headerRow.appendChild(el('th', {}, 'Type'));
  headerRow.appendChild(el('th', {}, 'Status'));
  headerRow.appendChild(el('th', {}, 'Documents'));
  headerRow.appendChild(el('th', {}, 'Submitted'));
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
  let pageSize = 25;
  
  const initialStatus = ctx.query.status || 'pending';
  statusSelect.value = initialStatus;
  
  async function load() {
    clearError();
    const status = statusSelect.value;
    const q = searchInput.value.trim();
    
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (q) params.set('q', q);
    params.set('page', String(currentPage));
    
    try {
      const data = await apiFetch('/admin/providers?' + params.toString());
      pageSize = data.pageSize || pageSize;
      renderTable(data.providers, data.page, data.total);
    } catch (err) {
      showError(err);
      renderTable([], 1, 0);
    }
  }
  
  function renderTable(providers, page, tot) {
    clear(tbody);
    currentPage = page;
    total = tot;
    
    if (providers.length === 0) {
      const tr = el('tr');
      const emptyMsg = statusSelect.value === 'pending' ? 'Nobody is waiting for review.' : 'No providers found.';
      const td = el('td', { attrs: { colspan: 6 } }, emptyMsg);
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      for (const prov of providers) {
        const tr = el('tr');
        tr.classList.add('clickable');
        tr.addEventListener('click', () => {
          ctx.navigate('/providers/' + prov.userId);
        });
        
        const whoTd = el('td');
        const who = el('div', { class: 'who' });
        const initials = prov.firstName ? prov.firstName.charAt(0).toUpperCase() : '?';
        const av = el('div', { class: 'av' }, initials);
        if (prov.photoUrl) {
          av.style.backgroundImage = 'url(' + prov.photoUrl + ')';
          av.textContent = '';
        }
        who.appendChild(av);
        const name = (prov.firstName || '') + ' ' + (prov.lastName || '');
        who.appendChild(el('span', {}, name.trim()));
        whoTd.appendChild(who);
        tr.appendChild(whoTd);
        
        tr.appendChild(el('td', {}, formatPhone(prov.phone)));
        
        const typeTd = el('td');
        const typeBadge = el('span', { class: 'badge' }, prov.providerType === 'company' ? 'Company' : 'Individual');
        typeTd.appendChild(typeBadge);
        if (prov.providerType === 'company' && prov.companyName) {
          typeTd.appendChild(document.createTextNode(' '));
          typeTd.appendChild(el('span', {}, prov.companyName));
        }
        tr.appendChild(typeTd);
        
        const statusTd = el('td');
        if (prov.status === 'incomplete') {
          statusTd.appendChild(el('span', {}, prov.status));
        } else {
          statusTd.appendChild(createStatusBadge(prov.status));
        }
        tr.appendChild(statusTd);
        
        const docsTd = el('td');
        const docsText = prov.docsApproved + ' of ' + prov.docsTotal + ' approved';
        docsTd.appendChild(el('span', {}, docsText));
        tr.appendChild(docsTd);
        
        tr.appendChild(el('td', {}, formatDate(prov.submittedAt, 'datetime')));
        
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
