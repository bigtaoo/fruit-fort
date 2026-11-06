import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { animateCurrent, calmWith, GROUND_CALM, GROUND_CURRENT, groundCalm, groundFlash, groundSurge, makeArc } from './current';

// The current is module state driven by a clock, so the steps run in order on one rising clock.
describe('ground current', () => {
  const arc = makeArc();
  const crystal = new THREE.MeshStandardMaterial();
  const pool = new THREE.MeshBasicMaterial();
  calmWith(crystal, pool);
  let t = 0;
  const run = (sec: number) => {
    for (let i = 0; i < sec * 20; i++) animateCurrent((t += 0.05));
  };

  it('runs an idle pulse out from the fort and strikes the odd arc', () => {
    let pulsed = false;
    let arced = false;
    for (let i = 0; i < 400; i++) {
      animateCurrent((t += 0.05));
      if (GROUND_CURRENT.value.x > 0) pulsed = true;
      if (arc.visible) arced = true;
    }
    expect(pulsed).toBe(true);
    expect(arced).toBe(true);
    expect((arc.children[0] as THREE.Mesh).geometry.getAttribute('position').count).toBe(16);
  });

  it('flashes the web and lets the flash fade', () => {
    groundFlash(1);
    animateCurrent((t += 0.05));
    expect(GROUND_CURRENT.value.y).toBeGreaterThan(0.7);
    run(1);
    expect(GROUND_CURRENT.value.y).toBe(0);
  });

  it('glows steadily while a skill lasts and drains after', () => {
    groundSurge(true);
    run(1);
    expect(GROUND_CURRENT.value.y).toBeCloseTo(0.4);
    groundSurge(false);
    run(1);
    expect(GROUND_CURRENT.value.y).toBe(0);
  });

  it('quietens the ground and dims the crystals while the village is up', () => {
    groundCalm(true);
    run(1);
    expect(GROUND_CALM.value).toBe(1);
    expect(crystal.emissiveIntensity).toBeCloseTo(0.3);
    expect(pool.opacity).toBeCloseTo(0.3);
    groundCalm(false);
    run(1);
    expect(GROUND_CALM.value).toBe(0);
    expect(pool.opacity).toBe(1);
  });
});
