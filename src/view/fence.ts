// The wall round the reactor: a ring of slim gunmetal pylons with a translucent shield panel in each
// gap, knocked out as the wall loses health (the picnic marshmallow fence is in leftovers/).

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * The shield wall: `posts` slim gunmetal pylons with rounded tops on a circle of radius `r`, two
 * shades in turn, each with a glowing cap and light slits, and a shield panel in each gap
 * (shieldPanels). The pylons and their trim are one instanced mesh each.
 *
 * `bite(angle)` jolts the post nearest that angle; `wobble(t)` (every frame) rocks the jolted posts
 * in and out with a red flush that fades, so the player sees where the wall is being eaten.
 *
 * `paint(frac, biters)` breaks the fence where it is being eaten: how much is broken follows the
 * health left, where follows the bugs chewing it this frame (`biters`, each with its bite rate), so
 * a post nobody touches never changes. Each post wears down smoothly from whole (0) to a stump (1),
 * leaning a little as it goes, scorching darker, and once badly worn throbbing red with its glow
 * stuttering (colourPost); the shield between two posts cracks and goes down as they wear. A worn-out
 * post passes the rest of its bites to its neighbours, so a gap widens from where they chew. A
 * repair mends the least eaten posts first, so the spot still under attack stays broken instead of
 * mending and breaking again.
 *
 * `gapAt(angle)` says how far the fence is down at an angle, so a bug chewing there can step into
 * the gap (units.ts).
 */
export interface Fence {
  group: THREE.Group;
  bite(angle: number): void;
  wobble(t: number): void;
  /** Break or mend to match `frac` of health left: where posts were mended, how many fell to stumps. */
  paint(frac: number, biters: FenceBiter[]): { mended: { x: number; z: number }[]; felled: number };
  /** Whole again and every bite forgotten (a new run). */
  reset(): void;
  /** How open the fence is at this angle: 0 while the posts there stand, 1 once both are stumps with their shield down. */
  gapAt(angle: number): number;
}

/** A bug chewing the fence: where it stands and how fast it eats (wall damage per second). */
export interface FenceBiter {
  x: number;
  z: number;
  rate: number;
}

/** Height a post keeps once it is eaten down to a stump. */
const STUMP = 0.36;
/**
 * Share of the posts eaten down to stumps when the wall falls. All of them would strip half the
 * ring bare at half health; this many leave gaps where the bugs come from and the rest standing.
 */
const FENCE_WORN_AT_ZERO = 0.4;

export function makeFence(r: number, posts: number): Fence {
  const g = new THREE.Group();
  // Slim tall pylons, with a shield panel filling each gap.
  const H = 1.3;
  const W = 0.11;
  const D = 0.3;
  const B = 0.03;
  const R = 0.05;
  // Front profile: a rectangle with well-rounded top corners, extruded front to back with a bevel;
  // its foot sinks into the sand.
  const x0 = W - B;
  const y1 = H - B;
  const shape = new THREE.Shape()
    .moveTo(-x0, -0.2)
    .lineTo(x0, -0.2)
    .lineTo(x0, y1 - R)
    .quadraticCurveTo(x0, y1, x0 - R, y1)
    .lineTo(-x0 + R, y1)
    .quadraticCurveTo(-x0, y1, -x0, y1 - R)
    .closePath();
  const postGeo = new THREE.ExtrudeGeometry(shape, { depth: D - B * 2, bevelEnabled: true, bevelThickness: B, bevelSize: B, bevelSegments: 4, curveSegments: 8 });
  postGeo.translate(0, 0, -(D - B * 2) / 2);
  const pos = postGeo.attributes.position;
  const shade = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / H, 0, 1);
    // Only the foot darkens a little where the sand shades it; the rest stays clean and even.
    const v = 0.88 + 0.12 * THREE.MathUtils.smoothstep(t, 0, 0.3);
    shade.set([v, v, v], i * 3);
  }
  postGeo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  // Dark gunmetal.
  const soft = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55, clearcoat: 0.6, clearcoatRoughness: 0.25 });
  const set = new THREE.InstancedMesh(postGeo, soft, posts);
  const dark = new THREE.Color(0x66717f);
  const light = new THREE.Color(0x737e8c);
  const d = new THREE.Object3D();
  const step = (Math.PI * 2) / posts;
  for (let i = 0; i < posts; i++) {
    const a = i * step;
    d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    // Broad side along the fence: local x on the tangent.
    d.rotation.set(0, -a - Math.PI / 2, 0);
    d.updateMatrix();
    set.setMatrixAt(i, d.matrix);
    set.setColorAt(i, i % 2 ? light : dark);
  }
  set.castShadow = true;
  set.receiveShadow = true;
  g.add(set);
  // A glowing cap and a light slit down both faces of each pylon, moved with it. Unlit, so its
  // colour per post is the glow itself: cyan while whole, red and stuttering as the post is eaten.
  const trim = new THREE.InstancedMesh(
        mergeGeometries([
          new THREE.BoxGeometry(W * 2 + 0.04, 0.07, D + 0.04).translate(0, H - 0.05, 0),
          new THREE.BoxGeometry(0.05, 0.6, 0.02).translate(0, 0.6, D / 2 + 0.01),
          new THREE.BoxGeometry(0.05, 0.6, 0.02).translate(0, 0.6, -D / 2 - 0.01),
        ]),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
        posts,
      );
  const glowOk = new THREE.Color(0x70f2ff);
  const glowHurt = new THREE.Color(0xff2a3a);
  for (let i = 0; i < posts; i++) trim.setColorAt(i, glowOk);
  g.add(trim);
  const len = 2 * r * Math.sin(step / 2);
  const panels = shieldPanels(g, r, posts, len - W * 1.6);
  const jolt = new Float32Array(posts);
  /** How far each post is eaten, 0 whole to 1 a stump. */
  const worn = new Float32Array(posts);
  /** All the eating each post has taken this run; only grows, and orders the mending. */
  const eaten = new Float32Array(posts);
  // A fixed lean per post as it wears.
  const lean = Array.from({ length: posts }, (_, i) => Math.sin(i * 91.7) * 0.6);
  const hurt = new THREE.Color(0xff5a5a);
  /** What an eaten post is scorched towards: burnt dark metal. */
  const scorch = new THREE.Color(0x2c2228);
  const tint = new THREE.Color();
  let last = 0;
  let wobbleT = 0;
  const ease = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const place = (i: number) => {
    const a = i * step;
    const k = jolt[i];
    const w = worn[i];
    d.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    // Local z points out of the ring: a tilt about local x rocks the post in and out; a worn post
    // leans to one side and is eaten down towards a stump.
    d.rotation.set(Math.sin(wobbleT * 38) * 0.22 * k, -a - Math.PI / 2, lean[i] * w, 'YXZ');
    d.scale.set(1, 1 - (1 - STUMP) * w, 1);
    d.updateMatrix();
    set.setMatrixAt(i, d.matrix);
    trim.setMatrixAt(i, d.matrix);
    colourPost(i);
  };
  /**
   * A post's colour and its glow's. It scorches darker as it is eaten; once badly worn it throbs red
   * and its glow turns red and stutters like a failing light, so the weak spots in the wall are seen
   * at a glance, not only in the moment a bug bites. A fresh bite flushes it red on top.
   */
  const colourPost = (i: number) => {
    const w = worn[i];
    const dmg = ease(0.2, 0.8, w);
    // Each post throbs and stutters on its own phase, faster the worse it is.
    const pulse = dmg > 0 ? 0.5 + 0.5 * Math.sin(wobbleT * (5 + 5 * dmg) + i * 1.9) : 0;
    const stutter = dmg > 0 ? Math.max(0, Math.sin(wobbleT * 31 + i * 7.3) * Math.sin(wobbleT * 13.7 + i * 2.1)) : 0;
    tint.copy(i % 2 ? light : dark).lerp(scorch, 0.6 * w).lerp(hurt, Math.min(1, 0.55 * jolt[i] + 0.45 * dmg * pulse));
    set.setColorAt(i, tint);
    tint.copy(glowOk).lerp(glowHurt, dmg).multiplyScalar(1 - dmg * (0.35 * (1 - pulse) + 0.6 * stutter));
    trim.setColorAt(i, tint);
  };
  /** The shield between post i and the next wears with the two posts. */
  const placeShield = (i: number) => panels[i].wear((worn[i] + worn[(i + 1) % posts]) / 2);
  const redraw = (i: number) => {
    place(i);
    placeShield(i);
    placeShield((i + posts - 1) % posts);
  };
  const flush = () => {
    set.instanceMatrix.needsUpdate = true;
    set.instanceColor!.needsUpdate = true;
    trim.instanceMatrix.needsUpdate = true;
    trim.instanceColor!.needsUpdate = true;
  };
  /** Wear `amt` into post i; what a stump can't take spills to the less worn side, then on outwards. */
  const wear = (i: number, amt: number): number => {
    let felled = 0;
    for (let reach = 0; amt > 1e-6 && reach <= posts / 2; reach++) {
      const sides = reach === 0 ? [i] : [(i + reach) % posts, (i - reach + posts) % posts].sort((p, q) => worn[q] - worn[p]);
      for (const j of sides) {
        if (amt <= 1e-6 || worn[j] >= 1) continue;
        const take = Math.min(amt, 1 - worn[j]);
        worn[j] += take;
        eaten[j] += take;
        amt -= take;
        if (worn[j] >= 1 - 1e-6) {
          worn[j] = 1;
          felled++;
        }
        redraw(j);
      }
    }
    return felled;
  };
  return {
    group: g,
    bite(angle) {
      const i = ((Math.round(angle / step) % posts) + posts) % posts;
      jolt[i] = 1;
    },
    gapAt(angle) {
      const u = (((angle / step) % posts) + posts) % posts;
      const i = Math.floor(u) % posts;
      const f = u - Math.floor(u);
      // Open once the shield is on its way down (it goes at 0.75).
      return ease(0.45, 0.8, worn[i] * (1 - f) + worn[(i + 1) % posts] * f);
    },
    paint(frac, biters) {
      const want = Math.min(1, Math.max(0, 1 - frac)) * posts * FENCE_WORN_AT_ZERO;
      const have = worn.reduce((n, w) => n + w, 0);
      const mended: { x: number; z: number }[] = [];
      let felled = 0;
      let delta = want - have;
      if (Math.abs(delta) < 1e-4) return { mended, felled };
      if (delta > 0) {
        const total = biters.reduce((n, b) => n + b.rate, 0);
        if (total > 0) {
          // Each bug eats its share, split between the two posts either side of where it stands.
          for (const b of biters) {
            const u = ((Math.atan2(b.z, b.x) / step) % posts + posts) % posts;
            const i = Math.floor(u);
            const f = u - i;
            const amt = (delta * b.rate) / total;
            felled += wear(i % posts, amt * (1 - f)) + wear((i + 1) % posts, amt * f);
          }
        } else {
          // Health lost with nobody at the fence: wear on the post already most eaten.
          let i = 0;
          for (let j = 1; j < posts; j++) if (worn[j] < 1 && (worn[i] >= 1 || eaten[j] > eaten[i])) i = j;
          felled += wear(i, delta);
        }
      } else {
        // Mend the least eaten posts first; each one mended this frame sparkles once.
        while (delta < -1e-6) {
          let i = -1;
          for (let j = 0; j < posts; j++) if (worn[j] > 0 && (i < 0 || eaten[j] < eaten[i])) i = j;
          if (i < 0) break;
          const take = Math.min(-delta, worn[i]);
          worn[i] -= take;
          delta += take;
          redraw(i);
          if (take > 0.05) {
            const a = i * step;
            mended.push({ x: Math.cos(a) * r, z: Math.sin(a) * r });
          }
        }
      }
      flush();
      return { mended, felled };
    },
    reset() {
      eaten.fill(0);
      jolt.fill(0);
      worn.fill(0);
      for (let i = 0; i < posts; i++) redraw(i);
      flush();
    },
    wobble(t) {
      const dt = Math.min(0.1, Math.max(0, t - last));
      last = t;
      wobbleT = t;
      for (const p of panels) p.flicker(t);
      let moved = false;
      let lit = false;
      for (let i = 0; i < posts; i++) {
        if (jolt[i] > 0) {
          jolt[i] = Math.max(0, jolt[i] - dt * 3);
          place(i);
          moved = true;
        } else if (worn[i] > 0.2) {
          // Only the colours change on a worn post at rest: no matrix to upload.
          colourPost(i);
          lit = true;
        }
      }
      if (moved) flush();
      else if (lit) {
        set.instanceColor!.needsUpdate = true;
        trim.instanceColor!.needsUpdate = true;
      }
    },
  };
}

/** One shield panel per gap: `wear` shows how far it is broken, `flicker` runs every frame. */
interface ShieldPanel {
  wear(w: number): void;
  flicker(t: number): void;
}

/**
 * The wall's shields: a tall translucent cyan panel in each gap between two pylons, a hex
 * weave with bright top and bottom edges. Whole up to a third worn; then it cracks, fades, flickers
 * and its glow runs from cyan towards red; past a half it shatters, with holes punched in the weave;
 * past three quarters it is down and only the pylons stand.
 */
function shieldPanels(g: THREE.Group, r: number, posts: number, width: number): ShieldPanel[] {
  const step = (Math.PI * 2) / posts;
  const rr = r * Math.cos(step / 2);
  const geo = new THREE.PlaneGeometry(width, 0.98);
  const whole = shieldTexture(0);
  const cracked = shieldTexture(1);
  const shattered = shieldTexture(2);
  const calm = new THREE.Color(0x30c8ff);
  const alarm = new THREE.Color(0xff3050);
  return Array.from({ length: posts }, (_, i) => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: whole, emissive: 0x30c8ff, emissiveMap: whole, emissiveIntensity: 1.1, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.2 });
    const panel = new THREE.Mesh(geo, mat);
    const a = (i + 0.5) * step;
    panel.position.set(Math.cos(a) * rr, 0.64, Math.sin(a) * rr);
    panel.rotation.y = -a - Math.PI / 2;
    g.add(panel);
    let worn = 0;
    return {
      wear(w) {
        worn = w;
        panel.visible = w < 0.75;
        const map = w > 0.52 ? shattered : w > 0.3 ? cracked : whole;
        if (mat.map !== map) {
          // Swapping one texture for another of the same kind keeps the shader; no needsUpdate.
          mat.map = mat.emissiveMap = map;
        }
        const k = THREE.MathUtils.smoothstep(w, 0.3, 0.75);
        mat.opacity = 1 - 0.45 * k;
        mat.emissive.copy(calm).lerp(alarm, 0.7 * k);
      },
      flicker(t) {
        if (worn <= 0.3 || !panel.visible) {
          mat.emissiveIntensity = 1.1;
          return;
        }
        // Stutters harder the closer it is to going down, now and then cutting out almost entirely.
        const n = Math.sin(t * 23 + i * 7.1) * Math.sin(t * 9.3 + i * 3.7);
        mat.emissiveIntensity = 1.1 * Math.max(0.08, 1 - (worn - 0.3) * 2.2 * Math.max(0, n));
      },
    };
  });
}

/**
 * The shield's look: a cyan hex weave, brighter at the top and bottom edges. `crack` 1 adds fractures
 * from one hit; 2 adds a second hit's, and knocks out cells of the weave round both.
 */
function shieldTexture(crack: 0 | 1 | 2): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  const fill = x.createLinearGradient(0, 0, 0, S);
  fill.addColorStop(0, 'rgba(150,240,255,0.75)');
  fill.addColorStop(0.5, 'rgba(60,190,255,0.5)');
  fill.addColorStop(1, 'rgba(90,215,255,0.6)');
  x.fillStyle = fill;
  x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(200,250,255,0.45)';
  x.lineWidth = 2;
  const hex = 16;
  const across = hex * Math.sqrt(3);
  for (let row = 0; row * hex * 1.5 < S + hex; row++) {
    for (let col = 0; col * across < S + across; col++) {
      const cx = col * across + (row % 2 ? across / 2 : 0);
      const cy = row * hex * 1.5;
      x.beginPath();
      for (let k = 0; k <= 6; k++) {
        const a = Math.PI / 6 + (k * Math.PI) / 3;
        if (k) x.lineTo(cx + Math.cos(a) * hex, cy + Math.sin(a) * hex);
        else x.moveTo(cx + Math.cos(a) * hex, cy + Math.sin(a) * hex);
      }
      x.stroke();
    }
  }
  x.fillStyle = 'rgba(225,255,255,0.95)';
  x.fillRect(0, 0, S, 10);
  x.fillRect(0, S - 8, S, 8);
  if (crack) {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const hits = crack === 2 ? [[0.45, 0.4], [0.72, 0.68]] : [[0.45, 0.4]];
    if (crack === 2) {
      // Holes: cells of the weave blown out round each hit, so it plainly has gaps in it.
      for (const [hx, hy] of hits) {
        for (let k = 0; k < 6; k++) {
          const a = rnd() * Math.PI * 2;
          const d = 8 + rnd() * 30;
          x.clearRect(hx * S + Math.cos(a) * d - 9, hy * S + Math.sin(a) * d - 9, 18 + rnd() * 10, 18 + rnd() * 10);
        }
      }
    }
    // Fractures run out from each hit: a dark line under a bright one, so they read on the glow.
    const lines: [number, number][][] = [];
    for (const [hx, hy] of hits) {
      for (let k = 0; k < 8; k++) {
        let px = S * hx;
        let py = S * hy;
        let a = (k / 8) * Math.PI * 2 + rnd() * 0.5;
        const pts: [number, number][] = [[px, py]];
        for (let seg = 0; seg < 6; seg++) {
          a += (rnd() - 0.5) * 0.9;
          px += Math.cos(a) * (14 + rnd() * 18);
          py += Math.sin(a) * (14 + rnd() * 18);
          pts.push([px, py]);
        }
        lines.push(pts);
      }
    }
    x.lineCap = x.lineJoin = 'round';
    for (const [style, width] of [['rgba(10,30,70,0.7)', 7], ['rgba(255,255,255,1)', 3]] as const) {
      x.strokeStyle = style;
      x.lineWidth = width;
      for (const pts of lines) {
        x.beginPath();
        pts.forEach(([px, py], j) => (j ? x.lineTo(px, py) : x.moveTo(px, py)));
        x.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
