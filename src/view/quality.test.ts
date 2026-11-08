import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { LEVELS, Quality, isSoftware } from './quality';
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
    expect(ratio()).toBe(0.5);
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
