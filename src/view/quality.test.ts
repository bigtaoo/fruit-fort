import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LEVELS, Quality, isIntegrated, isSoftware, startLevel } from './quality';
import type { Stage } from './scene';
import type { Fx } from './fx';

vi.stubGlobal('window', { devicePixelRatio: 3 });
vi.spyOn(console, 'info').mockImplementation(() => {});

function make(param: string | null = null, gpu = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)') {
  let ratio = 2;
  const lite = { on: false };
  const gl = { RENDERER: 1, getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 2 }), getParameter: (k: number) => (k === 2 ? gpu : 'WebKit WebGL') };
  const stage = {
    renderer: { shadowMap: { enabled: true }, getPixelRatio: () => ratio, setPixelRatio: (r: number) => (ratio = r), getContext: () => gl },
    scene: new THREE.Scene(),
    glow: { enabled: true },
    setLite: (on: boolean) => (lite.on = on),
    resize: () => {},
  } as unknown as Stage;
  const fx = { density: 1 } as Fx;
  return { q: new Quality(stage, fx, param), stage, fx, ratio: () => ratio, lite };
}

/** Feed `sec` seconds of frames at `fps`. */
function run(q: Quality, fps: number, sec: number): void {
  for (let t = 0; t < sec; t += 1 / fps) q.sample(1000 / fps);
}

describe('quality', () => {
  it('stays high on a smooth device', () => {
    const { q } = make();
    run(q, 60, 60);
    expect(q.level).toBe(0);
  });

  it('steps down one level per ~5 s of low fps, and applies it', () => {
    const { q, stage, fx, ratio } = make();
    run(q, 30, 5.5);
    expect(q.level).toBe(1);
    expect(stage.renderer.shadowMap.enabled).toBe(false);
    expect(stage.glow.enabled).toBe(false);
    run(q, 30, 5.5);
    expect(q.level).toBe(2);
    expect(fx.density).toBe(0.5);
    expect(ratio()).toBe(1.5);
    run(q, 30, 60);
    expect(q.level).toBe(LEVELS.length - 1);
    // The bottom level draws to a pixel budget: 1280x720 (the stub's fallback size) gets 0.35.
    expect(ratio()).toBe(0.35);
  });

  it('fits the bottom level to its pixel budget as the window changes, and leaves other levels alone', () => {
    const { q, ratio } = make('low', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)');
    vi.stubGlobal('window', { devicePixelRatio: 3, innerWidth: 1920, innerHeight: 1080 });
    q.fit();
    expect(ratio()).toBe(0.24);
    vi.stubGlobal('window', { devicePixelRatio: 3, innerWidth: 800, innerHeight: 450 });
    q.fit();
    expect(ratio()).toBe(0.5);
    const hi = make('high');
    hi.q.fit();
    expect(hi.ratio()).toBe(2);
    vi.stubGlobal('window', { devicePixelRatio: 3 });
  });

  it('steps down two levels at once under 25 fps', () => {
    const { q } = make();
    run(q, 20, 5.5);
    expect(q.level).toBe(2);
  });

  it('counts frames over 250 ms instead of skipping them, and goes straight to the bottom under 15 fps', () => {
    // 0.0.16: every frame took ~300 ms, all were skipped, fps stayed at 60 and nothing stepped down for 2.5 h.
    const { q, lite } = make();
    run(q, 3.3, 8);
    expect(q.fps).toBeLessThan(5);
    expect(q.level).toBe(LEVELS.length - 1);
    expect(lite.on).toBe(true);
  });

  it('a software renderer starts at the bottom; a GPU, or a hidden name, does not', () => {
    expect(make(null, 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)').q.level).toBe(LEVELS.length - 1);
    expect(make(null, 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)').q.level).toBe(LEVELS.length - 1);
    expect(isSoftware('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe(true);
    const { q, lite } = make();
    expect(q.level).toBe(0);
    expect(lite.on).toBe(false);
    expect(make(null, '').q.level).toBe(0);
    // The browser hides the name and the extension (Firefox's resistFingerprinting): no throw.
    expect(isSoftware('Mali-G57')).toBe(false);
  });

  it('thins the grass on the lower levels and restores it on the way up', () => {
    const { q, stage } = make();
    const lawn = new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), 100);
    lawn.userData.clumps = 100;
    stage.scene.add(lawn);
    q.set(2);
    expect(lawn.count).toBe(70);
    q.set(LEVELS.length - 1);
    expect(lawn.count).toBe(20);
    q.set(0);
    expect(lawn.count).toBe(100);
  });

  it('ignores a short stall and background-tab gaps', () => {
    const { q } = make();
    run(q, 60, 5);
    run(q, 20, 1.5);
    q.sample(5000);
    run(q, 60, 5);
    expect(q.level).toBe(0);
  });

  it('climbs back once after a long smooth stretch, then locks if it drops again', () => {
    const { q } = make();
    run(q, 30, 5.5);
    run(q, 30, 5.5);
    expect(q.level).toBe(2);
    run(q, 60, 35);
    expect(q.level).toBe(1);
    run(q, 30, 5.5);
    expect(q.level).toBe(2);
    run(q, 60, 120);
    expect(q.level).toBe(2);
  });

  it('a climbed level that runs well under full rate drops back and locks', () => {
    const { q } = make();
    q.set(3);
    run(q, 60, 35);
    expect(q.level).toBe(2);
    // 49 fps is over the usual floor, but not near the 60 the level below gave.
    run(q, 49, 5.5);
    expect(q.level).toBe(3);
    run(q, 60, 120);
    expect(q.level).toBe(3);
    // Locked: from now on only the usual floor steps down.
    run(q, 49, 10);
    expect(q.level).toBe(3);
  });

  it('pauses while the page is hidden or unfocused, and starts afresh on return', () => {
    const page = { hidden: false, focus: true };
    vi.stubGlobal('document', { get hidden() { return page.hidden; }, hasFocus: () => page.focus });
    const { q } = make();
    run(q, 60, 5);
    page.focus = false;
    run(q, 30, 20);
    expect(q.level).toBe(0);
    page.focus = true;
    page.hidden = true;
    run(q, 30, 20);
    expect(q.level).toBe(0);
    // Back: the throttled frames before don't count, so 3 s of low fps is not yet enough.
    page.hidden = false;
    run(q, 30, 3.5);
    expect(q.level).toBe(0);
    run(q, 30, 2);
    expect(q.level).toBe(1);
    vi.unstubAllGlobals();
    vi.stubGlobal('window', { devicePixelRatio: 3 });
  });

  it('tells its listener when a step changed the shaders, and only then', () => {
    // The shadow toggle gives every lit material another program and marks them all for a rebuild, so
    // whatever warmed them (units.rewarm) has to warm them again.
    const { q } = make();
    const shaders = vi.fn();
    q.onShaders = shaders;
    q.set(1);
    expect(shaders).toHaveBeenCalledTimes(1);
    q.set(2);
    q.set(LEVELS.length - 1);
    expect(shaders).toHaveBeenCalledTimes(1);
    q.set(0);
    expect(shaders).toHaveBeenCalledTimes(2);
  });

  it('a slow opening compile starts low and stays there; a quick one changes nothing', () => {
    // The ladder used to walk down from 0, which on these machines is 5-15 s of 3-4 fps.
    const quick = make();
    quick.q.compiled(400);
    expect(quick.q.level).toBe(0);
    expect(quick.q.weak).toBe(false);

    const slow = make();
    slow.q.compiled(2000);
    expect(slow.q.level).toBe(LEVELS.length - 2);
    expect(slow.q.weak).toBe(true);
    // Locked: 30 smooth seconds no longer climb, so the programs are not invalidated a second time.
    run(slow.q, 60, 35);
    expect(slow.q.level).toBe(LEVELS.length - 2);

    expect(make().q.level).toBe(0);
    const worst = make();
    worst.q.compiled(9000);
    expect(worst.q.level).toBe(LEVELS.length - 1);
    // Measured once: a later call cannot push it back up, and a touch or software start is never raised.
    worst.q.compiled(400);
    expect(worst.q.level).toBe(LEVELS.length - 1);
    const pinned = make('high');
    pinned.q.compiled(9000);
    expect(pinned.q.level).toBe(0);
  });

  it('the low levels fit a pixel budget too, and a phone-sized window is untouched', () => {
    vi.stubGlobal('window', { devicePixelRatio: 3, innerWidth: 1920, innerHeight: 1080 });
    const { q, ratio } = make();
    // 'min' on a 1080p desktop: 0.75 drew ~1.17M pixels a frame, the budget draws 0.4M.
    q.set(4);
    expect(ratio()).toBe(0.44);
    q.set(3);
    expect(ratio()).toBe(0.58);
    vi.stubGlobal('window', { devicePixelRatio: 3, innerWidth: 390, innerHeight: 844 });
    const phone = make();
    phone.q.set(3);
    expect(phone.ratio()).toBe(1);
    vi.stubGlobal('window', { devicePixelRatio: 3 });
  });

  it('?quality pins a level and never changes it', () => {
    expect(make('low').q.level).toBe(LEVELS.length - 1);
    expect(make('mid').q.level).toBe(2);
    expect(make('bogus').q.level).toBe(0);
    const { q } = make('high');
    run(q, 20, 30);
    expect(q.level).toBe(0);
    expect(q.forced).toBe(true);
  });
});

describe('startLevel', () => {
  it('starts a desktop integrated GPU at fx, a discrete one at high, a phone at pixel, software at the bottom', () => {
    const intel = 'ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00009BC8) Direct3D11 vs_5_0 ps_5_0, D3D11)';
    const apu = 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)';
    const arc = 'ANGLE (Intel, Intel(R) Arc(TM) Pro Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)';
    const rtx = 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
    expect([intel, apu].map((g) => isIntegrated(g))).toEqual([true, true]);
    expect([arc, rtx, 'Apple GPU', 'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11)'].map((g) => isIntegrated(g))).toEqual([false, false, false, false]);
    expect(LEVELS[startLevel(intel, false)].name).toBe('fx');
    expect(LEVELS[startLevel(rtx, false)].name).toBe('high');
    expect(LEVELS[startLevel(intel, true)].name).toBe('pixel');
    expect(startLevel('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))', false)).toBe(LEVELS.length - 1);
  });
});
