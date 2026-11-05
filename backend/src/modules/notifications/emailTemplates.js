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

const KINDS = {
  login_code,
  provider_approved: providerApproved,
  provider_rejected: providerRejected,
  admin_alert: adminAlert,
};

function template(kind, data) {
  const fn = KINDS[kind];
  if (!fn) {
    return null;
  }
  return fn(data);
}

module.exports = { template, KINDS };
