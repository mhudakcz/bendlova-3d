// Okolí domu: ulice kolem parku (asfalt, obrubníky, chodníky), park, zahrada a plot.
// Souřadnice v metrech v rovině půdorysu domu (x = napříč domem, y = k ulici), terén v TERRAIN_Z.
import * as THREE from 'three';
import { TERRAIN_Z } from './house';
import context from './context.json';

type Pt = [number, number];
type Ctx = { roads: { kind: string; name: string; pts: Pt[] }[] };

const G = TERRAIN_Z / 100; // výška terénu (m)

const FX = 1.0; // úsek plotu kolmo k ulici vedle schodů (předzahrádka s keři)
// Plot pozemku – odměřeno z leteckého snímku (žlutá čára), metry v souřadnicích půdorysu.
const FENCE_BACK: Pt[] = [
  [11.0, 0.0], [11.0, -1.43], [10.09, -25.38], [-30.81, -17.62], [-30.16, 6.44],
  [-2.77, 7.19], [-1.3, 11.65], [FX, 11.65], [FX, 18.6], // u balkonů pravý úhel
];
const PARTY_X = 11.0; // hranice se sousedem vpravo = štítová zeď domu
const STREET_FENCE: [Pt, Pt] = [[FX, 18.75], [PARTY_X, 18.85]];
// keře v předzahrádce vedle schodů (x, y, poloměr)
const BUSHES: [number, number, number][] = [
  [1.6, 12.6, 0.6], [2.4, 12.4, 0.5], [1.5, 14.2, 0.7], [2.3, 16.2, 0.55], [1.6, 17.6, 0.65],
  [3.0, 17.9, 0.45], [2.9, 13.3, 0.4],
];
const FENCE_SIDE: Pt[] = [[PARTY_X, 18.85], [PARTY_X, 15.3]];
const GARAGE_GATE: [number, number] = [4.45, 7.95]; // x na uličním plotu
const HOUSE_GATE: [number, number] = [8.75, 9.8];
// zahrada za domem (trávník)
const GARDEN: Pt[] = [
  [11.0, 0.0], [11.0, -1.43], [10.09, -25.38], [-30.81, -17.62], [-30.16, 6.44],
  [-2.77, 7.19], [-1.3, 11.65], [0, 11.65], [0, 0],
];

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeatMeters: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.userData.repeat = 1 / repeatMeters;
  return t;
}
function speckle(g: CanvasRenderingContext2D, s: number, n: number, colors: string[], r = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
}
// jemné, nízkokontrastní textury (aby povrch „nezrnil")
const asphaltTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#56575a'; g.fillRect(0, 0, s, s);
  speckle(g, s, 5000, ['#5d5e61', '#505154', '#5a5a5c'], 2);
}, 3);
const paverTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#9d9a94'; g.fillRect(0, 0, s, s);
  const n = 8, t = s / n; // dlažba 25 × 25 cm (2 m na texturu)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const off = (j % 2) * t * 0.5;
    g.fillStyle = `hsl(35,4%,${66 + Math.random() * 5}%)`;
    g.fillRect(((i * t + off) % s) + 1, j * t + 1, t - 2, t - 2);
  }
}, 2);
const lawnTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#7f9a5a'; g.fillRect(0, 0, s, s);
  speckle(g, s, 9000, ['#7a9555', '#84a05f', '#78925a'], 2);
}, 4);
const meshTex = canvasTex(128, (g, s) => {
  g.clearRect(0, 0, s, s);
  g.strokeStyle = '#3f7a5e'; g.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    const p = (i * s) / 8;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
  }
}, 0.6);

const mat = (tex: THREE.Texture, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, ...o });
const asphaltMat = mat(asphaltTex);
const paverMat = mat(paverTex);
const curbMat = new THREE.MeshStandardMaterial({ color: '#b9b5ad', roughness: 0.9, side: THREE.DoubleSide });
const lawnMat = mat(lawnTex, { polygonOffsetFactor: -0.5, polygonOffsetUnits: -0.5 });
const fenceMeshMat = new THREE.MeshStandardMaterial({ map: meshTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6 });
const fenceGreen = new THREE.MeshStandardMaterial({ color: '#3f7a5e', roughness: 0.55, metalness: 0.3 });
const concreteMat = new THREE.MeshStandardMaterial({ color: '#a9a49b', roughness: 0.95 });
const zincMat = new THREE.MeshStandardMaterial({ color: '#b8bcbf', roughness: 0.4, metalness: 0.6 });

/** Pás podél lomené čáry s pokosy v rozích; offset posune střed pásu do strany. */
function ribbonPoints(pts: Pt[], offset: number, closed: boolean): Pt[] {
  const n = pts.length;
  return pts.map((p, i) => {
    const prev = pts[i - 1] ?? (closed ? pts[n - 2] : null);
    const next = pts[i + 1] ?? (closed ? pts[1] : null);
    const dir = (a: Pt, b: Pt) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
    const d1 = prev ? dir(prev, p) : dir(p, next!);
    const d2 = next ? dir(p, next) : d1;
    const n1 = [-d1[1], d1[0]], n2 = [-d2[1], d2[0]];
    let mx = n1[0] + n2[0], my = n1[1] + n2[1];
    const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
    const k = 1 / Math.max(0.35, mx * n2[0] + my * n2[1]);
    return [p[0] + mx * offset * k, p[1] + my * offset * k];
  });
}

/** Vodorovný pás (horní plocha) + volitelně svislé boky (obrubník). Vrací geometrii s UV ve světových metrech. */
function strip(pts: Pt[], o0: number, o1: number, y: number, closed: boolean, rep: number, sides = 0) {
  const A = ribbonPoints(pts, o0, closed), B = ribbonPoints(pts, o1, closed);
  const pos: number[] = [], uv: number[] = [];
  const v = (p: Pt, h: number) => { pos.push(p[0], h, p[1]); uv.push(p[0] * rep, p[1] * rep); };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = A[i], b = A[i + 1], c = B[i + 1], d = B[i];
    for (const p of [a, c, b, a, d, c]) v(p, y);
    if (sides) {
      for (const [p, q] of [[a, b], [d, c]] as [Pt, Pt][]) {
        pos.push(p[0], y - sides, p[1], q[0], y - sides, q[1], q[0], y, q[1], p[0], y - sides, p[1], q[0], y, q[1], p[0], y, p[1]);
        uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function polyShape(pts: Pt[], holes: Pt[][] = []) {
  const s = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return s;
}
function flat(shape: THREE.Shape, y: number, m: THREE.Material, rep: number) {
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(Math.PI / 2); // (x, y) -> (x, 0, y)
  const p = g.attributes.position, uv: number[] = [];
  for (let i = 0; i < p.count; i++) uv.push(p.getX(i) * rep, p.getZ(i) * rep);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.translate(0, y, 0);
  const mesh = new THREE.Mesh(g, m);
  (mesh.material as THREE.Material).side = THREE.DoubleSide;
  mesh.receiveShadow = true;
  return mesh;
}

// deterministický náhodný generátor (stromy na stejných místech)
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
function inside(p: Pt, poly: Pt[]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const trunkMat = new THREE.MeshStandardMaterial({ color: '#6b5440', roughness: 1 });
const leafMats = ['#5f7f45', '#6d8c4c', '#567a48', '#7b9450'].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
function tree(x: number, y: number, h: number, r: number, k: number, conifer = false) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, h * 0.45, 7), trunkMat);
  trunk.position.y = h * 0.22;
  const crown = new THREE.Mesh(
    conifer ? new THREE.ConeGeometry(r, h * 0.85, 9) : new THREE.IcosahedronGeometry(r, 1),
    leafMats[k % leafMats.length],
  );
  crown.position.y = conifer ? h * 0.55 : h * 0.6;
  crown.scale.y = conifer ? 1 : 0.85;
  for (const m of [trunk, crown]) { m.castShadow = true; m.receiveShadow = true; }
  t.add(trunk, crown);
  t.position.set(x, G, y);
  return t;
}

/** Plot: sloupky, vodorovná trubka, pletivo; volitelně betonová podezdívka. */
function fence(group: THREE.Group, colliders: THREE.Object3D[], a: Pt, b: Pt, opt: { base?: number; h?: number } = {}) {
  const base = opt.base ?? 0, h = opt.h ?? 1.4;
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 0.05) return;
  const ang = Math.atan2(dy, dx);
  const mid = (t: number): Pt => [a[0] + dx * t, a[1] + dy * t];
  const [cx, cy] = mid(0.5);
  if (base > 0) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(L, base, 0.2), concreteMat);
    w.position.set(cx, G + base / 2, cy);
    w.rotation.y = -ang;
    w.castShadow = w.receiveShadow = true;
    group.add(w);
    colliders.push(w);
  }
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(L, h - 0.08), fenceMeshMat.clone());
  (panel.material as THREE.MeshStandardMaterial).map = meshTex.clone();
  const mt = (panel.material as THREE.MeshStandardMaterial).map!;
  mt.repeat.set(L / 0.6, (h - 0.08) / 0.6);
  mt.needsUpdate = true;
  panel.position.set(cx, G + base + (h - 0.08) / 2, cy);
  panel.rotation.y = -ang;
  group.add(panel);
  colliders.push(panel);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L, 6), fenceGreen);
  rail.rotation.z = Math.PI / 2;
  const railG = new THREE.Group();
  railG.add(rail);
  railG.position.set(cx, G + base + h, cy);
  railG.rotation.y = -ang;
  group.add(railG);
  const n = Math.max(1, Math.round(L / 2.5));
  for (let i = 0; i <= n; i++) {
    const [px, py] = mid(i / n);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h + 0.05, 8), fenceGreen);
    post.position.set(px, G + base + (h + 0.05) / 2, py);
    post.castShadow = true;
    group.add(post);
  }
}

export function buildSite(scene: THREE.Scene) {
  const ctx = context as unknown as Ctx;
  const group = new THREE.Group();
  group.name = 'site';
  const colliders: THREE.Object3D[] = [];
  const walkables: THREE.Object3D[] = [];

  // ---------------------------------------------------------- ulice: asfalt, obrubníky, chodníky
  const ROAD_W = 5.5, CURB = 0.12, WALK_W = 1.9;
  const roads = ctx.roads.filter((r) => r.kind === 'residential' || r.kind === 'service');
  // park = vnitřek smyčky ulice před domem (nejbližší silnice k uličnímu plotu)
  const loop = [...roads].sort((p, q) =>
    Math.min(...p.pts.map((t) => Math.hypot(t[0] - 7, t[1] - 22))) - Math.min(...q.pts.map((t) => Math.hypot(t[0] - 7, t[1] - 22))))[0];
  const lx = loop.pts.map((p) => p[0]), ly = loop.pts.map((p) => p[1]);
  const park = { x0: Math.min(...lx), x1: Math.max(...lx), y0: Math.min(...ly), y1: Math.max(...ly) };
  const inPark = (p: Pt) => p[0] > park.x0 + 0.5 && p[0] < park.x1 - 0.5 && p[1] > park.y0 + 0.5 && p[1] < park.y1 - 0.5;
  // úseky lomené čáry, které leží na straně parku / na straně domů
  const runs = (pts: Pt[], side: number) => {
    const out: { park: boolean; pts: Pt[] }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
      const probe: Pt = [(ax + bx) / 2 - (dy / l) * side * 4, (ay + by) / 2 + (dx / l) * side * 4];
      const isPark = inPark(probe);
      const last = out.at(-1);
      if (last && last.park === isPark) last.pts.push(pts[i + 1]);
      else out.push({ park: isPark, pts: [pts[i], pts[i + 1]] });
    }
    return out;
  };
  const hedgeMat = new THREE.MeshStandardMaterial({ color: '#5d7f43', roughness: 1, side: THREE.DoubleSide });
  for (const r of roads) {
    const closed = Math.hypot(r.pts[0][0] - r.pts.at(-1)![0], r.pts[0][1] - r.pts.at(-1)![1]) < 0.5;
    const ar = asphaltTex.userData.repeat as number, pr = paverTex.userData.repeat as number;
    const asphalt = new THREE.Mesh(strip(r.pts, -ROAD_W / 2, ROAD_W / 2, G + 0.01, closed, ar), asphaltMat);
    asphalt.receiveShadow = true;
    group.add(asphalt);
    walkables.push(asphalt);
    for (const side of [-1, 1]) {
      const o0 = (side * ROAD_W) / 2;
      const curb = new THREE.Mesh(strip(r.pts, Math.min(o0, o0 + side * 0.15), Math.max(o0, o0 + side * 0.15), G + CURB + 0.005, closed, 1, CURB), curbMat);
      curb.receiveShadow = true;
      group.add(curb);
      for (const run of runs(r.pts, side)) {
        if (run.park) {
          // park lemuje živý plot z keřů vysoký ~2 m
          const HEDGE_H = 2.0;
          const h0 = side * (ROAD_W / 2 + 0.5), h1 = side * (ROAD_W / 2 + 1.7);
          const hedge = new THREE.Mesh(strip(run.pts, Math.min(h0, h1), Math.max(h0, h1), G + HEDGE_H, false, 1, HEDGE_H), hedgeMat);
          hedge.castShadow = hedge.receiveShadow = true;
          group.add(hedge);
          colliders.push(hedge);
        } else {
          // chodník na straně domů
          const o1 = side * (ROAD_W / 2 + WALK_W);
          const walk = new THREE.Mesh(strip(run.pts, Math.min(o0, o1), Math.max(o0, o1), G + CURB, false, pr, CURB), paverMat);
          walk.receiveShadow = true;
          group.add(walk);
          walkables.push(walk);
        }
      }
    }
  }
  // samostatné pěšiny daleko od silnic (cesty v parku apod.)
  const nearRoad = (p: Pt) => roads.some((r) => r.pts.some((q, i) => {
    const s = r.pts[i + 1];
    if (!s) return false;
    const dx = s[0] - q[0], dy = s[1] - q[1], l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / l2));
    return Math.hypot(p[0] - q[0] - dx * t, p[1] - q[1] - dy * t) < 7;
  }));
  for (const r of ctx.roads) {
    if (r.kind !== 'footway' && r.kind !== 'pedestrian') continue;
    const segs: Pt[][] = [];
    let cur: Pt[] = [];
    for (const p of r.pts) {
      if (nearRoad(p)) { if (cur.length > 1) segs.push(cur); cur = []; } else cur.push(p);
    }
    if (cur.length > 1) segs.push(cur);
    for (const s of segs) {
      const m = new THREE.Mesh(strip(s, -0.9, 0.9, G + 0.03, false, paverTex.userData.repeat as number), paverMat);
      m.receiveShadow = true;
      group.add(m);
      walkables.push(m);
    }
  }

  // ---------------------------------------------------------- park uprostřed smyčky ulice
  const parkRand = rng(7);
  {
    const inset = ROAD_W / 2 + 0.2;
    const px0 = park.x0 + inset, px1 = park.x1 - inset, py0 = park.y0 + inset, py1 = park.y1 - inset;
    if (px1 > px0 && py1 > py0) {
      group.add(flat(polyShape([[px0, py0], [px1, py0], [px1, py1], [px0, py1]]), G + 0.05, lawnMat, lawnTex.userData.repeat as number));
      for (let i = 0; i < 10; i++) {
        const x = px0 + 3 + parkRand() * (px1 - px0 - 6), y = py0 + 3 + parkRand() * (py1 - py0 - 6);
        group.add(tree(x, y, 7 + parkRand() * 5, 2.2 + parkRand() * 1.5, i));
      }
    }
  }

  // ---------------------------------------------------------- keře
  for (const [x, y, r] of BUSHES) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[(x * 10) % leafMats.length | 0]);
    b.position.set(x, G + r * 0.7, y);
    b.scale.y = 0.8;
    b.castShadow = b.receiveShadow = true;
    group.add(b);
  }

  // ---------------------------------------------------------- zahrada a plot
  group.add(flat(polyShape(GARDEN), G + 0.02, lawnMat, lawnTex.userData.repeat as number));
  const gRand = rng(42);
  let placed = 0;
  for (let i = 0; i < 200 && placed < 14; i++) {
    const x = -30 + gRand() * 41, y = -25 + gRand() * 32;
    if (!inside([x, y], GARDEN) || (x > -3 && y > -3)) continue; // ne těsně u domu
    group.add(tree(x, y, 6 + gRand() * 6, 1.8 + gRand() * 1.6, placed, gRand() < 0.25));
    placed++;
  }
  for (let i = 0; i < FENCE_BACK.length - 1; i++) fence(group, colliders, FENCE_BACK[i], FENCE_BACK[i + 1], { h: 1.5 });
  for (let i = 0; i < FENCE_SIDE.length - 1; i++) fence(group, colliders, FENCE_SIDE[i], FENCE_SIDE[i + 1], { base: 0.6, h: 1.0 });
  // uliční plot: podezdívka + pletivo, vrata ke garáži, branka ke vstupu
  const [sa, sb] = STREET_FENCE;
  const at = (x: number): Pt => [x, sa[1] + ((x - sa[0]) / (sb[0] - sa[0])) * (sb[1] - sa[1])];
  fence(group, colliders, sa, at(GARAGE_GATE[0]), { base: 0.6, h: 1.0 });
  fence(group, colliders, at(GARAGE_GATE[1]), at(HOUSE_GATE[0]), { base: 0.6, h: 1.0 });
  fence(group, colliders, at(HOUSE_GATE[1]), sb, { base: 0.6, h: 1.0 });
  // vrata ke garáži (dvě křídla, dole plný plech, nahoře pletivo)
  const gw = (GARAGE_GATE[1] - GARAGE_GATE[0]) / 2;
  for (let k = 0; k < 2; k++) {
    const x0 = GARAGE_GATE[0] + k * gw;
    const [cx, cy] = at(x0 + gw / 2);
    const leaf = new THREE.Group();
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(gw - 0.06, 0.75, 0.04), fenceGreen);
    sheet.position.y = 0.45;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(gw - 0.06, 0.75), fenceMeshMat);
    mesh.position.y = 1.2;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(gw - 0.02, 0.05, 0.05), fenceGreen);
    frame.position.y = 1.58;
    leaf.add(sheet, mesh, frame);
    leaf.position.set(cx, G, cy);
    leaf.rotation.y = -Math.atan2(sb[1] - sa[1], sb[0] - sa[0]);
    group.add(leaf);
    colliders.push(sheet, mesh);
  }
  // branka ke vstupu (pozinkovaná, otevřená dovnitř)
  {
    const w = HOUSE_GATE[1] - HOUSE_GATE[0];
    const hinge = at(HOUSE_GATE[1]);
    const leaf = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.5), new THREE.MeshStandardMaterial({ map: meshTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: '#d7dadc', metalness: 0.5, roughness: 0.4 }));
    m.position.set(-w / 2, 0.8, 0);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.04), zincMat);
    fr.position.set(-w / 2, 1.55, 0);
    leaf.add(m, fr);
    leaf.position.set(hinge[0], G, hinge[1]);
    leaf.rotation.y = -Math.PI / 2 + 0.25; // otevřená dovnitř pozemku
    group.add(leaf);
  }

  scene.add(group);
  return { site: group, colliders, walkables };
}
