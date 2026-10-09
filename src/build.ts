import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  BALCONY, FOOTPRINT, GARAGE, GARDEN_STEPS, LEVELS, Level, ROOF, Room, STAIR, STAIR_FRONT, STAIR_HOLE, TERRAIN_Z, Wall, roofFaces, roofHeight, DORMER, dormerRoofZ,
} from './house';
import context from './context.json';

const M = (v: number) => v / 100; // cm -> m
type TopFn = ((x: number, y: number) => number) | null;

// ---------------------------------------------------------------- materiály
export const clipPlanes: THREE.Plane[] = [];
const clipped: THREE.Material[] = [];
function track<T extends THREE.Material>(m: T): T {
  clipped.push(m);
  return m;
}
export function setClipping(planes: THREE.Plane[]) {
  for (const m of clipped) {
    m.clippingPlanes = planes.length ? planes : null;
    m.clipShadows = true;
    m.needsUpdate = true;
  }
}

const COL = {
  facade: new THREE.Color('#dcc59b'),
  facadeStair: new THREE.Color('#eeeae0'),
  plaster: new THREE.Color('#f3f0ea'),
  cap: '#d98c64',
};

const wallMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
const capMat = track(new THREE.MeshBasicMaterial({ color: COL.cap, side: THREE.BackSide }));
const slabMat = track(new THREE.MeshStandardMaterial({ color: '#cfc8bd', roughness: 0.95 }));
let stairMat: THREE.MeshStandardMaterial; // teraco, vytvoří se po texturách
const greenMat = track(new THREE.MeshStandardMaterial({ color: '#2f6b55', roughness: 0.6, metalness: 0.3 }));
const pavedMat = track(new THREE.MeshStandardMaterial({ color: '#b3aea5', roughness: 0.95 })); // garáž, sjezd, balkon
const railMat = track(new THREE.MeshStandardMaterial({ color: '#7d847c', roughness: 0.6, metalness: 0.3 }));
const frameMat = track(new THREE.MeshStandardMaterial({ color: '#fbfbf8', roughness: 0.5 }));
const glassMat = track(
  new THREE.MeshPhysicalMaterial({
    color: '#bcd6e6', transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1,
    side: THREE.DoubleSide, depthWrite: false,
  }),
);
const roofMat = track(new THREE.MeshStandardMaterial({ color: '#5b4b44', roughness: 0.85, shadowSide: THREE.DoubleSide }));
const soffitMat = track(new THREE.MeshStandardMaterial({ color: '#c9b394', roughness: 0.9, side: THREE.BackSide }));
const chimneyMat = track(new THREE.MeshStandardMaterial({ color: '#d8c7a6', roughness: 0.9 }));

function canvasTex(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function noise(g: CanvasRenderingContext2D, s: number, a: number) {
  const img = g.getImageData(0, 0, s, s);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * a;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}
const floorTex = {
  wood: canvasTex((g, s) => {
    const rows = 8;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * s * 0.5 + r * 37;
      for (let k = -1; k < 2; k++) {
        const l = 120 + Math.random() * 40;
        g.fillStyle = `hsl(${28 + Math.random() * 6},${42 + Math.random() * 10}%,${l / 3.2}%)`;
        g.fillRect((off + k * s) % (2 * s) - s * 0.5, (r * s) / rows, s, s / rows);
      }
      g.fillStyle = 'rgba(40,20,10,.35)';
      g.fillRect(0, (r * s) / rows, s, 1.5);
    }
    noise(g, s, 18);
  }),
  tile: canvasTex((g, s) => {
    g.fillStyle = '#e9e6df'; g.fillRect(0, 0, s, s);
    g.strokeStyle = '#b8b2a8'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo((i * s) / 4, 0); g.lineTo((i * s) / 4, s); g.stroke();
      g.beginPath(); g.moveTo(0, (i * s) / 4); g.lineTo(s, (i * s) / 4); g.stroke();
    }
    noise(g, s, 8);
  }),
  stone: canvasTex((g, s) => {
    g.fillStyle = '#b7aa98'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#a8836a' : '#cbbfae';
      g.fillRect((i * s) / 2 + 2, (j * s) / 2 + 2, s / 2 - 4, s / 2 - 4);
    }
    noise(g, s, 14);
  }),
  carpet: canvasTex((g, s) => {
    g.fillStyle = '#9c8f7c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `hsla(${30 + Math.random() * 15},${12 + Math.random() * 12}%,${46 + Math.random() * 18}%,.5)`;
      g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
    }
  }),
  linoleum: canvasTex((g, s) => {
    g.fillStyle = '#b9c0ad'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? '255,255,250' : '110,120,100'},.18)`;
      g.lineWidth = 1 + Math.random() * 3;
      g.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
    noise(g, s, 6);
  }),
  brownTile: canvasTex((g, s) => {
    g.fillStyle = '#4e3426'; g.fillRect(0, 0, s, s);
    const n = 4, t = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = `hsl(22,${38 + Math.random() * 8}%,${27 + Math.random() * 6}%)`;
      g.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
    }
    noise(g, s, 10);
  }),
  terrazzo: canvasTex((g, s) => {
    g.fillStyle = '#c9c4ba'; g.fillRect(0, 0, s, s);
    const cols = ['#8d8478', '#6f6a62', '#e8e3d9', '#a8927a', '#56504a', '#b7ab98'];
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      const r = 0.8 + Math.random() * 2.6;
      g.beginPath(); g.ellipse(Math.random() * s, Math.random() * s, r, r * (0.5 + Math.random() * 0.5), Math.random() * 3, 0, 7); g.fill();
    }
    noise(g, s, 6);
  }),
  concrete: canvasTex((g, s) => {
    g.fillStyle = '#a9a69f'; g.fillRect(0, 0, s, s);
    noise(g, s, 30);
  }),
};
const floorMats = Object.fromEntries(
  Object.entries(floorTex).map(([k, t]) => [k, track(new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 }))]),
) as Record<keyof typeof floorTex, THREE.MeshStandardMaterial>;
stairMat = track(new THREE.MeshStandardMaterial({ map: floorTex.terrazzo.clone(), roughness: 0.55 }));
stairMat.map!.repeat.set(1.3, 1.3);
stairMat.map!.needsUpdate = true;
const floorRepeat = { wood: 1.6, tile: 1.2, stone: 0.8, concrete: 0.4, carpet: 1, linoleum: 0.6, brownTile: 1.25, terrazzo: 1.3 };

// bílý obklad 15 × 15 cm
const wallTileTex = canvasTex((g, s) => {
  g.fillStyle = '#c9cdcf'; g.fillRect(0, 0, s, s);
  const n = 4, t = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = `hsl(200,8%,${94 + Math.random() * 3}%)`;
    g.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
  }
});
const wallTileMat = track(new THREE.MeshStandardMaterial({ map: wallTileTex, roughness: 0.25, metalness: 0.05 }));
const TILE_REPEAT = 100 / 60; // 4 dlaždice na 60 cm

/** Obklad stěn místnosti do výšky H, s vynechanými otvory (dveře, okna). */
function buildWallTiles(room: Room, lv: Level, parent: THREE.Object3D) {
  const H = room.wallTiles!;
  const [x0, y0, x1, y1] = room.r;
  const off = 0.6; // cm od líce zdi
  const sides = [
    { fixed: y0, axis: 'x', range: [x0, x1], match: (w: Wall) => Math.abs(w.r[3] - y0) < 2, rot: 0, pos: (a: number) => [a, y0 + off] },
    { fixed: y1, axis: 'x', range: [x0, x1], match: (w: Wall) => Math.abs(w.r[1] - y1) < 2, rot: Math.PI, pos: (a: number) => [a, y1 - off] },
    { fixed: x0, axis: 'y', range: [y0, y1], match: (w: Wall) => Math.abs(w.r[2] - x0) < 2, rot: Math.PI / 2, pos: (a: number) => [x0 + off, a] },
    { fixed: x1, axis: 'y', range: [y0, y1], match: (w: Wall) => Math.abs(w.r[0] - x1) < 2, rot: -Math.PI / 2, pos: (a: number) => [x1 - off, a] },
  ] as const;
  for (const side of sides) {
    const [s0, s1] = side.range;
    const ops = lv.walls
      .filter((w) => side.match(w) && (side.axis === 'x' ? w.r[0] < s1 && w.r[2] > s0 : w.r[1] < s1 && w.r[3] > s0))
      .flatMap((w) => w.o ?? [])
      .filter((o) => o.b > s0 && o.a < s1)
      .sort((p, q) => p.a - q.a);
    const pieces: [number, number, number, number][] = [];
    let cur = s0;
    for (const o of ops) {
      const a = Math.max(o.a, s0), b = Math.min(o.b, s1);
      if (a > cur) pieces.push([cur, a, 0, H]);
      if (o.sill > 0) pieces.push([a, b, 0, Math.min(o.sill, H)]);
      if (o.sill + o.h < H) pieces.push([a, b, o.sill + o.h, H]);
      cur = Math.max(cur, b);
    }
    if (cur < s1) pieces.push([cur, s1, 0, H]);
    for (const [a, b, za, zb] of pieces) {
      if (b - a < 1 || zb - za < 1) continue;
      const pg = new THREE.PlaneGeometry(M(b - a), M(zb - za));
      const uv = pg.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, M(a + uv.getX(i) * (b - a)) * TILE_REPEAT, M(za + uv.getY(i) * (zb - za)) * TILE_REPEAT);
      }
      const m = new THREE.Mesh(pg, wallTileMat);
      const [px, py] = side.pos((a + b) / 2);
      m.position.set(M(px), M(lv.z + (za + zb) / 2), M(py));
      m.rotation.y = side.rot;
      m.receiveShadow = true;
      m.raycast = () => {};
      parent.add(m);
    }
  }
}

// ---------------------------------------------------------------- geometrie
/** Kvádr v cm (půdorysné x,y; výška z). Vrchní plocha může být oříznuta funkcí top (např. střechou). */
class BoxBuilder {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = []; // planární UV v metrech (pro textury schodů, podest)
  constructor(private colorFn?: (cx: number, cy: number, nx: number, ny: number) => THREE.Color) {}

  add(x0: number, y0: number, x1: number, y1: number, zb: number, zt: number, top: TopFn = null) {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01 || zt - zb < 0.01) return;
    if (top) {
      // rozdělit po délce, aby oříznutí kopírovalo střechu
      const alongX = x1 - x0 >= y1 - y0;
      const L = alongX ? x1 - x0 : y1 - y0;
      const n = Math.max(1, Math.ceil(L / 10));
      if (n > 1) {
        for (let i = 0; i < n; i++) {
          const a = i / n, b = (i + 1) / n;
          if (alongX) this.quadBox(x0 + (x1 - x0) * a, y0, x0 + (x1 - x0) * b, y1, zb, zt, top);
          else this.quadBox(x0, y0 + (y1 - y0) * a, x1, y0 + (y1 - y0) * b, zb, zt, top);
        }
        return;
      }
    }
    this.quadBox(x0, y0, x1, y1, zb, zt, top);
  }

  private quadBox(x0: number, y0: number, x1: number, y1: number, zb: number, zt: number, top: TopFn) {
    const t = (x: number, y: number) => Math.max(zb + 1, top ? Math.min(zt, top(x, y)) : zt);
    // rohy (půdorys): 0=(x0,y0) 1=(x1,y0) 2=(x1,y1) 3=(x0,y1)
    const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const B = c.map(([x, y]) => [M(x), M(zb), M(y)]);
    const T = c.map(([x, y]) => [M(x), M(t(x, y)), M(y)]);
    const quad = (a: number[], b: number[], cc: number[], d: number[], nx: number, ny: number) => {
      const color = this.colorFn
        ? this.colorFn((a[0] + cc[0]) * 50, (a[2] + cc[2]) * 50, nx, ny)
        : COL.plaster;
      for (const v of [a, b, cc, a, cc, d]) {
        this.pos.push(v[0], v[1], v[2]);
        this.col.push(color.r, color.g, color.b);
        if (nx) this.uv.push(v[2], v[1]);
        else if (ny) this.uv.push(v[0], v[1]);
        else this.uv.push(v[0], v[2]);
      }
    };
    // vrch, spodek (CCW při pohledu zvenku)
    quad(T[0], T[3], T[2], T[1], 0, 0);
    quad(B[0], B[1], B[2], B[3], 0, 0);
    // boky
    quad(B[0], T[0], T[1], B[1], 0, -1); // y0 strana
    quad(B[1], T[1], T[2], B[2], 1, 0); // x1
    quad(B[2], T[2], T[3], B[3], 0, 1); // y1
    quad(B[3], T[3], T[0], B[0], -1, 0); // x0
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

/** Leží bod na obvodu domu? (pro barvu fasády) */
function onFacade(x: number, y: number) {
  for (let i = 0; i < FOOTPRINT.length; i++) {
    const [ax, ay] = FOOTPRINT[i];
    const [bx, by] = FOOTPRINT[(i + 1) % FOOTPRINT.length];
    if (ax === 1100 && bx === 1100) continue; // štít se sousedem
    if (ax === bx && Math.abs(x - ax) < 1 && y >= Math.min(ay, by) - 1 && y <= Math.max(ay, by) + 1) return true;
    if (ay === by && Math.abs(y - ay) < 1 && x >= Math.min(ax, bx) - 1 && x <= Math.max(ax, bx) + 1) return true;
  }
  return false;
}
const wallColor = (cx: number, cy: number, nx: number, ny: number) => {
  if ((nx || ny) && onFacade(cx, cy)) return cx >= 829 && cy > 1399 ? COL.facadeStair : COL.facade;
  // vnější líce bočnic vikýře
  if (ny && cx < DORMER.depth && (Math.abs(cy - DORMER.y0) < 1 || Math.abs(cy - DORMER.y1) < 1)) return COL.facade;
  return COL.plaster;
};

export type LevelObj = {
  level: Level;
  group: THREE.Group;
  labels: CSS2DObject[];
  walls: THREE.Mesh; // pro kolize
  rails: THREE.Mesh;
  floors: THREE.Object3D[]; // pro chůzi
};

function addMesh(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, withCap = true) {
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  if (withCap) {
    const cap = new THREE.Mesh(g, capMat);
    cap.raycast = () => {};
    parent.add(cap);
  }
  return mesh;
}

function buildWall(w: Wall, lv: Level, wb: BoxBuilder, rb: BoxBuilder, fb: BoxBuilder, glass: THREE.Group, top: TopFn) {
  const [x0, y0, x1, y1] = w.r;
  const zb = lv.z;
  const H = w.h ?? lv.height;
  const zt = zb + H;
  const target = w.kind === 'railing' ? rb : wb;
  const alongX = x1 - x0 >= y1 - y0;
  const [s0, s1] = alongX ? [x0, x1] : [y0, y1];
  const piece = (a: number, b: number, za: number, zb2: number) => {
    if (alongX) target.add(a, y0, b, y1, za, zb2, top);
    else target.add(x0, a, x1, b, za, zb2, top);
  };
  const ops = w.o ?? [];
  // úseky zdi mezi hranami otvorů; otvory se mohou překrývat (např. dveře a okno nad nimi)
  const cuts = [...new Set([s0, s1, ...ops.flatMap((o) => [o.a, o.b])])].sort((p, q) => p - q);
  for (let i = 0; i < cuts.length - 1; i++) {
    const a = cuts[i], b = cuts[i + 1];
    const over = ops.filter((o) => o.a <= a && o.b >= b).sort((p, q) => p.sill - q.sill);
    let z = 0;
    for (const o of over) {
      if (o.sill > z) piece(a, b, zb + z, zb + o.sill);
      z = Math.max(z, o.sill + o.h);
    }
    if (z < H) piece(a, b, zb + z, zt);
  }
  for (const o of ops) {
    if (o.kind === 'window') {
      // rám + sklo uprostřed tloušťky zdi
      const f = 5;
      const zs = zb + o.sill, ze = zb + o.sill + o.h;
      const mid = alongX ? (y0 + y1) / 2 : (x0 + x1) / 2;
      const fr = (a: number, b: number, za: number, zz: number) =>
        alongX ? fb.add(a, mid - 4, b, mid + 4, za, zz) : fb.add(mid - 4, a, mid + 4, b, za, zz);
      fr(o.a, o.b, zs, zs + f);
      fr(o.a, o.b, ze - f, ze);
      fr(o.a, o.a + f, zs, ze);
      fr(o.b - f, o.b, zs, ze);
      fr((o.a + o.b) / 2 - 2.5, (o.a + o.b) / 2 + 2.5, zs, ze);
      const pg = new THREE.PlaneGeometry(M(o.b - o.a), M(o.h));
      const pm = new THREE.Mesh(pg, glassMat);
      pm.position.set(alongX ? M((o.a + o.b) / 2) : M(mid), M((zs + ze) / 2), alongX ? M(mid) : M((o.a + o.b) / 2));
      if (!alongX) pm.rotation.y = Math.PI / 2;
      pm.raycast = () => {};
      glass.add(pm);
    }
  }
}

/** Pravoúhlý polygon zmenšený o d (cm) dovnitř – hrany desek pak neleží v líci fasády. */
function insetPoly(pts: [number, number][], d: number): [number, number][] {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
    area += ax * by - bx * ay;
  }
  const sg = area > 0 ? 1 : -1;
  const normal = (a: [number, number], b: [number, number]) => {
    const dx = Math.sign(b[0] - a[0]), dy = Math.sign(b[1] - a[1]);
    return [-dy * sg, dx * sg];
  };
  return pts.map((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length], next = pts[(i + 1) % pts.length];
    const n1 = normal(prev, p), n2 = normal(p, next);
    return [p[0] + d * (n1[0] + n2[0]), p[1] + d * (n1[1] + n2[1])];
  });
}

function footprintShape(holes: number[][] = []) {
  const s = new THREE.Shape(insetPoly(FOOTPRINT, 2).map(([x, y]) => new THREE.Vector2(M(x), M(y))));
  for (const [x0, y0, x1, y1] of holes) {
    s.holes.push(new THREE.Path([
      new THREE.Vector2(M(x0), M(y0)), new THREE.Vector2(M(x0), M(y1)),
      new THREE.Vector2(M(x1), M(y1)), new THREE.Vector2(M(x1), M(y0)),
    ]));
  }
  return s;
}

/** Schodiště z podlaží z do z+300 (dvouramenné, mezipodesta u ulice). */
function buildStairs(z: number, sb: BoxBuilder, wb: BoxBuilder) {
  const { x0, x1, split, flight, midLanding } = STAIR;
  const n = 9, rise = 15, run = (flight[1] - flight[0]) / 10;
  for (let i = 0; i < n; i++) {
    const t = z + rise * (i + 1);
    sb.add(split, flight[0] + run * i, x1, flight[0] + run * (i + 1), t - 30, t); // rameno A (k ulici)
    const t2 = z + 150 + rise * (i + 1);
    sb.add(x0, flight[1] - run * (i + 1), split, flight[1] - run * i, t2 - 30, t2); // rameno B (zpět)
  }
  // mezipodesta; u vstupu (suterén → přízemí) včetně prahu dveří v uliční zdi
  sb.add(x0, midLanding[0], x1, z < -150 ? STAIR_FRONT.y : midLanding[1], z + 130, z + 150);
  // středová zídka mezi rameny
  wb.add(split - 6, flight[0], split + 6, flight[1], z, z + 300);
}

export function buildHouse(scene: THREE.Scene) {
  const house = new THREE.Group();
  house.name = 'house';
  scene.add(house);
  const levels: LevelObj[] = [];

  LEVELS.forEach((lv, idx) => {
    const g = new THREE.Group();
    g.name = lv.id;
    const isAttic = lv.id === 'A';
    const top: TopFn = isAttic ? (x, y) => roofHeight(x, y) - 6 : null;
    const wb = new BoxBuilder(wallColor);
    const rb = new BoxBuilder();
    const fb = new BoxBuilder();
    const sb = new BoxBuilder();
    const glass = new THREE.Group();
    for (const w of lv.walls) buildWall(w, lv, wb, rb, fb, glass, top);

    // strop/podlahová deska
    // otvor schodiště ve stropech je protažený až k fasádě – vstupní dveře a okna schodiště přecházejí přes desku
    let slabShape: THREE.Shape;
    if (idx > 0) {
      const [hx0, hy0, hx1] = STAIR_HOLE;
      const pts: [number, number][] = [[0, 0], [1100, 0], [1100, STAIR_FRONT.y], [hx1, STAIR_FRONT.y], [hx1, hy0], [hx0, hy0], [hx0, STAIR_FRONT.y], [STAIR_FRONT.x0, STAIR_FRONT.y], [STAIR_FRONT.x0, 1400], [350, 1400], [350, 900], [0, 900]];
      slabShape = new THREE.Shape(insetPoly(pts, 2).map(([x, y]) => new THREE.Vector2(M(x), M(y))));
    } else slabShape = footprintShape(idx === 0 ? [] : [STAIR_HOLE]);
    const slabG = new THREE.ExtrudeGeometry(slabShape, { depth: 0.3, bevelEnabled: false });
    slabG.rotateX(Math.PI / 2);
    slabG.translate(0, M(lv.z), 0);
    const slab = addMesh(g, slabG, slabMat);

    // balkon ve výřezu
    const pb = new BoxBuilder(); // zpevněné plochy: balkon, garáž, sjezd
    const gb = new BoxBuilder(); // zelené plechové prvky (stříška nad garáží)
    if (lv.id === 'P') pb.add(850, STAIR_FRONT.y, 1050, STAIR_FRONT.y + 50, 95, 108); // stříška nad vstupem
    if (lv.id === 'S') gb.add(395, 1400, STAIR_FRONT.x0, 1455, -42, -34); // zelená stříška nad vraty
    if (lv.id === 'P' || lv.id === '1P') pb.add(BALCONY[0], BALCONY[1], BALCONY[2], BALCONY[3], lv.z - 20, lv.z);
    // garáž: zvýšená podlaha + sjezd z ulice s opěrnými zídkami
    if (lv.id === 'S') {
      const [gx0, gy0, gx1, gy1] = GARAGE.room;
      pb.add(gx0, gy0, gx1, gy1, lv.z, lv.z + GARAGE.floor);
      const [rx0, ry0, rx1, ry1] = GARAGE.ramp;
      const bottom = lv.z + GARAGE.floor;
      const rampTop = (_x: number, y: number) => bottom + ((y - ry0) / (ry1 - ry0)) * (TERRAIN_Z - bottom);
      pb.add(rx0, ry0 - 45, rx1, ry0, bottom - 20, bottom); // práh ve vratech
      pb.add(rx0, ry0, rx1, ry1, bottom - 30, TERRAIN_Z, rampTop);
      wb.add(rx0 - 20, GARDEN_STEPS.y1 + 20, rx0, ry1, bottom - 30, TERRAIN_Z + 15);
      wb.add(rx1, ry0, rx1 + 20, ry1, bottom - 30, TERRAIN_Z + 15);
      // schody ze sjezdu nahoru na terén (cesta kolem domu do zahrady)
      const { x0: sx0, x1: sx1, y0: sy0, y1: sy1, n } = GARDEN_STEPS;
      const base = -240, rise = (TERRAIN_Z - base) / n, run = (sx1 - sx0) / n;
      pb.add(sx1, sy0, rx0, sy1, base - 30, base); // nástupní plocha u sjezdu
      for (let i = 0; i < n; i++) {
        const t = base + rise * (i + 1);
        pb.add(sx1 - run * (i + 1), sy0, sx1 - run * i, sy1, base - 30, t);
      }
      wb.add(sx0, sy1, rx0, sy1 + 20, base - 30, TERRAIN_Z + 15); // opěrná zídka schodů
    }
    // schodiště nahoru z tohoto podlaží
    if (idx < LEVELS.length - 1) buildStairs(lv.z, sb, wb);

    const walls = addMesh(g, wb.geometry(), wallMat);
    const rails = addMesh(g, rb.geometry(), railMat);
    addMesh(g, fb.geometry(), frameMat, false);
    const stairs = addMesh(g, sb.geometry(), stairMat);
    const paved = addMesh(g, pb.geometry(), pavedMat);
    addMesh(g, gb.geometry(), greenMat);
    g.add(glass);

    // podlahy místností
    const floors: THREE.Object3D[] = [slab, stairs, paved];
    const labels: CSS2DObject[] = [];
    for (const r of lv.rooms) {
      const [x0, y0, x1, y1] = r.r;
      const w = M(x1 - x0), d = M(y1 - y0);
      const pg = new THREE.PlaneGeometry(w, d);
      const rep = floorRepeat[r.floor];
      const uv = pg.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * rep, uv.getY(i) * d * rep);
      const fm = new THREE.Mesh(pg, floorMats[r.floor]);
      fm.rotation.x = -Math.PI / 2;
      fm.position.set(M((x0 + x1) / 2), M(lv.z + (r.dz ?? 0)) + 0.004, M((y0 + y1) / 2));
      fm.receiveShadow = true;
      g.add(fm);
      floors.push(fm);
      if (r.wallTiles) buildWallTiles(r, lv, g);
      if (r.name && r.name !== 'Schodiště') {
        const el = document.createElement('div');
        el.className = 'room-label';
        el.innerHTML = `<b>${r.name}</b><span>${(((x1 - x0) * (y1 - y0)) / 1e4).toFixed(1)} m²</span>`;
        const lab = new CSS2DObject(el);
        lab.position.set(M((x0 + x1) / 2), M(lv.z) + 0.3, M((y0 + y1) / 2));
        lab.visible = false;
        g.add(lab);
        labels.push(lab);
      }
    }
    house.add(g);
    levels.push({ level: lv, group: g, labels, walls, rails, floors });
  });

  // ---------------------------------------------------------- střecha
  const roof = new THREE.Group();
  roof.name = 'roof';
  const P = (x: number, y: number, z: number) => new THREE.Vector3(M(x), M(z), M(y));
  const faces = roofFaces();
  const tri: THREE.Vector3[] = [];
  const triCm: [number, number, number][][] = []; // pro vrstevnice tašek
  for (const f of faces) {
    const contour = f.pts.map(([x, y]) => new THREE.Vector2(x, y));
    const holes = (f.holes ?? []).map((hl) => hl.map(([x, y]) => new THREE.Vector2(x, y)));
    const all = [...f.pts, ...(f.holes ?? []).flat()];
    const idx = THREE.ShapeUtils.triangulateShape(contour, holes);
    for (const [a, b, c] of idx) {
      const t = [a, b, c].map((i) => [all[i][0], all[i][1], f.h(all[i][0], all[i][1])] as [number, number, number]);
      // orientace: normála vzhůru
      const [p0, p1, p2] = t;
      const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
      const ord = cross > 0 ? [p0, p2, p1] : [p0, p1, p2];
      triCm.push(ord);
      for (const v of ord) tri.push(P(v[0], v[1], v[2]));
    }
  }
  const rg = new THREE.BufferGeometry().setFromPoints(tri);
  rg.computeVertexNormals();
  const roofMesh = new THREE.Mesh(rg, roofMat);
  roofMesh.castShadow = roofMesh.receiveShadow = true;
  roof.add(roofMesh);
  const soffit = new THREE.Mesh(rg, soffitMat); // podhled / krokve zespodu
  soffit.receiveShadow = true;
  soffit.raycast = () => {};
  roof.add(soffit);
  // řady tašek – vrstevnice po 30 cm výšky
  const lines: THREE.Vector3[] = [];
  const R = ROOF.eave + ROOF.rise;
  for (let h = ROOF.eave - 30; h < R; h += 22) {
    for (const t of triCm) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < 3; i++) {
        const a = t[i], b = t[(i + 1) % 3];
        if ((a[2] - h) * (b[2] - h) < 0) {
          const k = (h - a[2]) / (b[2] - a[2]);
          pts.push(P(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, h + 1.5));
        }
      }
      if (pts.length === 2) lines.push(pts[0], pts[1]);
    }
  }
  // hřebeny, nároží a úžlabí
  const edges: THREE.Vector3[] = [];
  for (const f of faces) {
    for (let i = 0; i < f.pts.length; i++) {
      const a = f.pts[i], b = f.pts[(i + 1) % f.pts.length];
      const ha = f.h(a[0], a[1]), hb = f.h(b[0], b[1]);
      if (ha > ROOF.eave - 10 || hb > ROOF.eave - 10) edges.push(P(a[0], a[1], ha + 2), P(b[0], b[1], hb + 2));
    }
  }
  const lineMat = track(new THREE.LineBasicMaterial({ color: '#3f332e', transparent: true, opacity: 0.45 }));
  roof.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines), lineMat));
  roof.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(edges),
    track(new THREE.LineBasicMaterial({ color: '#2a201c' })),
  ));
  // pultová stříška vikýře
  const db = new BoxBuilder(() => new THREE.Color('#5b4b44'));
  db.add(-25, DORMER.y0 - 15, DORMER.depth + 15, DORMER.y1 + 15, DORMER.z0 - 14, DORMER.z0 + 40, (x) => dormerRoofZ(x) + 10);
  addMesh(roof, db.geometry(), track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
  const cb = new BoxBuilder(() => new THREE.Color('#d8c7a6'));
  for (const [x0, y0, x1, y1] of [[560, 770, 650, 805], [920, 610, 1010, 665], [690, 440, 745, 480]]) {
    const top = Math.max(roofHeight(x0, y0), roofHeight(x1, y0), roofHeight(x1, y1), roofHeight(x0, y1)) + 110;
    cb.add(x0, y0, x1, y1, 600, top);
  }
  addMesh(roof, cb.geometry(), chimneyMat).material = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  house.add(roof);

  return { house, levels, roof };
}

// ---------------------------------------------------------------- okolí (OpenStreetMap)
type Ctx = {
  buildings: { levels: number; roof: string; type: string; pts: [number, number][] }[];
  roads: { kind: string; name: string; pts: [number, number][] }[];
};

export function buildSurroundings(scene: THREE.Scene) {
  const ctx = context as unknown as Ctx;
  const group = new THREE.Group();
  group.name = 'context';

  // terén s otvorem pro dům
  const size = 260;
  const ground = new THREE.Shape([
    new THREE.Vector2(-size, -size), new THREE.Vector2(size, -size),
    new THREE.Vector2(size, size), new THREE.Vector2(-size, size),
  ]);
  ground.holes.push(new THREE.Path(FOOTPRINT.map(([x, y]) => new THREE.Vector2(M(x), M(y))).reverse()));
  {
    const [rx0, ry0, rx1, ry1] = GARAGE.ramp; // výkop pro sjezd do garáže a schody vedle něj
    const { x0: sx0, y1: sy1 } = GARDEN_STEPS;
    const hole: [number, number][] = [
      [sx0, ry0 + 1], [sx0, sy1 + 20], [rx0 - 20, sy1 + 20], [rx0 - 20, ry1],
      [rx1 + 20, ry1], [rx1 + 20, ry0 + 1],
    ];
    ground.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(M(x), M(y)))));
  }
  const gg = new THREE.ShapeGeometry(ground);
  gg.rotateX(Math.PI / 2);
  const groundMat = new THREE.MeshStandardMaterial({
    map: canvasTex((g, s) => {
      g.fillStyle = '#8a9c6c'; g.fillRect(0, 0, s, s);
      noise(g, s, 7);
    }),
    roughness: 1,
  });
  const uv = gg.attributes.position;
  const uvs: number[] = [];
  for (let i = 0; i < uv.count; i++) uvs.push(uv.getX(i) / 4, uv.getZ(i) / 4);
  gg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const groundMesh = new THREE.Mesh(gg, groundMat);
  groundMesh.material.side = THREE.DoubleSide;
  groundMesh.position.y = M(TERRAIN_Z);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // okolní budovy
  const bMat = new THREE.MeshStandardMaterial({ color: '#e4ddd0', roughness: 0.95 });
  const rMat = new THREE.MeshStandardMaterial({ color: '#9b5a45', roughness: 0.9, side: THREE.DoubleSide });
  for (const b of ctx.buildings) {
    if (b.pts.length < 4) continue;
    const pts = b.pts.slice(0, -1);
    const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const h = b.type === 'garage' ? 2.6 : Math.max(1, b.levels) * 3.1;
    const eg = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    eg.rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(eg, bMat);
    mesh.position.y = M(TERRAIN_Z) + h;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    // jednoduchá šikmá střecha – jehlan nad těžištěm
    if (b.roof !== 'flat' && b.type !== 'garage') {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
      const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const tri: THREE.Vector3[] = [];
      const top = new THREE.Vector3(cx, h + 3.2, cy);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], c = pts[(i + 1) % pts.length];
        tri.push(new THREE.Vector3(a[0], h, a[1]), top, new THREE.Vector3(c[0], h, c[1]));
      }
      const rg = new THREE.BufferGeometry().setFromPoints(tri);
      rg.computeVertexNormals();
      const rm = new THREE.Mesh(rg, rMat);
      rm.position.y = M(TERRAIN_Z);
      rm.castShadow = true;
      group.add(rm);
    }
  }
  scene.add(group);
  return { context: group, ground: groundMesh };
}
