// Line limit: no source file over MAX_LINES lines (house rule: split the file instead).
// Checks the TypeScript, JavaScript and CSS under src/ and scripts/; leftovers/ is history and is skipped.
// Usage: npx tsx scripts/lines.ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, sep } from 'node:path';

export const MAX_LINES = 500;
const ROOTS = ['src', 'scripts'];
const EXTS = new Set(['.ts', '.js', '.cjs', '.mjs', '.css']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Lines in a file's text, not counting the newline at the very end. */
export function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
}

const over = ROOTS.flatMap(walk)
  .filter((f) => EXTS.has(extname(f)))
  .map((file) => ({ file: file.split(sep).join('/'), lines: countLines(readFileSync(file, 'utf8')) }))
  .filter((r) => r.lines > MAX_LINES)
  .sort((a, b) => b.lines - a.lines);

if (over.length) {
  for (const r of over) console.error(`${r.file}: ${r.lines} lines (max ${MAX_LINES})`);
  process.exit(1);
}
console.log(`All source files are within ${MAX_LINES} lines.`);
