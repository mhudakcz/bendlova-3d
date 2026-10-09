// Data okolí z OpenStreetMap (~500 m kolem domu), převedená do souřadnic půdorysu domu (metry).
import raw from './context.json';

type Pt = [number, number];
type Raw = {
  northDeg: number;
  buildings: { l: number; r: string; t: string; p: Pt[] }[];
  roads: { k: string; n: string; p: Pt[] }[];
  areas: { k: string; p: Pt[] }[];
  rails: { k: string; p: Pt[] }[];
  trees: Pt[];
};
const r = raw as unknown as Raw;

export const OSM = {
  northDeg: r.northDeg,
  buildings: r.buildings.map((b) => ({ levels: b.l, roof: b.r, type: b.t, pts: b.p })),
  roads: r.roads.map((x) => ({ kind: x.k, name: x.n, pts: x.p })),
  areas: r.areas.map((x) => ({ kind: x.k, pts: x.p })),
  rails: r.rails.map((x) => ({ kind: x.k, pts: x.p })),
  trees: r.trees,
};
