// Bundle size report for dist/: raw and gzip per file and in total. Fails above the first-download budget (§13).
// Usage: npx tsx scripts/size.ts [dir]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

export const GZIP_BUDGET = 5 * 1024 * 1024;

export interface SizeRow {
  file: string;
  raw: number;
  gzip: number;
}

export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function measure(dir: string): SizeRow[] {
  return walk(dir)
    .map((p) => {
      const buf = readFileSync(p);
      return { file: relative(dir, p).replace(/\\/g, '/'), raw: buf.length, gzip: gzipSync(buf, { level: 9 }).length };
    })
    .sort((a, b) => b.gzip - a.gzip);
}

export const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

/** Prints the table; returns the gzip total. */
export function report(dir: string): number {
  const rows = measure(dir);
  const raw = rows.reduce((s, r) => s + r.raw, 0);
  const gzip = rows.reduce((s, r) => s + r.gzip, 0);
  const w = Math.max(5, ...rows.map((r) => r.file.length));
  console.log(`${'file'.padEnd(w)}  ${'raw'.padStart(10)}  ${'gzip'.padStart(10)}`);
  for (const r of rows) console.log(`${r.file.padEnd(w)}  ${kb(r.raw).padStart(10)}  ${kb(r.gzip).padStart(10)}`);
  console.log(`${'total'.padEnd(w)}  ${kb(raw).padStart(10)}  ${kb(gzip).padStart(10)}   (budget ${kb(GZIP_BUDGET)} gzip)`);
  return gzip;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/size.ts')) {
  const gzip = report(process.argv[2] ?? 'dist');
  if (gzip > GZIP_BUDGET) {
    console.error(`gzip total ${kb(gzip)} is over the ${kb(GZIP_BUDGET)} budget`);
    process.exit(1);
  }
}
