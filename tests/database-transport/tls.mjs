import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export function createDatabaseTls() {
  const openssl = process.env.MFP_TEST_OPENSSL || ['C:/Program Files/Git/usr/bin/openssl.exe', '/usr/bin/openssl'].find(existsSync) || 'openssl';
  const directory = mkdtempSync(join(tmpdir(), 'mfp-database-tls-'));
  const file = name => join(directory, name);
  const cleanup = () => {
    const target = resolve(directory);
    if (dirname(target).toLowerCase() !== resolve(tmpdir()).toLowerCase() || !/^mfp-database-tls-[A-Za-z0-9]+$/.test(basename(target)))
      throw new Error('Refusing cleanup outside the exact generated database TLS fixture directory');
    rmSync(target, { recursive: true, force: true });
  };
  const run = args => { try { execFileSync(openssl, args, { stdio: 'ignore', windowsHide: true }); } catch { throw new Error('Synthetic database certificate generation failed'); } };
  try {
    for (const prefix of ['ca', 'wrong-ca']) run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '2',
      '-subj', '/CN=MFP isolated database ' + prefix, '-keyout', file(prefix + '-key.pem'), '-out', file(prefix + '.pem'),
      '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
    run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=localhost', '-keyout', file('server-key.pem'), '-out', file('server.csr')]);
    writeFileSync(file('extensions.cnf'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost,DNS:mfp-postgres\n');
    run(['x509', '-req', '-in', file('server.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca-key.pem'), '-CAcreateserial',
      '-days', '2', '-sha256', '-extfile', file('extensions.cnf'), '-out', file('server.pem')]);
    return { directory, file, cleanup };
  } catch (error) { cleanup(); throw error; }
}
