import { execFileSync } from 'node:child_process';
import { createHash, X509Certificate } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

/** Ephemeral test trust only: never imports a certificate into an OS/browser store. */
export function createFixtureTls() {
  const executable = process.env.MFP_TEST_OPENSSL || [
    'C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe', '/usr/bin/openssl',
  ].find(existsSync) || 'openssl';
  const directory = mkdtempSync(join(tmpdir(), 'mfp-oidc-tls-'));
  const cleanup = () => {
    const target = resolve(directory), parent = resolve(tmpdir());
    if (dirname(target).toLowerCase() !== parent.toLowerCase() || !/^mfp-oidc-tls-[A-Za-z0-9]+$/.test(basename(target)))
      throw new Error('Refusing cleanup outside the exact generated fixture temporary directory');
    rmSync(target, { recursive: true, force: true });
  };
  const file = name => join(directory, name);
  const run = args => {
    try { execFileSync(executable, args, { stdio: 'ignore', windowsHide: true }); }
    catch { throw new Error('Isolated HTTPS certificate generation failed. Supply MFP_TEST_OPENSSL when OpenSSL is not on PATH.'); }
  };
  try {
    run(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '2', '-subj', '/CN=MFP ephemeral test CA',
      '-keyout', file('ca-key.pem'), '-out', file('ca.pem'), '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign']);
    run(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-subj', '/CN=MFP isolated HTTPS fixture',
      '-keyout', file('server-key.pem'), '-out', file('server.csr')]);
    writeFileSync(file('extensions.cnf'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.2,IP:127.0.0.3\n');
    run(['x509', '-req', '-in', file('server.csr'), '-CA', file('ca.pem'), '-CAkey', file('ca-key.pem'), '-CAcreateserial',
      '-days', '2', '-sha256', '-extfile', file('extensions.cnf'), '-out', file('server.pem')]);
    const certificate = new X509Certificate(readFileSync(file('server.pem')));
    const spki = createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
    return { directory, ca: file('ca.pem'), key: file('server-key.pem'), cert: file('server.pem'), spki,
      cleanup };
  } catch (error) { cleanup(); throw error; }
}
