// Výškový model terénu okolí (Terrarium / SRTM, mřížka 10 m), relativně k ulici před domem.
// Kolem domu je terén plochý (vlastní model zahrady a ulice), dál plynule přechází do skutečného reliéfu.
import T from './terrain.json';
import { TERRAIN_Z } from './house';

const D = T as unknown as { x0: number; y0: number; step: number; n: number; base: number; h: number[][] };
const G = TERRAIN_Z / 100;
export const FLAT_CENTER: [number, number] = [5, 8];
export const FLAT_R = 42; // do této vzdálenosti (m) je terén plochý
const BLEND = 60; // přechod do skutečného reliéfu

/** surová výška (m) vůči ulici před domem, bilineárně z mřížky */
export function rawHeight(x: number, y: number) {
  const fx = (x - D.x0) / D.step, fy = (y - D.y0) / D.step;
  const ix = Math.max(0, Math.min(D.n - 2, Math.floor(fx))), iy = Math.max(0, Math.min(D.n - 2, Math.floor(fy)));
  const tx = Math.max(0, Math.min(1, fx - ix)), ty = Math.max(0, Math.min(1, fy - iy));
  const h = D.h;
  const v = h[iy][ix] * (1 - tx) * (1 - ty) + h[iy][ix + 1] * tx * (1 - ty) + h[iy + 1][ix] * (1 - tx) * ty + h[iy + 1][ix + 1] * tx * ty;
  return v - D.base;
}

/** výška terénu (m, světová osa Y) v bodě půdorysu */
export function terrainY(x: number, y: number) {
  const d = Math.hypot(x - FLAT_CENTER[0], y - FLAT_CENTER[1]);
  if (d <= FLAT_R) return G;
  const t = Math.min(1, (d - FLAT_R) / BLEND);
  const s = t * t * (3 - 2 * t);
  return G + s * rawHeight(x, y);
}

/** zvedne vrcholy geometrie (postavené na rovině G) na terén */
export function liftToTerrain(pos: { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number; setY(i: number, v: number): void; needsUpdate?: boolean }) {
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + terrainY(pos.getX(i), pos.getZ(i)) - G);
  pos.needsUpdate = true;
}

/** zhustí lomenou čáru, aby kopírovala terén (max. délka úseku) */
export function densify<T extends [number, number]>(pts: T[], maxLen = 6): T[] {
  const out: T[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n] as T);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
