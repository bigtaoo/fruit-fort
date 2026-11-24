// Store preview videos: the bot plays a real level in real time, HUD and all, recorded straight off the page.
//   node scripts/art/trailer.cjs <outdir> [sizes=l,p]        (dev server on :5173; l 1280x720 -> 1920x1080, p 720x1080 -> 1080x1620)
//   LEVEL=5 WARM=70 SECS=18 node scripts/art/trailer.cjs docs/art/cg/video
// CrazyGames wants the portrait video 2:3, not 9:16 - a 1080x1920 clip is refused by the form.
// CRF trades size for quality (20 default, higher is smaller): the portrait clip has to stay under the
// 10 MB a single upload call takes.
// WARM seconds are fast-forwarded before recording starts (so the clip opens on a thick wave, not wave 1's
// three bugs); the warm-up is cut off afterwards with ffmpeg, which also makes the MP4 CrazyGames asks for.
// Playwright is not a project dependency: PLAYWRIGHT points at an install that has it.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [out, sizes = 'l,p'] = process.argv.slice(2);
// Recorded at half the store size and scaled up by ffmpeg: a 1920x1080 viewport runs the renderer at a
// resolution no phone ever sees, and the frame rate is what a trailer is judged on.
const SZ = { l: [1280, 720, 1920, 1080], p: [720, 1080, 1080, 1620] };
const SECS = +(process.env.SECS || 18);
const WARM = +(process.env.WARM || 70);
const GUIDE = fs.readFileSync(path.join(__dirname, '../../src/view/guidesteps.ts'), 'utf8').match(/id: '[^']+'/g).map((m) => m.slice(5, -1));

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], headless: true });
  for (const n of sizes.split(',')) {
    const [w, h, ow, oh] = SZ[n];
    const raw = path.join(out, `raw_${n}`);
    fs.rmSync(raw, { recursive: true, force: true });
    const ctx = await b.newContext({ viewport: { width: w, height: h }, recordVideo: { dir: raw, size: { width: w, height: h } } });
    // The recording starts with the context, so everything up to here - loading, the village, the warm-up -
    // is in the file and has to be cut off by the seek below.
    const t0 = Date.now();
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log(n, 'ERR', e.message));
    // A returning player past the guide: no teaching hand over the shot, and the stats are worth buying.
    await pg.addInitScript((guide) => localStorage.setItem('swarm-orbit:save', JSON.stringify({ v: 1, heroes: { farmer: 3, beekeeper: 2, chef: 2 }, hero: 'chef', runs: 8, crystals: 300, best: 6, levels: Array(20).fill(3), guide })), GUIDE);
    await pg.goto(`http://localhost:${process.env.PORT || 5173}/?lang=en&quality=high`);
    await pg.waitForTimeout(2500);
    await pg.evaluate((lv) => game.village.act.onPlay(lv), +(process.env.LEVEL || 5));
    await pg.waitForTimeout(1500);
    // Fast-forward to a wave worth watching, then hand the bot the wheel in real time: from here the page
    // runs at its own frame rate and what the recorder sees is what a player would see.
    await pg.evaluate((s) => game.bot(s), WARM);
    // The banner of the wave the warm-up ended on is still on screen; let it fade before the clip starts.
    await pg.waitForTimeout(1800);
    await pg.evaluate(async () => {
      const { botAct } = await import('/src/sim/bot.ts');
      window.__bot = setInterval(() => { const w = game.world(); if (!w.over) botAct(w); }, 400);
    });
    const from = (Date.now() - t0) / 1000;
    await pg.waitForTimeout(SECS * 1000 + 600);
    console.log(n, await pg.evaluate(() => { const w = game.world(); return JSON.stringify({ over: w.over, wave: w.wave, en: w.enemies.length, wall: Math.round((w.wallHp / w.wallMax) * 100) }); }));
    await pg.evaluate(() => clearInterval(window.__bot));
    const video = pg.video();
    await ctx.close();
    const webm = await video.path();
    const mp4 = path.join(out, `trailer_${n}.mp4`);
    // -ss before -i seeks, -t caps it under the 20 s the form allows; the scale is the only thing that
    // touches the pixels, and yuv420p + faststart is what every browser will actually play.
    execFileSync('ffmpeg', ['-y', '-ss', String(Math.max(0, from)), '-i', webm, '-t', String(SECS),
      '-vf', `scale=${ow}:${oh}:flags=lanczos,fps=30`, '-c:v', 'libx264', '-preset', 'slow', '-crf', String(process.env.CRF || 20),
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { stdio: ['ignore', 'ignore', 'inherit'] });
    fs.rmSync(raw, { recursive: true, force: true });
    console.log(n, mp4, (fs.statSync(mp4).size / 1024).toFixed(0) + ' KB');
  }
  await b.close();
})();
