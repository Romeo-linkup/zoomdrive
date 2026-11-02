import { apiFetch } from '../../shared/api.js';
import { renderPageError, showError } from '../../shared/errors.js';
import { createField } from '../../shared/components/field.js';
import { createTopbar } from '../../shared/components/topbar.js';
import { el, clear, formatDate, toast } from '../../shared/ui.js';

const ACCOUNT_TYPES = [
  { value: 'cheque', label: 'Cheque' },
  { value: 'savings', label: 'Savings' },
  { value: 'transmission', label: 'Transmission' },
];

export default async function render(ctx) {
  const screen = el('div', { class: 'screen' });
  try {
    await renderPayoutMethods(ctx, screen);
    return screen;
  } catch (err) {
    renderPageError(screen, err, () => ctx.navigate(ctx.path));
    return screen;
  }
}

async function renderPayoutMethods(ctx, screen) {
  screen.appendChild(createTopbar({ title: 'Payout methods', onBack: () => ctx.navigate('/menu') }));
  const summary = el('div');
  const formCard = el('div', { class: 'card hidden' });
  screen.appendChild(summary);
  screen.appendChild(formCard);
  let savedDetails = null;
  let saving = false;

  const accountHolder = createField({
    name: 'accountHolder',
    label: 'Account holder',
    placeholder: 'Name on the account',
    maxlength: 80,
    autocomplete: 'name',
  });
  const bankName = createField({
    name: 'bankName',
    label: 'Bank name',
    placeholder: 'Bank',
    maxlength: 60,
    autocomplete: 'off',
  });
  const accountType = createField({
    name: 'accountType',
    label: 'Account type',
  });
  const accountTypeSelect = el('select', { id: 'f-accountType', attrs: { autocomplete: 'off' } });
  ACCOUNT_TYPES.forEach((type) => accountTypeSelect.appendChild(el('option', { value: type.value }, type.label)));
  accountType.input.replaceWith(accountTypeSelect);

  const branchCode = createField({
    name: 'branchCode',
    label: 'Branch code',
    placeholder: '6 digits',
    inputmode: 'numeric',
    maxlength: 6,
    autocomplete: 'off',
  });
  const accountNumber = createField({
    name: 'accountNumber',
    label: 'Account number',
    placeholder: 'Enter account number',
    inputmode: 'numeric',
    autocomplete: 'off',
  });

  function populateForm(details = null) {
    accountHolder.setValue(details && details.accountHolder);
    bankName.setValue(details && details.bankName);
    accountTypeSelect.value = details && details.accountType ? details.accountType : 'cheque';
    branchCode.setValue(details && details.branchCode);
    accountNumber.setValue('');
  }

  function renderSaved(details) {
    savedDetails = details && details.saved ? details : null;
    clear(summary);
    if (!savedDetails) {
      summary.classList.add('hidden');
      return;
    }
    summary.classList.remove('hidden');
    const card = el('div', { class: 'card' });
    card.appendChild(el('h2', {}, 'Account ending ' + savedDetails.accountLast4));
    card.appendChild(el('p', {}, savedDetails.bankName));
    card.appendChild(el('p', {}, savedDetails.accountHolder + ' · ' +
      accountTypeLabel(savedDetails.accountType)));
    card.appendChild(el('p', { class: 'mu' }, 'Updated ' + formatDate(savedDetails.updatedAt, 'date')));
    const edit = el('button', { class: 'btn soft', type: 'button' }, 'Edit');
    edit.addEventListener('click', () => {
      populateForm(savedDetails);
      formCard.classList.remove('hidden');
    });
    card.appendChild(edit);
    summary.appendChild(card);
  }

  function showForm() {
    formCard.classList.remove('hidden');
    clear(formCard);
    formCard.appendChild(el('h2', {}, savedDetails ? 'Update bank details' : 'Add payout bank details'));
    formCard.appendChild(accountHolder.el);
    formCard.appendChild(bankName.el);
    formCard.appendChild(accountType.el);
    formCard.appendChild(branchCode.el);
    formCard.appendChild(accountNumber.el);
    formCard.appendChild(el('p', { class: 'mu' }, 'Payouts are made by EFT, usually weekly.'));
    formCard.appendChild(el('p', { class: 'mu' }, 'We notify you whenever these details change.'));
    const save = el('button', { class: 'btn', type: 'button' }, 'Save bank details');
    save.addEventListener('click', saveDetails);
    formCard.appendChild(save);
    if (savedDetails) {
      const cancel = el('button', { class: 'btn soft', type: 'button' }, 'Cancel');
      cancel.addEventListener('click', () => formCard.classList.add('hidden'));
      formCard.appendChild(cancel);
    }
  }

  async function loadDetails() {
    const data = await apiFetch('/providers/me/bank-details', { signal: ctx.signal });
    if (ctx.signal.aborted) return;
    renderSaved(data);
    if (!data.saved) showForm();
  }

  async function saveDetails() {
    if (saving) return;
    saving = true;
    [accountHolder, bankName, accountType, branchCode, accountNumber].forEach((field) => field.clearError());
    const pending = apiFetch('/providers/me/bank-details', {
      method: 'PUT',
      body: {
        accountHolder: accountHolder.getValue(),
        bankName: bankName.getValue(),
        accountType: accountTypeSelect.value,
        branchCode: branchCode.getValue(),
        accountNumber: accountNumber.getValue(),
      },
      signal: ctx.signal,
    });
    accountNumber.setValue('');
    try {
      const result = await pending;
      if (ctx.signal.aborted) return;
      renderSaved(result);
      formCard.classList.add('hidden');
      populateForm(result);
      toast('Payout bank details saved', 'ok');
    } catch (err) {
      if (!ctx.signal.aborted) showError(err);
    } finally {
      saving = false;
    }
  }

  await loadDetails();
}

function accountTypeLabel(value) {
  const type = ACCOUNT_TYPES.find((item) => item.value === value);
  return type ? type.label : value;
}
