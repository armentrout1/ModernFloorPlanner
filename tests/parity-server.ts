import { createServer } from 'node:http';
import { build } from 'esbuild';

// Bundle only the real shared engine into memory; never write a diagnostic page
// or bundle into production dist/public and never load database configuration.
const bundle = await build({
  entryPoints: ['tests/parity/browser-entry.ts'], bundle: true, write: false,
  platform: 'browser', format: 'iife', target: 'es2022',
});
const javascript = bundle.outputFiles[0].contents;
const html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>M2C local parity</title>'
  + '<h1>Quantity engine acceptance</h1><p id="status">Loading shared engine</p><script src="/parity.js"></script></html>';
createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') { response.writeHead(405); response.end(); return; }
  if (request.url === '/health') { response.writeHead(200, { 'Content-Type': 'text/plain' }); response.end('ready'); }
  else if (request.url === '/') { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end(html); }
  else if (request.url === '/parity.js') { response.writeHead(200, { 'Content-Type': 'application/javascript' }); response.end(javascript); }
  else { response.writeHead(404); response.end(); }
}).listen(4174, '127.0.0.1', () => console.log('M2C test-only parity listening on loopback:4174'));
