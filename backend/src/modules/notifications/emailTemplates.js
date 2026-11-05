const APP_NAME = 'ZoomDrive';

function loginCode({ code, minutes }) {
  return {
    subject: `Your ${APP_NAME} code: ${code}`,
    text: `Your ${APP_NAME} code is ${code}. It expires in ${minutes} minutes. If you did not ask for it, ignore this email. Never share this code.`,
  };
}

function providerApproved({ name }) {
  return {
    subject: `Your ${APP_NAME} provider account is approved`,
    text: `Hi ${name}, your ZoomDrive provider account has been approved. You can now go online and receive job offers.`,
  };
}

function providerRejected({ name, reason }) {
  return {
    subject: `Your ${APP_NAME} provider application needs attention`,
    text: `Hi ${name}, your ZoomDrive provider application could not be approved. Reason: ${reason}. You can update your documents and resubmit.`,
  };
}

function adminAlert({ title, body }) {
  return {
    subject: `[${APP_NAME}] Admin alert: ${title}`,
    text: `${title}\n\n${body}`,
  };
}

function bankDetailsChanged({ bankName, accountLast4, changedAt }) {
  return {
    subject: 'Your payout bank details were changed',
    text: `Your payout bank details were changed.\n\nBank: ${bankName}\nAccount ending: ${accountLast4}\nChanged at: ${changedAt}\n\nIf this was not you, contact support immediately.`,
  };
}

const KINDS = {
  login_code: loginCode,
  provider_approved: providerApproved,
  provider_rejected: providerRejected,
  admin_alert: adminAlert,
  bank_details_changed: bankDetailsChanged,
};

function template(kind, data) {
  const fn = KINDS[kind];
  if (!fn) {
    return null;
  }
  return fn(data);
}

module.exports = { template, KINDS };
