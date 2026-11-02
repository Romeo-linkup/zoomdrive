let paymentReference = null;

export function capturePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  paymentReference = params.get('reference') || params.get('trxref') || null;
  if (paymentReference) {
    history.replaceState(null, '', location.pathname + location.hash);
    location.hash = '#/registration-fee';
  }
}

export function consumePaymentReference() {
  const reference = paymentReference;
  paymentReference = null;
  return reference;
}
