// Store covers from a live sci-fi battle: a staged swarm, the hero's skill going off, HUD hidden, logo on top.
//   node scripts/art/cover.cjs <outdir> <en|zh> [sizes=l,p,s]   (dev server on :5173; l 1920x1080, p 1080x1920, s 1024x1024)
// Playwright is not a project dependency: PLAYWRIGHT points at an install that has it.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const [out, lang = 'en', sizes = 'l,p,s'] = process.argv.slice(2);
const SZ = { l: [1280, 720, 1.5], p: [720, 1280, 1.5], s: [512, 512, 2] };
const TITLE = { en: ['SWARM', 'DEFENSE'], zh: ['虫潮', '防线'] };
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], headless: true });
  await Promise.all(sizes.split(',').map(async (n) => {
    const [w, h, dsf] = SZ[n];
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log(n, 'ERR', e.message));
    await pg.addInitScript(() => localStorage.setItem('fruit-fort:save', JSON.stringify({ heroes: { farmer: 3, beekeeper: 2, chef: 2 }, hero: 'chef', runs: 8, crystals: 300, best: 4 })));
    await pg.goto(`http://localhost:5173/?lang=${lang}&quality=high`);
    await pg.waitForTimeout(2500);
    await pg.click('#village .play', { timeout: 1500 }).catch(() => {});
    await pg.waitForTimeout(1500);
    // Let the bot play a while: upgrades bought, the swarm thick at the shield.
    await pg.evaluate((s) => game.bot(s), +(process.env.BOT || 12));
    console.log(n, await pg.evaluate(() => { const w = game.world(); return JSON.stringify({ over: w.over, wave: w.wave, en: w.enemies.length, t: w.time }); }));
    // Stage the swarm: a thick ring of bugs closing on the shield, the queen among them, too tough to die mid-shot.
    await pg.evaluate(([wide, sq]) => {
      const w = game.world();
      w.enemies.length = 0;
      w.enemyById.clear();
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const kinds = ['caterpillar', 'caterpillar', 'beetle', 'beetle', 'crow', 'snail', 'spore', 'locust', 'locust', 'mold'];
      for (let i = 0; i < 60; i++) {
        const a = rnd() * Math.PI * 2;
        const r = 3.9 + rnd() ** 1.6 * (wide ? 6.5 : 5);
        const k = kinds[i % kinds.length];
        w.addEnemy(k, Math.cos(a) * r, Math.sin(a) * r, -Math.cos(a), -Math.sin(a), r - 3.6, 1e7);
      }
      const qa = Math.PI * (wide || sq ? 0.2 : 0.36);
      w.addEnemy('boss', Math.cos(qa) * 5.2, Math.sin(qa) * 5.2, -Math.cos(qa), -Math.sin(qa), 2, 1e8);
      // Room for the logo: the fort sits low in the frame.
      const W = innerWidth, H = innerHeight;
      game.stage.board = sq ? { x: 0, y: H * 0.26, w: W, h: H * 0.74 } : wide ? { x: 0, y: H * 0.2, w: W, h: H * 0.8 } : { x: 0, y: H * 0.25, w: W, h: H * 0.68 };
      game.stage.resize();
      // Hits show HP bars: keep everyone whole so the bars stay hidden.
      setInterval(() => { for (const e of w.enemies) e.hp = e.maxHp; }, 5);
    }, [w > h, w === h]);
    await pg.waitForTimeout(900);
    await pg.evaluate(() => { const w = game.world(); w.hero.charge = 20; w.cast(); });
    await pg.waitForTimeout(220);
    await pg.evaluate(([t, wide, sq, cjk]) => {
      document.getElementById('hud').style.visibility = 'hidden';
      const d = document.createElement('div');
      // Chinese reads as one line: four heavy glyphs, the second pair in gold.
      const big = cjk ? (wide ? 16 : 20) : sq ? 22 : wide ? 15 : 20;
      d.innerHTML = cjk ? `<span class="l1">${t[0]}</span><span class="l2">${t[1]}</span>` : `<div class="l1">${t[0]}</div><div class="l2">${t[1]}</div>`;
      d.style.cssText = `position:fixed;left:0;right:0;${wide ? 'top:6vh' : 'top:7vh'};text-align:center;pointer-events:none;
        font-family:${cjk ? "'Microsoft YaHei UI','Microsoft YaHei'" : "'Arial Black','Segoe UI Black'"},sans-serif;font-weight:900;line-height:${cjk ? 1.12 : 0.92};letter-spacing:${cjk ? '0.08em' : '0.02em'};`;
      const st = document.createElement('style');
      st.textContent = `
        .l1,.l2{display:${cjk ? 'inline-block' : 'block'};-webkit-text-stroke:${big * (cjk ? 0.06 : 0.07)}vmin #0b1f3e;paint-order:stroke fill;
          background:linear-gradient(#ffffff 15%,#b8f4ff 55%,#3cc8ff 95%);-webkit-background-clip:text;background-clip:text;color:transparent;
          filter:drop-shadow(0 0.6vmin 0 #0b1f3e) drop-shadow(0 0 2.2vmin rgba(60,210,255,0.85));}
        .l1{font-size:${big}vmin}
        .l2{font-size:${big * (cjk ? 1 : 0.62)}vmin;letter-spacing:${cjk ? '0.08em' : '0.12em'};
          background:linear-gradient(#fff6c8 10%,#ffc53a 60%,#ff9a1a 95%);-webkit-background-clip:text;background-clip:text;
          filter:drop-shadow(0 0.5vmin 0 #0b1f3e) drop-shadow(0 0 1.6vmin rgba(255,170,40,0.7));}`;
      document.head.append(st);
      document.body.append(d);
    }, [TITLE[lang], w > h, w === h, lang === 'zh']);
    await pg.waitForTimeout(150);
    await pg.screenshot({ path: `${out}/cover_${lang}_${n}.png` });
    await ctx.close();
  }));
  await b.close();
})();
