import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import {
  BALCONY, BOILER, DOG_STEPS, FOOTPRINT, GARAGE, GARDEN_STEPS, SKLAD_PIT, LEVELS, Level, ROOF, Room, STAIR, STAIR_FRONT, STAIR_HOLE, TERRAIN_Z, Wall, roofFaces, roofHeight, DORMER, dormerRoofZ,
} from './house';
import context from './context.json';
import { Door, makeLeaf } from './doors';

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
const zincMat = track(new THREE.MeshStandardMaterial({ color: '#b9bdc0', roughness: 0.45, metalness: 0.6 }));
const greenMat = track(new THREE.MeshStandardMaterial({ color: '#7a3d2f', roughness: 0.6, metalness: 0.3 })); // hnědá plechová stříška nad vraty
const garageDoorMat = track(new THREE.MeshStandardMaterial({ color: '#6e3a2e', roughness: 0.55, metalness: 0.35 }));
const drainMat = track(new THREE.MeshStandardMaterial({ color: '#2d2d2d', roughness: 0.7, metalness: 0.4 }));
// zámková dlažba sjezdu
const rampMat = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7e7c78'; g.fillRect(0, 0, 256, 256);
  const n = 8, t = 256 / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = `hsl(30,3%,${50 + Math.random() * 8}%)`;
    const x = i * t + ((j % 2) * t) / 2;
    g.beginPath();
    g.moveTo(x + 2, j * t + 2); g.lineTo(x + t * 0.55, j * t + 2); g.lineTo(x + t * 0.45, j * t + t / 2);
    g.lineTo(x + t * 0.55, j * t + t - 2); g.lineTo(x + 2, j * t + t - 2); g.closePath(); g.fill();
    g.fillRect((x + t * 0.6) % 256, j * t + 2, t * 0.38, t - 4);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / 1.6, 1 / 1.6);
  return track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
})();
const pavedMat = track(new THREE.MeshStandardMaterial({ color: '#b3aea5', roughness: 0.95 })); // garáž, sjezd, balkon
// zábradlí balkonů: zelené pletivo jako plot (průhledné)
const railMeshTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.strokeStyle = '#ffffff'; g.lineWidth = 3;
  for (let i = 0; i <= 8; i++) {
    const p = (i * 128) / 8;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, 128); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(128, p); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 0.6, 1 / 0.6);
  return t;
})();
const railMat = track(new THREE.MeshStandardMaterial({
  color: '#3f7a5e', map: railMeshTex, alphaMap: railMeshTex, transparent: true, alphaTest: 0.3,
  side: THREE.DoubleSide, roughness: 0.55, metalness: 0.3,
}));
const railTubeMat = track(new THREE.MeshStandardMaterial({ color: '#3f7a5e', roughness: 0.5, metalness: 0.3 }));
const frameMat = track(new THREE.MeshStandardMaterial({ color: '#fbfbf8', roughness: 0.5 }));
const glassMat = track(
  new THREE.MeshPhysicalMaterial({
    color: '#9cc8e6', transparent: true, opacity: 0.38, roughness: 0.04, metalness: 0.15, // jemně modré sklo
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
  colliders: THREE.Mesh; // neviditelné zábrany (zrcadlo schodiště)
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
  if (w.kind === 'railing') {
    // trubkové madlo a sloupky
    const H = (w.h ?? 100) + lv.z;
    const alongX0 = x1 - x0 >= y1 - y0;
    const c = alongX0 ? (y0 + y1) / 2 : (x0 + x1) / 2;
    const a: [number, number] = alongX0 ? [x0, c] : [c, y0], b: [number, number] = alongX0 ? [x1, c] : [c, y1];
    bar(glass, [a[0], a[1], H], [b[0], b[1], H], 2.5, railTubeMat);
    const L = alongX0 ? x1 - x0 : y1 - y0, n = Math.max(1, Math.round(L / 150));
    for (let i = 0; i <= n; i++) {
      const px = a[0] + ((b[0] - a[0]) * i) / n, py = a[1] + ((b[1] - a[1]) * i) / n;
      bar(glass, [px, py, lv.z], [px, py, H], 2.5, railTubeMat);
    }
  }
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
      // plastové okno: bílý rám, křídla (2–3 podle šířky), modravé poloprůhledné sklo
      const f = 7; // šířka profilu rámu
      const zs = zb + o.sill, ze = zb + o.sill + o.h;
      const mid = alongX ? (y0 + y1) / 2 : (x0 + x1) / 2;
      const fr = (a: number, b: number, za: number, zz: number, d = 5) =>
        alongX ? fb.add(a, mid - d, b, mid + d, za, zz) : fb.add(mid - d, a, mid + d, b, za, zz);
      if (!o.joinBottom) fr(o.a, o.b, zs, zs + f);
      if (!o.joinTop) fr(o.a, o.b, ze - f, ze);
      fr(o.a, o.a + f, zs, ze);
      fr(o.b - f, o.b, zs, ze);
      const W = o.b - o.a;
      const panes = W > 180 ? 3 : W > 100 ? 2 : 1; // úzká okna (koupelny) jsou jednokřídlá
      for (let k = 1; k < panes; k++) {
        const c = o.a + (W * k) / panes;
        fr(c - 4, c + 4, zs, ze); // sloupek mezi křídly
      }
      // obvod jednotlivých křídel (tenčí profil uvnitř rámu)
      for (let k = 0; k < panes; k++) {
        const a0 = o.a + (W * k) / panes + (k === 0 ? f : 4), a1 = o.a + (W * (k + 1)) / panes - (k === panes - 1 ? f : 4);
        const zb0 = o.joinBottom ? zs : zs + f, ze0 = o.joinTop ? ze : ze - f;
        if (!o.joinBottom) fr(a0, a1, zb0, zb0 + 5, 3.5);
        if (!o.joinTop) fr(a0, a1, ze0 - 5, ze0, 3.5);
        fr(a0, a0 + 5, zb0, ze0, 3.5);
        fr(a1 - 5, a1, zb0, ze0, 3.5);
      }
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

function footprintShape(holes: number[][] = [], polyHoles: [number, number][][] = []) {
  const s = new THREE.Shape(insetPoly(FOOTPRINT, 2).map(([x, y]) => new THREE.Vector2(M(x), M(y))));
  for (const h of polyHoles) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(M(x), M(y)))));
  for (const [x0, y0, x1, y1] of holes) {
    s.holes.push(new THREE.Path([
      new THREE.Vector2(M(x0), M(y0)), new THREE.Vector2(M(x0), M(y1)),
      new THREE.Vector2(M(x1), M(y1)), new THREE.Vector2(M(x1), M(y0)),
    ]));
  }
  return s;
}

/** Schodiště z podlaží z do z+300 (dvouramenné, mezipodesta u ulice). */
const stairRailMat = track(new THREE.MeshStandardMaterial({ color: '#a8322b', roughness: 0.5, metalness: 0.3 }));
const invisibleMat = new THREE.MeshBasicMaterial({ visible: false });
const GAP = 10; // polovina šířky zrcadla mezi rameny (cm)

/** tyč mezi dvěma body (cm, půdorys x/y + výška z) */
function bar(parent: THREE.Object3D, a: [number, number, number], b: [number, number, number], r: number, mat: THREE.Material = stairRailMat) {
  const A = new THREE.Vector3(M(a[0]), M(a[2]), M(a[1])), B = new THREE.Vector3(M(b[0]), M(b[2]), M(b[1]));
  const len = A.distanceTo(B);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(M(r), M(r), len, 8), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  m.castShadow = true;
  m.raycast = () => {};
  parent.add(m);
}

function buildStairs(z: number, sb: BoxBuilder, wb: BoxBuilder, rails: THREE.Group, cb: BoxBuilder) {
  const { x0, x1, split, flight, midLanding } = STAIR;
  const n = 9, rise = 15, run = (flight[1] - flight[0]) / 10;
  for (let i = 0; i < n; i++) {
    const t = z + rise * (i + 1);
    sb.add(split + GAP, flight[0] + run * i, x1, flight[0] + run * (i + 1), t - 30, t); // rameno A (k ulici)
    const t2 = z + 150 + rise * (i + 1);
    sb.add(x0, flight[1] - run * (i + 1), split - GAP, flight[1] - run * i, t2 - 30, t2); // rameno B (zpět)
  }
  // mezipodesta; u vstupu (suterén → přízemí) včetně prahu dveří v uliční zdi
  // (začíná hned za posledním stupněm ramene A – bez mezery)
  sb.add(x0, flight[0] + run * n, x1, z < -150 ? STAIR_FRONT.y : midLanding[1], z + 130, z + 150);
  // horní nášlap ramene B v úrovni dalšího podlaží (navazuje na podestu před bytem)
  sb.add(x0, flight[0], split - GAP, flight[0] + run + 1, z + 280, z + 300);
  if (z < -150) {
    // mezi suterénem a přízemím je mezi rameny zeď
    wb.add(split - GAP, flight[0], split + GAP, flight[1], z, z + 300);
    return;
  }
  // červené zábradlí podél zrcadla (volný prostor mezi rameny)
  const H = 90;
  const xa = split + GAP + 3, xb = split - GAP - 3;
  const hA = (y: number) => z + (150 * (y - flight[0])) / (flight[1] - flight[0]);
  const hB = (y: number) => z + 300 - (150 * (y - flight[0])) / (flight[1] - flight[0]);
  for (const [x, h] of [[xa, hA], [xb, hB]] as [number, (y: number) => number][]) {
    bar(rails, [x, flight[0], h(flight[0]) + H], [x, flight[1], h(flight[1]) + H], 2.5);
    for (let y = flight[0] + 15; y < flight[1]; y += 30) bar(rails, [x, y, h(y)], [x, y, h(y) + H], 1);
  }
  // neviditelná zábrana (aby se při chůzi nepropadlo zrcadlem)
  cb.add(split - GAP, flight[0], split + GAP, flight[1], z, z + 400, (_x, y) => Math.max(hA(y), hB(y)) + 100);
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
    } else slabShape = idx === 0 ? footprintShape([], [SKLAD_PIT.outline]) : footprintShape([STAIR_HOLE]);
    const slabG = new THREE.ExtrudeGeometry(slabShape, { depth: 0.3, bevelEnabled: false });
    slabG.rotateX(Math.PI / 2);
    slabG.translate(0, M(lv.z), 0);
    const slab = addMesh(g, slabG, slabMat);

    // balkon ve výřezu
    const pb = new BoxBuilder(); // zpevněné plochy: balkon, garáž, sjezd
    const cb = new BoxBuilder(); // neviditelné zábrany pro chůzi
    const rampB = new BoxBuilder(), drainB = new BoxBuilder();
    const zb = new BoxBuilder(); // pozinkované ocelové prvky
    const zincRails = new THREE.Group();
    const gb = new BoxBuilder(); // zelené plechové prvky (stříška nad garáží)
    if (lv.id === 'P') pb.add(850, STAIR_FRONT.y, 1050, STAIR_FRONT.y + 50, 95, 108); // stříška nad vstupem
    if (lv.id === 'P') {
      // ocelové schody z balkonu do zahrady (pozinkovaný rošt, šířka 60 cm), souběžně s balkonem
      const d = DOG_STEPS, ground = TERRAIN_Z;
      const [p0, p1] = d.plat;
      zb.add(p0, d.y0, p1, d.y1, lv.z - 6, lv.z); // plošinka v úrovni balkonu
      for (let i = 0; i < d.n; i++) {
        const top = lv.z + ((ground - lv.z) * (i + 1)) / (d.n + 1);
        zb.add(p0 - d.run * (i + 1) - 3, d.y0, p0 - d.run * i, d.y1, top - 4, top);
      }
      const xEnd = p0 - d.run * d.n;
      // lehká konstrukce: dvě šikmé nosnice a sloupky pod plošinkou (pod schody je volný průchod)
      for (const y of [d.y0 + 3, d.y1 - 3]) {
        bar(zincRails, [p0, y, lv.z - 8], [xEnd, y, ground], 3, zincMat);
        bar(zincRails, [p1 - 3, y, ground], [p1 - 3, y, lv.z - 6], 3, zincMat);
        bar(zincRails, [p0, y, ground], [p0, y, lv.z - 6], 3, zincMat);
      }
      const ry = d.y1 + 2;
      const hAt = (x: number) => (x >= p0 ? lv.z : lv.z + ((ground - lv.z) * (p0 - x)) / (p0 - xEnd));
      bar(zincRails, [p1, ry, lv.z + 100], [p0, ry, lv.z + 100], 2.2, zincMat);
      bar(zincRails, [p0, ry, lv.z + 100], [xEnd, ry, ground + 100], 2.2, zincMat);
      bar(zincRails, [p1 - 2, d.y0, lv.z + 100], [p1 - 2, ry, lv.z + 100], 2.2, zincMat);
      for (let x = p1 - 2; x > xEnd; x -= 20) bar(zincRails, [x, ry, hAt(x)], [x, ry, hAt(x) + 100], 0.8, zincMat);
      bar(zincRails, [xEnd, ry, ground], [xEnd, ry, ground + 100], 2, zincMat);
      cb.add(xEnd, ry - 2, p1, ry + 2, ground, lv.z + 100); // zábradlí jako zábrana
    }
    if (lv.id === 'S') gb.add(395, 1400, STAIR_FRONT.x0, 1455, -42, -34); // zelená stříška nad vraty
    if (lv.id === 'P' || lv.id === '1P') pb.add(BALCONY[0], BALCONY[1], BALCONY[2], BALCONY[3], lv.z - 20, lv.z);
    // garáž: zvýšená podlaha + sjezd z ulice s opěrnými zídkami
    if (lv.id === 'S') {
      // zapuštěný sklad: podlaha o 50 cm níž, zdi protažené dolů (s otvory dveří), schody v chodbě
      const pz = lv.z + SKLAD_PIT.dz;
      const [d0, d1] = SKLAD_PIT.door, dv = SKLAD_PIT.divider;
      for (const [a, b, c, d] of [
        [0, 0, 45, 900], [0, 0, 610, 45], [565, 45, 610, d0], [565, d1, 610, 760], [395, 760, 610, 805], [395, 805, 410, 855], [0, 855, 395, 900],
        [45, dv.y0, dv.door[0], dv.y1], [dv.door[1], dv.y0, 565, dv.y1],
      ]) {
        wb.add(a, b, c, d, pz - 30, lv.z);
      }
      pb.add(45, 45, 565, 855, pz - 30, pz); // podlaha jámy
      pb.add(565, d0, 610, d1, pz - 30, pz); // práh dveří
      const st = SKLAD_PIT.steps;
      for (let i = 0; i < st.n; i++) {
        const top = pz + ((lv.z - pz) * (i + 1)) / (st.n + 1);
        sb.add(st.x0 + st.run * i, st.y0, st.x0 + st.run * (i + 1), st.y1, pz - 30, top);
      }
      // schody ve skladu nahoru ke dveřím kotelny
      const bs = SKLAD_PIT.boilerSteps;
      for (let i = 0; i < bs.n; i++) {
        const top = lv.z - ((lv.z - pz) * i) / bs.n;
        sb.add(bs.x1 - bs.run * (i + 1), bs.y0, bs.x1 - bs.run * i, bs.y1, pz - 30, top);
      }
      // boky schodové jámy v chodbě
      wb.add(st.x0, st.y0 - 2, st.x0 + st.run * st.n, st.y0, pz - 30, lv.z);
      wb.add(st.x0, st.y1, st.x0 + st.run * st.n, st.y1 + 2, pz - 30, lv.z);
      wb.add(st.x0 + st.run * st.n, st.y0, st.x0 + st.run * st.n + 2, st.y1, pz - 30, lv.z);
      // kotel s kouřovodem
      {
        const b = BOILER, z0 = lv.z;
        const body = new THREE.Mesh(new THREE.BoxGeometry(M(b.x1 - b.x0), M(b.h), M(b.y1 - b.y0)), frameMat);
        body.position.set(M((b.x0 + b.x1) / 2), M(z0 + b.h / 2), M((b.y0 + b.y1) / 2));
        const panel = new THREE.Mesh(new THREE.BoxGeometry(M(30), M(12), M(1)), track(new THREE.MeshStandardMaterial({ color: '#3a3f44' })));
        panel.position.set(M(b.x0 - 0.6), M(z0 + b.h - 15), M((b.y0 + b.y1) / 2));
        panel.rotation.y = Math.PI / 2;
        const flueMat = track(new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.7, roughness: 0.35 }));
        // kouřovod rovně nahoru do komínového průduchu
        const flueH = 300 - 30 - b.h;
        const up = new THREE.Mesh(new THREE.CylinderGeometry(M(7), M(7), M(flueH), 16), flueMat);
        up.position.set(M((b.x0 + b.x1) / 2), M(z0 + b.h + flueH / 2), M((b.y0 + b.y1) / 2));
        for (const m of [body, panel, up]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
        cb.add(b.x0, b.y0, b.x1, b.y1, z0, z0 + b.h);
      }
      const [gx0, gy0, gx1, gy1] = GARAGE.room;
      pb.add(gx0, gy0, gx1, gy1, lv.z, lv.z + GARAGE.floor);
      const [rx0, ry0, rx1, ry1] = GARAGE.ramp;
      const bottom = lv.z + GARAGE.floor;
      const rampTop = (_x: number, y: number) => bottom + ((y - ry0) / (ry1 - ry0)) * (TERRAIN_Z - bottom);
      pb.add(rx0, ry0 - 45, rx1, ry0, bottom - 20, bottom); // práh ve vratech
      rampB.add(rx0, ry0, rx1, ry1, bottom - 30, TERRAIN_Z, rampTop); // zámková dlažba
      drainB.add(rx0, ry0 + 5, rx1, ry0 + 20, bottom - 5, bottom + 1); // odvodňovací žlab před vraty
      wb.add(rx0 - 20, GARDEN_STEPS.y1 + 20, rx0, ry1, bottom - 30, TERRAIN_Z + 15);
      wb.add(rx1, ry0, rx1 + 20, ry1, bottom - 30, TERRAIN_Z + 30); // vyšší zídka k záhonu u vstupu
      // vrata garáže jsou otevíratelná (viz níže – dveře)
      // schody ze sjezdu nahoru na terén (cesta kolem domu do zahrady)
      const { x0: sx0, x1: sx1, y0: sy0, y1: sy1, n } = GARDEN_STEPS;
      const base = Math.round(rampTop(0, (sy0 + sy1) / 2)), rise = (TERRAIN_Z - base) / n, run = (sx1 - sx0) / n; // od úrovně sjezdu
      pb.add(sx1, sy0, rx0, sy1, base - 30, base); // nástupní plocha u sjezdu
      for (let i = 0; i < n; i++) {
        const t = base + rise * (i + 1);
        pb.add(sx1 - run * (i + 1), sy0, sx1 - run * i, sy1, base - 30, t);
      }
      wb.add(sx0, sy1, rx0, sy1 + 20, base - 30, TERRAIN_Z + 15); // opěrná zídka schodů
    }
    // schodiště nahoru z tohoto podlaží
    const stairRails = new THREE.Group();
    if (idx < LEVELS.length - 1) buildStairs(lv.z, sb, wb, stairRails, cb);
    g.add(stairRails);
    const colliders = new THREE.Mesh(cb.geometry(), invisibleMat);
    g.add(colliders);

    const walls = addMesh(g, wb.geometry(), wallMat);
    const rails = addMesh(g, rb.geometry(), railMat, false); // bez výplně řezu – pletivo je průhledné
    addMesh(g, fb.geometry(), frameMat, false);
    const stairs = addMesh(g, sb.geometry(), stairMat);
    const paved = addMesh(g, pb.geometry(), pavedMat);
    const ramp = addMesh(g, rampB.geometry(), rampMat, false);
    addMesh(g, drainB.geometry(), drainMat, false);

    const zinc = addMesh(g, zb.geometry(), zincMat, false);
    g.add(zincRails);
    addMesh(g, gb.geometry(), greenMat);
    g.add(glass);

    // podlahy místností
    const floors: THREE.Object3D[] = [slab, stairs, paved, zinc, ramp];
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
    levels.push({ level: lv, group: g, labels, walls, rails, colliders, floors });
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

  // otevíratelné dveře a vrata (F / klik / klepnutí)
  const doors: Door[] = [];
  const box = (holder: THREE.Object3D, w: number, h: number, t: number, x: number, y: number, mat: THREE.Material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), mat);
    m.position.set(x, y, 0);
    holder.add(m);
    return m;
  };
  const handleMat = track(new THREE.MeshStandardMaterial({ color: '#c9c9c9', metalness: 0.8, roughness: 0.3 }));
  // vchodové dveře – v předsazené uliční zdi, otevírají se dovnitř
  {
    const a = 880, b = 975, h = 220, yIn = STAIR_FRONT.y - STAIR_FRONT.t + 4;
    const leafMat = track(new THREE.MeshStandardMaterial({ color: '#4b3326', roughness: 0.6 }));
    doors.push(makeLeaf(levels[0].group, [M(a + 2), M(TERRAIN_Z), M(yIn)], M(b - a - 4), (hd, w) => {
      const leaf = box(hd, w, M(h), M(5), w / 2, M(h / 2), leafMat);
      const gl = box(hd, M(50), M(110), M(6), w / 2, M(140), glassMat); gl.raycast = () => {};
      const hn = box(hd, M(14), M(3), M(12), w - M(10), M(105), handleMat); hn.raycast = () => {};
      return [leaf];
    }, Math.PI / 2, 'vchod'));
  }
  // dvoukřídlá vrata garáže – otevírají se ven na sjezd
  {
    const [g0, g1] = GARAGE.gate, gm = (g0 + g1) / 2, zb = -300 + GARAGE.floor, h = 300 - GARAGE.floor - 40;
    const y = M(1377);
    const build = (hd: THREE.Group, w: number) => {
      const leaf = box(hd, w - M(1), M(h), M(5), w / 2, M(h / 2), garageDoorMat);
      for (const k of [0.33, 0.66]) { const r = box(hd, w - M(6), M(4), M(7), w / 2, M(h) * k, garageDoorMat); r.raycast = () => {}; }
      return [leaf];
    };
    doors.push(makeLeaf(levels[0].group, [M(g0), M(zb), y], M(gm - g0), build, -Math.PI / 2, 'garaz'));
    doors.push(makeLeaf(levels[0].group, [M(g1), M(zb), y], M(g1 - gm), build, Math.PI / 2, 'garaz', Math.PI));
  }
  // balkonové dveře – francouzská okna (přízemí a 1. patro), otevírají se dovnitř
  for (const lv of levels.filter((l) => l.level.id === 'P' || l.level.id === '1P')) {
    const a = 130, b = 280, h = 245, z = lv.level.z, y = M(878);
    const build = (hd: THREE.Group, w: number) => {
      const fr = 6;
      const parts = [
        box(hd, w, M(fr), M(6), w / 2, M(fr / 2), frameMat),
        box(hd, w, M(fr), M(6), w / 2, M(h - fr / 2), frameMat),
        box(hd, M(fr), M(h), M(6), M(fr / 2), M(h / 2), frameMat),
        box(hd, M(fr), M(h), M(6), w - M(fr / 2), M(h / 2), frameMat),
        box(hd, w, M(fr), M(6), w / 2, M(h * 0.42), frameMat),
      ];
      const gl = box(hd, w - M(2 * fr), M(h - 2 * fr), M(2), w / 2, M(h / 2), glassMat);
      gl.raycast = () => {};
      // neviditelná plocha přes celé křídlo – pro kliknutí a kolize
      const hit = box(hd, w, M(h), M(6), w / 2, M(h / 2), new THREE.MeshBasicMaterial({ visible: false }));
      return [hit, ...parts.slice(0, 0)];
    };
    const mid = (a + b) / 2;
    doors.push(makeLeaf(lv.group, [M(a), M(z), y], M(mid - a), build, Math.PI / 2, `balkon-${lv.level.id}`));
    doors.push(makeLeaf(lv.group, [M(b), M(z), y], M(b - mid), build, -Math.PI / 2, `balkon-${lv.level.id}`, Math.PI));
  }
  return { house, levels, roof, doors };
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
  // řadové domy napravo: sedlová střecha navazuje na naši (stejný okap i hřeben), na konci řady valba
  const ROW = [
    { x0: 11.0, x1: 18.8, color: '#e7c35a' },
    { x0: 18.8, x1: 26.3, color: '#e4ddd0' },
    { x0: 26.3, x1: 36.3, color: '#d8c3a0' },
  ];
  const inRow = (pts: [number, number][]) => {
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    return cx > 11 && cx < 37 && cy > 4 && cy < 16;
  };
  {
    const E = M(ROOF.eave), R = M(ROOF.eave + ROOF.rise), S = ROOF.rise / ROOF.ridgeY, o = M(ROOF.overhang);
    const D = 14, ry = 7, xEnd = ROW[ROW.length - 1].x1, xr = xEnd - ry; // konec hřebene u valby
    for (const h of ROW) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(h.x1 - h.x0 - 0.02, E - M(TERRAIN_Z), D), new THREE.MeshStandardMaterial({ color: h.color, roughness: 0.95 }));
      box.position.set((h.x0 + h.x1) / 2, (E + M(TERRAIN_Z)) / 2, D / 2);
      box.castShadow = box.receiveShadow = true;
      group.add(box);
    }
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x, z, y);
    const eo = E - o * S;
    const x0 = ROW[0].x0;
    const tri: THREE.Vector3[] = [];
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => tri.push(a, b, c, a, c, d);
    quad(P(x0, -o, eo), P(xEnd + o, -o, eo), P(xr, ry, R), P(x0, ry, R)); // zadní
    quad(P(x0, D + o, eo), P(x0, ry, R), P(xr, ry, R), P(xEnd + o, D + o, eo)); // uliční
    tri.push(P(xEnd + o, -o, eo), P(xEnd + o, D + o, eo), P(xr, ry, R)); // valba na konci řady
    const rg = new THREE.BufferGeometry().setFromPoints(tri);
    rg.computeVertexNormals();
    const roofRow = new THREE.Mesh(rg, rMat);
    roofRow.castShadow = roofRow.receiveShadow = true;
    group.add(roofRow);
  }
  for (const b of ctx.buildings) {
    if (b.pts.length < 4) continue;
    if (inRow(b.pts.slice(0, -1))) continue;
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
