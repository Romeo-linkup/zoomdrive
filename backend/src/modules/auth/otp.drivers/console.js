async function send({ email, code }) {
  void email;
  void code;
  return { delivered: true };
}

module.exports = { name: 'console', send };