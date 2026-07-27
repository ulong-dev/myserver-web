import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputRoot = path.join(repositoryRoot, "_site");

const publicDirectories = [
  "guitar-learning",
  "space-game",
  "typing-trainer"
];

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await cp(path.join(repositoryRoot, "public-site"), outputRoot, { recursive: true });

for (const directory of publicDirectories) {
  await cp(path.join(repositoryRoot, directory), path.join(outputRoot, directory), {
    recursive: true
  });
}

await writeFile(path.join(outputRoot, ".nojekyll"), "", "utf8");
