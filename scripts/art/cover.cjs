// Store covers from a live sci-fi battle: a staged swarm, the hero's skill going off, HUD hidden, logo on top.
//   node scripts/art/cover.cjs <outdir> <en|zh> [sizes=l,p,s]   (dev server on :5173; l 1920x1080, p 1080x1920, s 1024x1024)
//   BRIGHT=1 GRADE=lift KINDS=caterpillar,caterpillar,caterpillar,beetle,beetle,beetle,snail,locust,locust,crow ZOOM="l:12,p:20,s:12" \
//     node scripts/art/cover.cjs docs/art/scifi_r2/cover_bright en   : the lighter store grade (gamma lift, mostly dark bugs, so the red stays accent)
// Playwright is not a project dependency: PLAYWRIGHT points at an install that has it.
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const [out, lang = 'en', sizes = 'l,p,s'] = process.argv.slice(2);
const SZ = { l: [1280, 720, 1.5], p: [720, 1280, 1.5], s: [512, 512, 2] };
const TITLE = { en: ['SWARM', 'ORBIT'], zh: ['SWARM', 'ORBIT'] };
// ZOOM is one number for every size, or per size: "l:12,p:20,s:12" (default 8).
const zoomFor = (n) => {
  const z = process.env.ZOOM || '8';
  if (!z.includes(':')) return +z;
  return +(Object.fromEntries(z.split(',').map((p) => p.split(':')))[n] ?? 8);
};
// Every guide step id in src/view/guide.ts.
const GUIDE = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../src/view/guide.ts'), 'utf8').match(/id: '[^']+'/g).map((m) => m.slice(5, -1));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'], headless: true });
  await Promise.all(sizes.split(',').map(async (n) => {
    const [w, h, dsf] = SZ[n];
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
    const pg = await ctx.newPage();
    pg.on('pageerror', (e) => console.log(n, 'ERR', e.message));
    // A returning player past the guide (every step learned), so no hand or hint covers the shot.
    await pg.addInitScript((guide) => localStorage.setItem('fruit-fort:save', JSON.stringify({ v: 1, heroes: { farmer: 3, beekeeper: 2, chef: 2 }, hero: 'chef', runs: 8, crystals: 300, best: 6, levels: [3, 3, 3, 3, 3, 2], guide })), GUIDE);
    await pg.goto(`http://localhost:${process.env.PORT || 5173}/?lang=${lang}&quality=high`);
    await pg.waitForTimeout(2500);
    await pg.evaluate(() => game.village.act.onPlay(5));
    await pg.waitForTimeout(1500);
    // Let the bot play a while: upgrades bought, the swarm thick at the shield.
    await pg.evaluate((s) => game.bot(s), +(process.env.BOT || 12));
    console.log(n, await pg.evaluate(() => { const w = game.world(); return JSON.stringify({ over: w.over, wave: w.wave, en: w.enemies.length, t: w.time }); }));
    // Stage the swarm: a thick ring of bugs closing on the shield, the queen among them, too tough to die mid-shot.
    // The boss coming in sounds the alarm (2.4 s of dimmed light): let it pass before staging.
    await pg.evaluate(() => { const w = game.world(); w.addEnemy('boss', 0, 12, 0, -1, 9, 1e8); });
    await pg.waitForTimeout(2800);
    await pg.evaluate(([wide, sq, zoom, mix]) => {
      const w = game.world();
      w.enemies.length = 0;
      w.enemyById.clear();
      let seed = 7;
      const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const kinds = mix || ['caterpillar', 'caterpillar', 'beetle', 'beetle', 'crow', 'snail', 'spore', 'locust', 'locust', 'mold'];
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
      const area = sq ? { x: 0, y: H * 0.26, w: W, h: H * 0.74 } : wide ? { x: 0, y: H * 0.2, w: W, h: H * 0.8 } : { x: 0, y: H * 0.25, w: W, h: H * 0.68 };
      game.stage.board = { area, avoid: [] };
      game.stage.resize();
      // A little closer than play framing, so the bugs read at store-thumbnail size.
      const cam = game.stage.camera;
      const fwd = cam.getWorldDirection(cam.position.clone().set(0, 0, 0)).multiplyScalar(zoom * (wide ? 1 : 0.8));
      cam.position.add(fwd);
      cam.userData.base?.add(fwd);
      // The tank's range ring and the guide's hold ring are play aids, not part of the picture.
      for (const m of [game.stage.reach, game.stage.hold]) if (m) m.scale.setScalar(0);
      // Hits show HP bars: keep everyone whole so the bars stay hidden.
      setInterval(() => { for (const e of w.enemies) e.hp = e.maxHp; }, 5);
    }, [w > h, w === h, zoomFor(n), process.env.KINDS ? process.env.KINDS.split(',') : null]);
    await pg.waitForTimeout(900);
    await pg.evaluate(() => { const w = game.world(); w.hero.charge = 20; w.cast(); });
    await pg.waitForTimeout(220);
    // The skill's shockwave is a wide red ring at this instant: it veils the arena, so it stays out of the shot.
    await pg.evaluate(() => game.stage.scene.traverse((o) => { if (o.isMesh && o.geometry.type === 'RingGeometry' && o.scale.x > 2.5) o.visible = false; }));
    await pg.evaluate(([t, wide, sq, cjk]) => {
      for (const el of document.querySelectorAll('#hud, #threats, .guide, .spot, .hint')) el.style.visibility = 'hidden';
      // The off-screen threat chevrons (threats.ts) sit just before #hud and have no id of their own.
      const chev = document.getElementById('hud')?.previousElementSibling;
      if (chev && chev.style.inset === '0px') chev.style.visibility = 'hidden';
      // HP bars (horde.ts: one instanced batch drawn last, no depth test) can linger after a hit.
      game.stage.scene.traverse((o) => { if (o.isInstancedMesh && o.renderOrder === 1000 && o.material.depthTest === false) o.visible = false; });
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
    }, [TITLE[lang], w > h, w === h, /[一-鿿]/.test(TITLE[lang].join(''))]);
    // BRIGHT=1: a lighter grade for the store. The board is lifted (no near-black), the fort glows as the
    // light source with the corners falling off, and the bugs get a touch of warm light (their own colours kept) so the swarm reads at thumbnail size.
    // The logo is left alone: the grade is a filter on the canvas and two overlays under the logo.
    if (process.env.BRIGHT) await pg.evaluate(([wide, sq, lift]) => {
      const cv = document.querySelector('canvas');
      if (lift) {
        // GRADE=lift: a gamma curve instead of a flat multiply. Shadows and midtones come up the same,
        // but a colour already near the top (the bugs' hot red, the jelly) is not pushed past it and flattened.
        document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute"><filter id="lift" color-interpolation-filters="sRGB"><feComponentTransfer>${['R', 'G', 'B'].map((c) => `<feFunc${c} type="gamma" amplitude="1" exponent="${lift}" offset="0"/>`).join('')}</feComponentTransfer></filter></svg>`);
        cv.style.filter = 'url(#lift)';
      } else cv.style.filter = 'brightness(1.32) contrast(1.06) saturate(1.1)';
      if (!lift) game.stage.scene.traverse((o) => {
        if (!o.isInstancedMesh || !o.geometry.attributes.bugRig) return;
        for (const m of [].concat(o.material)) if (m.emissive) { m.emissive.setHex(0xff6a30); m.emissiveIntensity = 0.1; }
      });
      const p = game.stage.camera.position.clone().set(0, 0.4, 0).project(game.stage.camera);
      const x = ((p.x + 1) / 2) * 100, y = ((1 - p.y) / 2) * 100;
      const r = sq ? 46 : wide ? 34 : 52;
      const glow = document.createElement('div');
      glow.style.cssText = `position:fixed;inset:0;pointer-events:none;mix-blend-mode:screen;
        background:radial-gradient(circle ${r}vmin at ${x}% ${y}%,rgba(110,225,255,0.42),rgba(60,170,255,0.16) 55%,transparent 100%);`;
      const vig = document.createElement('div');
      vig.style.cssText = `position:fixed;inset:0;pointer-events:none;
        background:radial-gradient(ellipse 75% 75% at ${x}% ${y}%,transparent 55%,rgba(2,8,26,0.5) 100%);`;
      cv.after(glow, vig);
    }, [w > h, w === h, process.env.GRADE === 'lift' ? +(process.env.GAMMA || 0.72) : 0]);
    await pg.waitForTimeout(150);
    await pg.screenshot({ path: `${out}/cover_${lang}_${n}.png` });
    await ctx.close();
  }));
  await b.close();
})();
