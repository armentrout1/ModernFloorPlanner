import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

const MAX_TOOL_OUTPUT = 1024 * 1024;

function executable(name) {
  const configured = process.env.MFP_PG_BIN;
  if (!configured) return name;
  return join(resolve(configured), process.platform === 'win32' ? `${name}.exe` : name);
}

function collect(stream, chunks, size) {
  stream.on('data', chunk => {
    if (size.value < MAX_TOOL_OUTPUT) {
      chunks.push(chunk.subarray(0, MAX_TOOL_OUTPUT - size.value));
      size.value += chunk.length;
    }
  });
}

export async function runPgTool(name, args, options = {}) {
  const env = { ...process.env };
  const finalArgs = [...args];
  if (options.databaseUrl) {
    const parsed = new URL(options.databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('PostgreSQL URL required');
    if (!parsed.pathname || parsed.pathname === '/') throw new Error('Explicit PostgreSQL database name required');
    if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
    parsed.password = '';
    finalArgs.push(`--dbname=${parsed.toString()}`);
  }
  const stdout = [], stderr = [], stdoutSize = { value: 0 }, stderrSize = { value: 0 };
  const child = spawn(executable(name), finalArgs, {
    cwd: options.cwd,
    env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  collect(child.stdout, stdout, stdoutSize);
  collect(child.stderr, stderr, stderrSize);
  const result = await new Promise((resolvePromise, reject) => {
    child.once('error', reject);
    child.once('close', code => resolvePromise({
      code,
      stdout: Buffer.concat(stdout).toString('utf8').trim(),
      stderr: Buffer.concat(stderr).toString('utf8').trim(),
    }));
  });
  if (result.code !== 0) {
    const detail = result.stderr || result.stdout || `exit code ${result.code}`;
    throw new Error(`${name} failed: ${detail}`);
  }
  return result;
}

function assertOutsideRepository(directory, repositoryRoot) {
  const destination = resolve(directory), root = resolve(repositoryRoot);
  const pathFromRoot = relative(root, destination);
  if (!pathFromRoot || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot))) {
    throw new Error('Backup output must be outside the repository');
  }
  return destination;
}

export async function createDatabaseBackup({ databaseUrl, outputDirectory, repositoryRoot = process.cwd() }) {
  if (!databaseUrl) throw new Error('Explicit backup database URL required');
  if (!outputDirectory) throw new Error('Explicit backup output directory required');
  const parsed = new URL(databaseUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) throw new Error('PostgreSQL URL required');
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!/^[a-zA-Z0-9_-]{1,63}$/.test(databaseName)) throw new Error('Safe explicit database name required');
  const destination = assertOutsideRepository(outputDirectory, repositoryRoot);
  await mkdir(destination, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const token = randomBytes(4).toString('hex');
  const backupPath = join(destination, `${databaseName}-${timestamp}-${token}.dump`);
  await runPgTool('pg_dump', ['--format=custom', '--compress=9', `--file=${backupPath}`], { databaseUrl });
  const backupStat = await stat(backupPath);
  if (!backupStat.isFile() || backupStat.size === 0) throw new Error('pg_dump produced an empty backup');
  const listing = await runPgTool('pg_restore', ['--list', backupPath]);
  if (!listing.stdout.includes('TABLE DATA')) throw new Error('Backup catalog contains no table data');
  const digest = createHash('sha256').update(await readFile(backupPath)).digest('hex');
  const version = await runPgTool('pg_dump', ['--version']);
  const manifestPath = `${backupPath}.manifest.json`;
  const manifest = {
    format: 'postgresql-custom',
    database: databaseName,
    createdAt: new Date().toISOString(),
    file: basename(backupPath),
    bytes: backupStat.size,
    sha256: digest,
    pgDumpVersion: version.stdout,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await writeFile(`${backupPath}.sha256`, `${digest}  ${basename(backupPath)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { backupPath, manifestPath, digest, bytes: backupStat.size };
}
