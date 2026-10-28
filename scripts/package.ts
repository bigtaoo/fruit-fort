// Release package for portals (§13): vite build → release/fruit-fort-<version>.zip → size report.
// Fails when the gzip total of dist/ is over 5 MB. Usage: npm run package
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';
import { GZIP_BUDGET, kb, report, walk } from './size';

const DIST = 'dist';
const OUT = 'release';

/** Minimal zip writer (deflate, no zip64): index.html at the archive root, as portals expect. */
function zip(dir: string): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  // Fixed DOS timestamp (1980-01-01) so the same build gives the same zip.
  const time = 0;
  const date = (0 << 9) | (1 << 5) | 1;
  for (const path of walk(dir).sort()) {
    const name = Buffer.from(relative(dir, path).replace(/\\/g, '/'), 'utf8');
    const data = readFileSync(path);
    const packed = deflateRawSync(data, { level: 9 });
    const stored = packed.length >= data.length;
    const body = stored ? data : packed;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(stored ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6); // needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(stored ? 0 : 8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + body.length;
  }
  const dirBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  const count = centrals.length / 2;
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(dirBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dirBuf, end]);
}

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };
execSync('npx vite build', { stdio: 'inherit' });

console.log('');
const gzip = report(DIST);
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `fruit-fort-${version}.zip`);
writeFileSync(file, zip(DIST));
console.log(`\n${file.replace(/\\/g, '/')}  ${kb(statSync(file).size)}`);

if (gzip > GZIP_BUDGET) {
  console.error(`FAIL: gzip total ${kb(gzip)} is over the ${kb(GZIP_BUDGET)} budget`);
  process.exit(1);
}
console.log(`OK: gzip total ${kb(gzip)} / ${kb(GZIP_BUDGET)}`);
