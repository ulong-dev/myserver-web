import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const outputRoot = path.resolve(process.argv[2] || '_private_site');
const cloudBuild = process.argv.includes('--cloud');
const allowedTopLevel = new Set([
  '.private-site',
  ...(cloudBuild ? ['_headers'] : []),
  'coffee-shop',
  'guitar-learning',
  'index.html',
  'library',
  'running-app',
  'space-game',
  'typing-trainer'
]);
const forbiddenNames = new Set([
  '.env', '.git', '.github', 'credentials.json', 'fire-api', 'node_modules',
  'scripts', 'APPS_SCRIPT_CONTAINMENT.md', 'PROJECT_WORKFLOW.txt', 'SECURITY.md'
]);
const forbiddenContent = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /"private_key"\s*:/,
  /AUTH_SECRET\s*=/,
  /STAFF_PASSWORD\s*=/,
  /https:\/\/script\.google\.com\/macros\/s\//
];

const topLevel = await readdir(outputRoot);
for (const name of topLevel) {
  if (!allowedTopLevel.has(name)) throw new Error(`Unexpected private artifact entry: ${name}`);
}

async function inspect(currentPath) {
  const metadata = await lstat(currentPath);
  if (metadata.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${currentPath}`);
  if (metadata.isDirectory()) {
    for (const name of await readdir(currentPath)) {
      if (forbiddenNames.has(name)) throw new Error(`Forbidden private artifact entry: ${path.join(currentPath, name)}`);
      await inspect(path.join(currentPath, name));
    }
    return;
  }
  if (!metadata.isFile() || metadata.size > 5_000_000) return;
  const contents = await readFile(currentPath, 'utf8');
  for (const pattern of forbiddenContent) {
    if (pattern.test(contents)) throw new Error(`Sensitive content found in ${currentPath}`);
  }
}

await inspect(outputRoot);
console.log(`Verified private artifact at ${outputRoot}`);
