import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (/\.(ts|js|mjs|json|md|ps1|cmd|vbs)$/.test(entry.name)) files.push(path);
  }
}
for (const folder of ["server", "scripts", "skills", "docs", "tests", "companion"]) await walk(join(root, folder));
files.push(join(root, "start-floating-window.cmd"));
files.push(join(root, "start-floating-window.vbs"));
const errors = [];
for (const file of files) {
  const text = await readFile(file, "utf8");
  text.split(/\r?\n/).forEach((line, index) => {
    if (/\s+$/.test(line)) errors.push(`${file}:${index + 1}: trailing whitespace`);
    if (line.includes("\t")) errors.push(`${file}:${index + 1}: tab character`);
  });
  // Server sources must never read or name persisted authentication material.
  // `types.ts` may retain the generic billing-mode value label in its schema.
  if (
    file.includes(`${join("server", "")}`) &&
    !file.endsWith(join("server", "types.ts")) &&
    /auth\.json|access.?token|api.?key|cookie/i.test(text)
  ) {
    errors.push(`${file}: server source must not reference authentication secrets`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Lint passed: ${files.length} files`);
