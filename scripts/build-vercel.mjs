import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile, copyFile, lstat, rm } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetTypes = new Set(['.html', '.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf']);
async function inventory(directory, relative = '') {
  const files = {};
  for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
    const name = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw new Error('Static output may not contain symbolic links.');
    if (entry.isDirectory()) Object.assign(files, await inventory(directory, name));
    else if (entry.isFile()) files[name] = createHash('sha256').update(await readFile(join(directory, name))).digest('hex');
    else throw new Error('Static output contains an unsupported file.');
  }
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
}
async function exists(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/** Publish only a freshly built client. Refuse to erase unmanaged/edited public files. */
export async function publishClientAssets(root = projectRoot) {
  const base = resolve(root), source = join(base, 'dist', 'public'), destination = join(base, 'public');
  const metadata = join(base, '.vercel', 'mfp-client-files.json');
  for (const path of [join(base, 'dist'), source, destination, dirname(metadata)]) {
    const stat = await exists(path);
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error('Static output directories must be local directories.');
  }
  const metadataStat = await exists(metadata);
  if (metadataStat && (!metadataStat.isFile() || metadataStat.isSymbolicLink()))
    throw new Error('Static ownership record must be a local file.');
  const files = await inventory(source);
  if (!files['index.html']) throw new Error('Built client index.html is missing.');
  for (const name of Object.keys(files)) {
    if (name.split('/').some(part => part.startsWith('.')) || !assetTypes.has(extname(name).toLowerCase()))
      throw new Error('Only compiled client assets may be published.');
  }
  if (await exists(destination)) {
    const current = await inventory(destination);
    let previous;
    try { previous = JSON.parse(await readFile(metadata, 'utf8')); } catch { /* Missing ownership record must not authorize deletion. */ }
    if (Object.keys(current).length && JSON.stringify(current) !== JSON.stringify(previous))
      throw new Error('Existing public files are unmanaged or changed; preserve them before rebuilding.');
    // Both source/destination are fixed children of this project, checked above.
    await rm(destination, { recursive: true });
  }
  await mkdir(destination, { recursive: true });
  for (const name of Object.keys(files)) {
    await mkdir(dirname(join(destination, name)), { recursive: true });
    await copyFile(join(source, name), join(destination, name));
  }
  await mkdir(dirname(metadata), { recursive: true });
  await writeFile(metadata, JSON.stringify(files, null, 2) + '\n');
  return files;
}

/** The Express builder prefers generated app.js, avoiding repeated TS graph compilation. */
export async function publishHostedHandler(contents, root = projectRoot) {
  const base = resolve(root), destination = join(base, 'app.js');
  const metadata = join(base, '.vercel', 'mfp-handler-file.json');
  const metadataDirectory = await exists(dirname(metadata));
  if (metadataDirectory && (!metadataDirectory.isDirectory() || metadataDirectory.isSymbolicLink()))
    throw new Error('Handler ownership directory must be local.');
  const metadataStat = await exists(metadata);
  if (metadataStat && (!metadataStat.isFile() || metadataStat.isSymbolicLink()))
    throw new Error('Handler ownership record must be a local file.');
  const current = await exists(destination);
  if (current) {
    if (!current.isFile() || current.isSymbolicLink()) throw new Error('Hosted handler must be a local file.');
    let previous;
    try { previous = JSON.parse(await readFile(metadata, 'utf8')); } catch { /* Do not replace unowned output. */ }
    const hash = createHash('sha256').update(await readFile(destination)).digest('hex');
    if (previous !== hash) throw new Error('Existing app.js is unmanaged or changed; preserve it before rebuilding.');
  }
  await writeFile(destination, contents);
  await mkdir(dirname(metadata), { recursive: true });
  await writeFile(metadata, JSON.stringify(createHash('sha256').update(contents).digest('hex')) + '\n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.env.NODE_ENV = 'production';
  const { build } = await import('vite');
  await build({ root: join(projectRoot, 'client'), configFile: join(projectRoot, 'vite.config.ts'), mode: 'production' });
  const { build: bundle } = await import('esbuild');
  const handler = await bundle({ absWorkingDir: projectRoot, entryPoints: ['app.ts'], bundle: true,
    platform: 'node', target: 'node24', format: 'esm', packages: 'external', write: false });
  await publishHostedHandler(handler.outputFiles[0].contents);
  const files = await publishClientAssets();
  console.log(`Published ${Object.keys(files).length} compiled client assets for Vercel.`);
}
