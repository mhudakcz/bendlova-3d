// Okolí domu: ulice kolem parku (asfalt, obrubníky, chodníky), park, zahrada a plot.
// Souřadnice v metrech v rovině půdorysu domu (x = napříč domem, y = k ulici), terén v TERRAIN_Z.
import * as THREE from 'three';
import { TERRAIN_Z } from './house';
import { OSM } from './osm';
import { densify, liftToTerrain, terrainY } from './terrain';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Door, makeLeaf } from './doors';

type Pt = [number, number];

const G = TERRAIN_Z / 100; // výška terénu (m)

const FX = 1.0; // úsek plotu kolmo k ulici vedle schodů (předzahrádka s keři)

// ---- výškové poměry kolem domu ----
// cestička kolem domu a dvorek jsou v úrovni ulice (G); zahrada je o kus výš a mírně stoupá.
// Zlom terénu podél cestičky je svah, za domem ho řeší zídka mezi dvorkem a zahradou se schody.
export const BREAK_X = -3.5; // zlom terénu (horní hrana svahu) podél boku domu
const PATH_X: [number, number] = [-1.0, 0.0]; // cestička těsně podél boku domu
export const YARD_Y = -3.5; // zídka mezi dvorkem a zahradou
export const YARD_STEPS = { x0: -1.0, x1: 0.0, n: 5, run: 0.3 }; // v ose cestičky
const WALL_ABOVE = 0.3; // zídka dvorku vykukuje 30 cm nad terén zahrady (celkem ~1,2 m)
const FRONT_YARD_H = 0.2; // předzahrádka je kousek nad chodníkem
/** výška terénu zahrady (m) – mírný svah směrem od domu */
const hGarden = (x: number, y: number) => G + 0.9 - 0.015 * (x - BREAK_X) - 0.008 * y;
// vyvýšená část zahrady (nad zlomem terénu a za zídkou dvorku)
export const HIGH: Pt[] = [
  [11.0, YARD_Y], [10.09, -25.38], [-30.81, -17.62], [-30.16, 6.44], [BREAK_X, 7.17], [BREAK_X, YARD_Y],
  [YARD_STEPS.x0, YARD_Y], [YARD_STEPS.x0, YARD_Y - YARD_STEPS.n * YARD_STEPS.run],
  [YARD_STEPS.x1, YARD_Y - YARD_STEPS.n * YARD_STEPS.run], [YARD_STEPS.x1, YARD_Y],
];
// Plot pozemku – odměřeno z leteckého snímku (žlutá čára), metry v souřadnicích půdorysu.
// plot ve vyšší zahradě
export const FENCE_HIGH: Pt[] = [
  [11.0, 0.0], [11.0, -1.43], [10.09, -25.38], [-30.81, -17.62], [-30.16, 6.44], [-4.2, 7.15],
];
// podezdívka s pletivem: ze svahu kolem balkonu a rohu až k ulici (u balkonů pravý úhel)
export const FENCE_LOW: Pt[] = [
  [-4.2, 7.15], [-2.77, 7.19], [-2.77, 12.5], [FX, 12.5], [FX, 18.6],
];
const PARTY_X = 11.0; // hranice se sousedem vpravo = štítová zeď domu
export const STREET_FENCE: [Pt, Pt] = [[FX, 18.75], [PARTY_X, 18.85]];
// záhony za domem u pravého plotu (z leteckého snímku): pásy podél zahrady
export const BEDS = { x0: 1.6, y0: -20.0, y1: -14.2, n: 5, w: 0.7, gap: 0.35 };
// keře v předzahrádce vedle schodů (x, y, poloměr)
export const BUSHES: [number, number, number][] = [
  [1.3, 13.0, 0.3], [1.3, 14.2, 0.3], [2.9, 17.6, 0.55], [1.5, 17.2, 0.5],
  [3.7, 17.9, 0.45], [2.0, 16.3, 0.5],
];
// cestička (dlažba v úrovni ulice): od schodů u garáže kolem balkonů a podél skladu až na dvorek
export const PATHS: [number, number, number, number][] = [
  [1.6, 14.05, 2.9, 15.2], // podesta nad schody ze sjezdu
  [0, 9.0, 3.5, 12.5], // dlažba pod balkonem a kolem schodů z balkonu
  [-2.77, 7.2, 0, 12.5], // dlažba u rohu domu
  [1.6, 10.6, 3.5, 14.05], // předzahrádkou a pod schody z balkonu
  [PATH_X[0], 10.6, 2.6, 11.6], // kolem balkonů
  [PATH_X[0], YARD_Y, PATH_X[1], 10.6], // podél boku domu (u skladu)
  [PATH_X[0], YARD_Y, 11.0, 0.0], // dvorek za domem
  [8.65, 15.3, 9.9, 18.8], // od branky ke vstupním dveřím
];
// vyvýšené plochy předzahrádky (trávník s keři)
export const FRONT_BEDS: [number, number, number, number][] = [
  [FX, 12.5, 1.6, 18.75], [1.6, 15.2, 4.25, 18.75],
  [8.1, 15.3, 8.65, 18.75], // záhon mezi sjezdem a chodníčkem ke vchodu
  [9.9, 15.3, 11.0, 18.75], // záhon u plotu k sousedovi
];
export const FENCE_SIDE: Pt[] = [[PARTY_X, 18.85], [PARTY_X, 15.3]];
export const GARAGE_GATE: [number, number] = [4.45, 7.95]; // x na uličním plotu
export const HOUSE_GATE: [number, number] = [8.75, 9.8];
// zahrada za domem (trávník)
const GARDEN: Pt[] = [
  [11.0, 0.0], [11.0, -1.43], [10.09, -25.38], [-30.81, -17.62], [-30.16, 6.44],
  [-2.77, 7.19], [-2.77, 12.5], [0, 12.5], [0, 0],
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
/** výška terénu v bodě (m) */
function terrainAt(p: Pt) {
  if (inside(p, HIGH)) return hGarden(p[0], p[1]);
  if (FRONT_BEDS.some(([x0, y0, x1, y1]) => p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1)) return G + FRONT_YARD_H;
  return G;
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
  t.position.set(x, terrainAt([x, y]), y);
  return t;
}

/** Plot: sloupky, vodorovná trubka, pletivo; volitelně betonová podezdívka. */
function fence(group: THREE.Group, colliders: THREE.Object3D[], a: Pt, b: Pt, opt: { base?: number; h?: number; wallTop?: number } = {}) {
  let base = opt.base ?? 0;
  const h = opt.h ?? 1.4;
  let g0 = (terrainAt(a) + terrainAt(b)) / 2 - 0.05; // plot stojí na terénu
  if (opt.wallTop !== undefined) {
    // podezdívka s pevnou výškou koruny – ve vyšším terénu se do něj zanoří
    g0 = Math.min(terrainAt(a), terrainAt(b)) - 0.05;
    base = opt.wallTop - g0;
  }
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 0.05) return;
  const ang = Math.atan2(dy, dx);
  const mid = (t: number): Pt => [a[0] + dx * t, a[1] + dy * t];
  const [cx, cy] = mid(0.5);
  if (base > 0) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(L, base, 0.2), concreteMat);
    w.position.set(cx, g0 + base / 2, cy);
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
  panel.position.set(cx, g0 + base + (h - 0.08) / 2, cy);
  panel.rotation.y = -ang;
  group.add(panel);
  colliders.push(panel);
  const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, L, 6), fenceGreen);
  rail.rotation.z = Math.PI / 2;
  const railG = new THREE.Group();
  railG.add(rail);
  railG.position.set(cx, g0 + base + h, cy);
  railG.rotation.y = -ang;
  group.add(railG);
  const n = Math.max(1, Math.round(L / 2.5));
  for (let i = 0; i <= n; i++) {
    const [px, py] = mid(i / n);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, h + 0.05, 8), fenceGreen);
    post.position.set(px, g0 + base + (h + 0.05) / 2, py);
    post.castShadow = true;
    group.add(post);
  }
}

export function buildSite(scene: THREE.Scene) {
  const ctx = OSM;
  const group = new THREE.Group();
  group.name = 'site';
  const colliders: THREE.Object3D[] = [];
  const walkables: THREE.Object3D[] = [];

  // ---------------------------------------------------------- ulice: asfalt, obrubníky, chodníky (okolí ~500 m)
  const ROAD_W = 5.5, CURB = 0.12, WALK_W = 1.9;
  const WIDTH: Record<string, number> = {
    trunk: 10, trunk_link: 6, primary: 9, primary_link: 6, secondary: 8, secondary_link: 6, tertiary: 7, tertiary_link: 5.5,
    residential: ROAD_W, unclassified: ROAD_W, living_street: 5, service: 3.5, track: 3,
  };
  const WITH_WALK = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street']);
  const roads = ctx.roads.filter((r) => WIDTH[r.kind] !== undefined && r.pts.length > 1).map((r) => ({ ...r, pts: densify(r.pts as Pt[], 6) }));
  // park = vnitřek smyčky ulice před domem (nejbližší silnice k uličnímu plotu)
  const distHouse = (r: { pts: Pt[] }) => Math.min(...r.pts.map((t) => Math.hypot(t[0] - 7, t[1] - 22)));
  const loop = roads.filter((r) => r.kind === 'residential').sort((p, q) => distHouse(p) - distHouse(q))[0];
  const lx = loop.pts.map((p) => p[0]), ly = loop.pts.map((p) => p[1]);
  const park = { x0: Math.min(...lx), x1: Math.max(...lx), y0: Math.min(...ly), y1: Math.max(...ly) };
  const inPark = (p: Pt) => p[0] > park.x0 + 0.5 && p[0] < park.x1 - 0.5 && p[1] > park.y0 + 0.5 && p[1] < park.y1 - 0.5;
  // úseky lomené čáry, které leží na straně parku / na straně domů
  const runs = (pts: Pt[], side: number, offset: number) => {
    const out: { park: boolean; pts: Pt[] }[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
      const probe: Pt = [(ax + bx) / 2 - (dy / l) * side * offset, (ay + by) / 2 + (dx / l) * side * offset];
      const isPark = inPark(probe);
      const last = out.at(-1);
      if (last && last.park === isPark) last.pts.push(pts[i + 1]);
      else out.push({ park: isPark, pts: [pts[i], pts[i + 1]] });
    }
    return out;
  };
  const hedgeMat = new THREE.MeshStandardMaterial({ color: '#5d7f43', roughness: 1, side: THREE.DoubleSide });
  // geometrie se sbírají po materiálech a slučují (stovky ulic → pár draw callů)
  const bucket = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const put = (m: THREE.Material, g: THREE.BufferGeometry) => { if (!bucket.has(m)) bucket.set(m, []); bucket.get(m)!.push(g); };
  const ar = asphaltTex.userData.repeat as number, pr = paverTex.userData.repeat as number;
  for (const r of roads) {
    const W = WIDTH[r.kind];
    const closed = Math.hypot(r.pts[0][0] - r.pts.at(-1)![0], r.pts[0][1] - r.pts.at(-1)![1]) < 0.5;
    const near = distHouse(r) < 70; // u domu skutečné obrubníky, dál ploché chodníky (čisté křižovatky)
    const asphaltY = near ? G + 0.01 : G + 0.1; // dál od domu nad terénem (mřížka terénu je hrubší)
    put(asphaltMat, strip(r.pts, -W / 2, W / 2, asphaltY, closed, ar));
    if (!WITH_WALK.has(r.kind)) continue;
    for (const side of [-1, 1]) {
      const o0 = (side * W) / 2;
      if (near) put(curbMat, strip(r.pts, Math.min(o0, o0 + side * 0.15), Math.max(o0, o0 + side * 0.15), G + CURB + 0.005, closed, 1, CURB));
      for (const run of runs(r.pts, side, W / 2 + 1.5)) {
        if (run.park && r === loop) {
          // park lemuje živý plot z keřů vysoký ~2 m, pás 1,5 m
          const HEDGE_H = 2.0;
          const h0 = side * (W / 2 + 0.5), h1 = side * (W / 2 + 2.0);
          put(hedgeMat, strip(run.pts, Math.min(h0, h1), Math.max(h0, h1), G + HEDGE_H, false, 1, HEDGE_H));
        } else {
          const o1 = side * (W / 2 + WALK_W);
          put(paverMat, strip(run.pts, Math.min(o0, o1), Math.max(o0, o1), near ? G + CURB : G + 0.07, false, pr, near ? CURB : 0));
        }
      }
    }
  }
  // samostatné pěšiny daleko od silnic (cesty v parcích, mezi domy)
  const segsOf = (pts: Pt[]) => pts.slice(0, -1).map((q, i) => [q, pts[i + 1]] as [Pt, Pt]);
  const roadSegs = roads.filter((r) => WITH_WALK.has(r.kind)).flatMap((r) => segsOf(r.pts).map((sg) => ({ sg, w: WIDTH[r.kind] })));
  const nearRoad = (p: Pt) => roadSegs.some(({ sg: [q, e], w }) => {
    const dx = e[0] - q[0], dy = e[1] - q[1], l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / l2));
    return Math.hypot(p[0] - q[0] - dx * t, p[1] - q[1] - dy * t) < w / 2 + WALK_W + 1.5;
  });
  for (const r0 of ctx.roads) {
    if (!['footway', 'pedestrian', 'path', 'steps', 'cycleway'].includes(r0.kind)) continue;
    const r = { ...r0, pts: densify(r0.pts as Pt[], 6) };
    const segs: Pt[][] = [];
    let cur: Pt[] = [];
    for (const p of r.pts) {
      if (nearRoad(p)) { if (cur.length > 1) segs.push(cur); cur = []; } else cur.push(p);
    }
    if (cur.length > 1) segs.push(cur);
    const w = r.kind === 'pedestrian' ? 3 : r.kind === 'path' ? 1.4 : 1.8;
    for (const sg of segs) put(paverMat, strip(sg, -w / 2, w / 2, G + 0.06, false, pr));
  }
  for (const [m, gs] of bucket) {
    const merged = mergeGeometries(gs, false);
    liftToTerrain(merged.attributes.position as THREE.BufferAttribute);
    merged.computeVertexNormals();
    const mesh = new THREE.Mesh(merged, m);
    mesh.receiveShadow = true;
    mesh.castShadow = m === hedgeMat;
    group.add(mesh);
    if (m === hedgeMat) colliders.push(mesh); else if (m !== curbMat) walkables.push(mesh);
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

  // ---------------------------------------------------------- podesta nad schody ze sjezdu: zaoblená zídka a květináč
  {
    const cx = 2.9, cy = 14.0, R = 1.3, segs = 10;
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI / 2 + (i / segs) * (Math.PI / 2), a1 = Math.PI / 2 + ((i + 1) / segs) * (Math.PI / 2);
      const p0: Pt = [cx + Math.cos(a0) * R, cy + Math.sin(a0) * R], p1: Pt = [cx + Math.cos(a1) * R, cy + Math.sin(a1) * R];
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + 0.02;
      const w = new THREE.Mesh(new THREE.BoxGeometry(L, 0.5, 0.15), concreteMat);
      w.position.set((p0[0] + p1[0]) / 2, G + 0.25, (p0[1] + p1[1]) / 2);
      w.rotation.y = -Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      w.castShadow = w.receiveShadow = true;
      group.add(w);
      colliders.push(w);
    }
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.25, 14), new THREE.MeshStandardMaterial({ color: '#4a3a32', roughness: 0.8 }));
    pot.position.set(2.35, G + 0.13, 14.6);
    const flowers = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), new THREE.MeshStandardMaterial({ color: '#3f7a3a', roughness: 1, flatShading: true }));
    flowers.position.set(2.35, G + 0.38, 14.6);
    group.add(pot, flowers);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshStandardMaterial({ color: '#e0283a' }));
      f.position.set(2.35 + Math.cos(i * 1.3) * 0.15, G + 0.55, 14.6 + Math.sin(i * 1.3) * 0.15);
      group.add(f);
    }
  }

  // ---------------------------------------------------------- květiny v záhonech u vstupu
  {
    const fr = rng(11);
    const cols = ['#e04a3a', '#f0a030', '#c050c0', '#f2e14a', '#ffffff', '#8a7fd0'];
    for (const [x0, y0, x1, y1] of FRONT_BEDS.slice(2)) {
      for (let i = 0; i < 26; i++) {
        const x = x0 + 0.1 + fr() * (x1 - x0 - 0.2), y = y0 + 0.1 + fr() * (y1 - y0 - 0.2);
        const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12 + fr() * 0.1, 0), leafMats[i % leafMats.length]);
        plant.position.set(x, G + FRONT_YARD_H + 0.12, y);
        group.add(plant);
        if (fr() < 0.6) {
          const f = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshStandardMaterial({ color: cols[(fr() * cols.length) | 0] }));
          f.position.set(x, G + FRONT_YARD_H + 0.3, y);
          group.add(f);
        }
      }
    }
  }

  // ---------------------------------------------------------- dvorek: konstrukce na prádlo, sudy, lavička
  {
    const pipe = new THREE.MeshStandardMaterial({ color: '#8a6a52', roughness: 0.6, metalness: 0.4 });
    const post = (x: number, y: number, h: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 8), pipe);
      m.position.set(x, G + h / 2, y);
      m.castShadow = true;
      group.add(m);
    };
    post(6.0, YARD_Y + 0.3, 2.1);
    post(6.0, -0.4, 2.1);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.abs(YARD_Y + 0.7), 8), pipe);
    top.rotation.x = Math.PI / 2;
    top.position.set(6.0, G + 2.1, (YARD_Y + 0.3 - 0.4) / 2);
    group.add(top);
    const barrel = (x: number, y: number, r: number, h: number, c: string, metal = 0) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: metal }));
      m.position.set(x, G + h / 2, y);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
      colliders.push(m);
    };
    barrel(0.35, -0.45, 0.29, 0.9, '#2f63b8');
    barrel(0.95, -0.5, 0.3, 0.85, '#c9ccce', 0.6);
    // lavička u zídky
    const wood = new THREE.MeshStandardMaterial({ color: '#5a3a28', roughness: 0.8 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.45), wood);
    seat.position.set(3.2, G + 0.45, YARD_Y + 0.35);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.04), wood);
    back.position.set(3.2, G + 0.7, YARD_Y + 0.14);
    for (const m of [seat, back]) { m.castShadow = true; group.add(m); }
  }

  // ---------------------------------------------------------- záhony
  const soilTex = canvasTex(128, (g, s) => {
    g.fillStyle = '#5e4632'; g.fillRect(0, 0, s, s);
    speckle(g, s, 2500, ['#6b5039', '#53402d', '#705842'], 2);
    g.fillStyle = 'rgba(110,150,80,.55)';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * s, Math.random() * s, 3, 3); // výsadba
  }, 1);
  // záhony jsou v úrovni terénu – jen pásy hlíny v trávníku
  const soilMat = new THREE.MeshStandardMaterial({
    map: soilTex, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  for (let i = 0; i < BEDS.n; i++) {
    const x0 = BEDS.x0 + i * (BEDS.w + BEDS.gap);
    group.add(flat(polyShape([[x0, BEDS.y0], [x0 + BEDS.w, BEDS.y0], [x0 + BEDS.w, BEDS.y1], [x0, BEDS.y1]]), hGarden(x0 + BEDS.w / 2, (BEDS.y0 + BEDS.y1) / 2) + 0.025, soilMat, 1));
  }

  // ---------------------------------------------------------- keře
  for (const [x, y, r] of BUSHES) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), leafMats[(x * 10) % leafMats.length | 0]);
    b.position.set(x, terrainAt([x, y]) + r * 0.7, y);
    b.scale.y = 0.8;
    b.castShadow = b.receiveShadow = true;
    group.add(b);
  }

  // ---------------------------------------------------------- zahrada a plot
  // vyvýšená zahrada (mírný svah)
  {
    const contour = HIGH.map(([x, y]) => new THREE.Vector2(x, y));
    const tris = THREE.ShapeUtils.triangulateShape(contour, []);
    const pos: number[] = [], uv: number[] = [];
    const rep = lawnTex.userData.repeat as number;
    for (const t of tris) for (const i of [t[0], t[2], t[1]]) {
      const [x, y] = HIGH[i];
      pos.push(x, hGarden(x, y), y); uv.push(x * rep, y * rep);
    }
    // svah od cestičky ke zlomu terénu
    const e = (x: number, y: number, h: number) => { pos.push(x, h, y); uv.push(x * rep, y * rep); };
    const y0 = YARD_Y, y1 = 7.17;
    e(BREAK_X, y0, hGarden(BREAK_X, y0)); e(PATH_X[0], y1, G); e(BREAK_X, y1, hGarden(BREAK_X, y1));
    e(BREAK_X, y0, hGarden(BREAK_X, y0)); e(PATH_X[0], y0, G); e(PATH_X[0], y1, G);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, lawnMat);
    m.receiveShadow = true;
    group.add(m);
    walkables.push(m);
  }
  // zídka mezi dvorkem a zahradou (s mezerou pro schody) + schody nahoru
  const wallMat = new THREE.MeshStandardMaterial({ color: '#b3ada3', roughness: 0.95 });
  const box = (x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, m: THREE.Material, collide = true, walk = false) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0), m);
    b.position.set((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2);
    b.castShadow = b.receiveShadow = true;
    group.add(b);
    if (collide) colliders.push(b);
    if (walk) walkables.push(b);
    return b;
  };
  for (const [xa, xb] of [[BREAK_X, YARD_STEPS.x0], [YARD_STEPS.x1, 11.0]] as [number, number][]) {
    for (let x = xa; x < xb - 0.01; x += 1) {
      const x2 = Math.min(xb, x + 1);
      box(x, YARD_Y - 0.2, x2, YARD_Y, G - 0.1, Math.max(hGarden(x, YARD_Y), hGarden(x2, YARD_Y)) + WALL_ABOVE, wallMat);
    }
  }
  {
    const top = hGarden((YARD_STEPS.x0 + YARD_STEPS.x1) / 2, YARD_Y - YARD_STEPS.n * YARD_STEPS.run);
    const rise = (top - G) / YARD_STEPS.n;
    for (let i = 0; i < YARD_STEPS.n; i++) {
      box(YARD_STEPS.x0, YARD_Y - YARD_STEPS.run * (i + 1), YARD_STEPS.x1, YARD_Y - YARD_STEPS.run * i, G - 0.05, G + rise * (i + 1), wallMat, false, true);
    }
    const yb = YARD_Y - YARD_STEPS.n * YARD_STEPS.run;
    box(YARD_STEPS.x0 - 0.15, yb, YARD_STEPS.x0, YARD_Y, G - 0.05, top + WALL_ABOVE, wallMat);
    box(YARD_STEPS.x1, yb, YARD_STEPS.x1 + 0.15, YARD_Y, G - 0.05, top + WALL_ABOVE, wallMat);
  }
  // dlážděná cestička a dvorek v úrovni ulice
  for (const [x0, y0, x1, y1] of PATHS) {
    const m = flat(polyShape([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), G + 0.015, paverMat, paverTex.userData.repeat as number);
    group.add(m);
    walkables.push(m);
  }
  // předzahrádka kousek nad chodníkem
  const bedTop = new THREE.MeshStandardMaterial({ map: lawnTex, roughness: 1 });
  for (const [x0, y0, x1, y1] of FRONT_BEDS) {
    const b = box(x0, y0, x1, y1, G - 0.05, G + FRONT_YARD_H, [wallMat, wallMat, bedTop, wallMat, wallMat, wallMat] as unknown as THREE.Material, false, true);
    const t = lawnTex.clone();
    t.repeat.set((x1 - x0) / 4, (y1 - y0) / 4);
    t.needsUpdate = true;
    (b.material as unknown as THREE.MeshStandardMaterial[])[2] = new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  }
  const gRand = rng(42);
  let placed = 0;
  for (let i = 0; i < 200 && placed < 14; i++) {
    const x = -30 + gRand() * 41, y = -25 + gRand() * 32;
    if (!inside([x, y], HIGH) || (x > -5 && y > -5)) continue; // jen ve vyvýšené zahradě, ne u domu
    if (x > BEDS.x0 - 2 && x < BEDS.x0 + BEDS.n * (BEDS.w + BEDS.gap) + 2 && y > BEDS.y0 - 2 && y < BEDS.y1 + 2) continue; // ne v záhonech
    group.add(tree(x, y, 6 + gRand() * 6, 1.8 + gRand() * 1.6, placed, gRand() < 0.25));
    placed++;
  }
  // plot ve vyšší zahradě (pletivo na terénu)
  for (let i = 0; i < FENCE_HIGH.length - 1; i++) fence(group, colliders, FENCE_HIGH[i], FENCE_HIGH[i + 1], { h: 1.2 });
  // podezdívka s pletivem pokračuje od ulice kolem rohu a balkonu až do svahu, kde se zanoří do terénu
  for (let i = 0; i < FENCE_LOW.length - 1; i++) fence(group, colliders, FENCE_LOW[i], FENCE_LOW[i + 1], { wallTop: G + 0.6, h: 1.0 });
  for (let i = 0; i < FENCE_SIDE.length - 1; i++) fence(group, colliders, FENCE_SIDE[i], FENCE_SIDE[i + 1], { base: 0.6, h: 1.0 });
  // uliční plot: podezdívka + pletivo, vrata ke garáži, branka ke vstupu
  const [sa, sb] = STREET_FENCE;
  const at = (x: number): Pt => [x, sa[1] + ((x - sa[0]) / (sb[0] - sa[0])) * (sb[1] - sa[1])];
  fence(group, colliders, sa, at(GARAGE_GATE[0]), { base: 0.6, h: 1.0 });
  fence(group, colliders, at(GARAGE_GATE[1]), at(HOUSE_GATE[0]), { base: 0.6, h: 1.0 });
  fence(group, colliders, at(HOUSE_GATE[1]), sb, { base: 0.6, h: 1.0 });
  // vrata ke garáži (dvě křídla, dole plný plech, nahoře pletivo) – otevíratelná dovnitř
  const doors: Door[] = [];
  const gw = (GARAGE_GATE[1] - GARAGE_GATE[0]) / 2;
  const fenceAng = -Math.atan2(sb[1] - sa[1], sb[0] - sa[0]);
  const gateLeaf = (hd: THREE.Group, w: number) => {
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(w, 0.75, 0.04), fenceGreen);
    sheet.position.set(w / 2, 0.45, 0);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, 0.75), fenceMeshMat);
    mesh.position.set(w / 2, 1.2, 0);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.05), fenceGreen);
    frame.position.set(w / 2, 1.58, 0);
    hd.add(sheet, mesh, frame);
    return [sheet, mesh];
  };
  {
    const h0 = at(GARAGE_GATE[0]), h1 = at(GARAGE_GATE[1]);
    const d0 = makeLeaf(group, [h0[0], G, h0[1]], gw, gateLeaf, Math.PI / 2, 'vrata-ulice');
    const d1 = makeLeaf(group, [h1[0], G, h1[1]], gw, gateLeaf, -Math.PI / 2, 'vrata-ulice', Math.PI);
    for (const d of [d0, d1]) d.pivot.rotation.y = fenceAng;
    doors.push(d0, d1);
  }
  // branka ke vstupu (pozinkovaná) – otevírá se dovnitř
  {
    const w = HOUSE_GATE[1] - HOUSE_GATE[0];
    const hinge = at(HOUSE_GATE[1]);
    const gateMat = new THREE.MeshStandardMaterial({ map: meshTex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, color: '#d7dadc', metalness: 0.5, roughness: 0.4 });
    const d = makeLeaf(group, [hinge[0], G, hinge[1]], w, (hd, ww) => {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(ww - 0.04, 0.6, 0.03), zincMat);
      plate.position.set(ww / 2, 0.35, 0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ww - 0.04, 0.9), gateMat);
      m.position.set(ww / 2, 1.1, 0);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(ww, 0.04, 0.04), zincMat);
      fr.position.set(ww / 2, 1.55, 0);
      hd.add(plate, m, fr);
      return [plate, m];
    }, -Math.PI / 2, 'branka', Math.PI);
    d.pivot.rotation.y = fenceAng;
    doors.push(d);
  }
  // úhel plotu se k otevření přičítá (viz main.ts – baseAngle)
  for (const d of doors) (d as Door & { base?: number }).base = fenceAng;

  scene.add(group);
  return { site: group, colliders, walkables, doors };
}
