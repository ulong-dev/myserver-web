import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const target = path.resolve(process.argv[2] || "_site");
const allowedTopLevel = new Set([
  ".nojekyll",
  "404.html",
  "guitar-learning",
  "index.html",
  "robots.txt",
  "space-game",
  "typing-trainer"
]);
const forbiddenFragments = [
  "script.google.com/macros/s/",
  "credentials.json",
  "STAFF_PASSWORD",
  "AUTH_SECRET",
  "fire-api",
  "running-app",
  "library/index.html",
  "coffee-shop/index.html",
  "imac-khxng-2pfamily1",
  "/Users/2pfamily"
];
const textExtensions = new Set([".css", ".html", ".js", ".json", ".md", ".txt", ".vtt"]);

const topLevelEntries = await readdir(target);
const unexpected = topLevelEntries.filter(entry => !allowedTopLevel.has(entry));
if (unexpected.length > 0) {
  throw new Error(`Unexpected top-level Pages content: ${unexpected.join(", ")}`);
}

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory)) {
    const fullPath = path.join(directory, entry);
    const metadata = await stat(fullPath);
    if (metadata.isSymbolicLink()) throw new Error(`Symlinks are not allowed: ${fullPath}`);
    if (metadata.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

for (const file of await walk(target)) {
  if (!textExtensions.has(path.extname(file).toLowerCase())) continue;
  const content = await readFile(file, "utf8");
  for (const fragment of forbiddenFragments) {
    if (content.includes(fragment)) {
      throw new Error(`Forbidden fragment ${JSON.stringify(fragment)} found in ${path.relative(target, file)}`);
    }
  }
}

console.log(`Verified allowlisted Pages artifact at ${target}`);
