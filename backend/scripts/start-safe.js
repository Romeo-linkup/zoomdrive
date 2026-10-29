const net = require('net');
const { env } = require('../src/config/env');

const port = env.PORT;

const probe = net.createServer().listen(port);

probe.once('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[ZD][BOOT][PORT_IN_USE] ${port} busy. Run: npx kill-port ${port}`);
    process.exit(1);
  } else {
    console.error(err);
    process.exit(1);
  }
});

probe.once('listening', () => {
  probe.close(() => {
    require('../src/server');
  });
});
