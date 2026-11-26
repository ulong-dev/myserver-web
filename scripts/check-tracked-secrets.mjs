import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const trackedFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter(file => !file.endsWith("package-lock.json"));

const patterns = [
  { name: "private key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: "GitHub token", regex: /gh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "Google API key", regex: /AIza[A-Za-z0-9_-]{20,}/ },
  { name: "Google Apps Script deployment URL", regex: /https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,}\/exec/ },
  { name: "OpenAI-style key", regex: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "Slack token", regex: /xox[baprs]-[A-Za-z0-9-]{10,}/ }
];

const findings = [];
for (const file of trackedFiles) {
  let content;
  try {
    content = readFileSync(file, { encoding: "utf8" });
  } catch {
    continue;
  }
  for (const pattern of patterns) {
    if (pattern.regex.test(content)) findings.push(`${file}: ${pattern.name}`);
  }
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  process.exit(1);
}

console.log(`Scanned ${trackedFiles.length} repository files; no common secret formats found.`);
