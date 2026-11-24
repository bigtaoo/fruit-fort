// CrazyGames wants a flat directory, not a zip: their uploader takes a folder, and it refuses
// subdirectories, so dist/assets/* has to move up one level and every "./assets/" reference in the
// two HTML files has to lose the folder.
//   node scripts/cgflat.cjs            (after npm run package:cg)
// Output: release/cgflat/ , wiped and rebuilt each run. Upload that folder in step 1 of the portal.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const zipPath = path.join(root, 'release', `swarm-orbit-cg-${pkg.version}.zip`);
const out = path.join(root, 'release', 'cgflat');

if (!fs.existsSync(zipPath)) {
  console.error(`missing ${zipPath} - run "npm run package:cg" first`);
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// The zip is the packaged artifact, so unpack that rather than dist/: it is what the version number names.
const { execFileSync } = require('child_process');
const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'cgflat-'));
execFileSync('powershell', ['-NoProfile', '-Command',
  `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${tmp}' -Force`], { stdio: 'inherit' });

const flatten = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) flatten(p);
    else {
      const dest = path.join(out, e.name);
      if (fs.existsSync(dest)) throw new Error(`name clash when flattening: ${e.name}`);
      fs.copyFileSync(p, dest);
    }
  }
};
flatten(tmp);
fs.rmSync(tmp, { recursive: true, force: true });

for (const html of ['index.html', 'privacy.html']) {
  const p = path.join(out, html);
  if (!fs.existsSync(p)) continue;
  const before = fs.readFileSync(p, 'utf8');
  const after = before.split('./assets/').join('./').split('"/assets/').join('"./');
  if (after !== before) fs.writeFileSync(p, after);
}

const files = fs.readdirSync(out);
console.log(`${out}: ${files.length} files`);
if (files.some((f) => fs.statSync(path.join(out, f)).isDirectory())) {
  console.error('a subdirectory survived - CrazyGames will refuse it');
  process.exit(1);
}
