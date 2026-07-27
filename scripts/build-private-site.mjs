import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsDirectory, '..');
const requestedOutput = process.argv.slice(2).find(argument => !argument.startsWith('--')) || '_private_site';
const cloudBuild = process.argv.includes('--cloud');
const outputRoot = path.resolve(repositoryRoot, requestedOutput);

if (outputRoot === repositoryRoot || !outputRoot.startsWith(`${repositoryRoot}${path.sep}`)) {
  throw new Error('Private artifact output must be a directory inside the repository');
}

const files = ['index.html'];
const directories = [
  'coffee-shop',
  'guitar-learning',
  'library',
  'running-app',
  'space-game',
  'typing-trainer'
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const file of files) {
  await cp(path.join(repositoryRoot, file), path.join(outputRoot, file));
}

for (const directory of directories) {
  await cp(path.join(repositoryRoot, directory), path.join(outputRoot, directory), {
    recursive: true,
    filter: source => !source.endsWith(`${path.sep}.DS_Store`)
  });
}

await writeFile(path.join(outputRoot, '.private-site'), 'Generated private application artifact.\n');

if (cloudBuild) {
  await cp(path.join(repositoryRoot, 'cloudflare', '_headers'), path.join(outputRoot, '_headers'));
}

console.log(`Built private site at ${outputRoot}`);
