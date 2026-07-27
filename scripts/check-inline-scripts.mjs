import { readFile } from 'node:fs/promises';
import process from 'node:process';
import vm from 'node:vm';

const files = process.argv.slice(2);
if (files.length === 0) throw new Error('Provide one or more HTML files');

for (const file of files) {
  const html = await readFile(file, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(script => script.trim());

  scripts.forEach((script, index) => {
    new vm.Script(script, { filename: `${file}#inline-script-${index + 1}` });
  });
}

console.log(`Validated inline JavaScript in ${files.length} HTML files.`);
