// Fixture-only HTTP transport around the actual hosted entry. No duplicate app composition.
import { createServer } from 'node:http';
if (process.env.MFP_APP_ORIGIN !== 'https://127.0.0.2:54440' ||
    !/^\/mfp_hosting_[a-f0-9]{32}_test$/.test(new URL(process.env.DATABASE_URL!).pathname))
  throw new Error('Invalid isolated hosting fixture binding');
const { default: app } = await import('../../app.js');
const server = createServer(app);
server.listen(54442, '127.0.0.1', () => console.log('MFP_TEST_HOSTING_HANDLER_READY'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
