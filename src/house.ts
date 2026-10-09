// Geometrie domu Bendlova 16A podle původní dokumentace (arch. O. Blažek, 1948).
// Všechny rozměry v centimetrech. Souřadnice půdorysu: x = zleva doprava (0–1100),
// y = od zahrady (0) k ulici (1400). Štítová zeď sdílená se sousedem je na x = 1100.

export type Opening = {
  a: number; // začátek otvoru podél delší osy zdi (absolutní souřadnice, cm)
  b: number; // konec otvoru
  sill: number; // parapet nad úrovní podlaží (cm)
  h: number; // výška otvoru (cm)
  kind: 'window' | 'door';
};

export type Wall = {
  r: [number, number, number, number]; // obdélník x0, y0, x1, y1
  o?: Opening[];
  h?: number; // výška zdi (cm), výchozí = výška podlaží
  kind?: 'wall' | 'railing';
};

export type Room = {
  name: string;
  r: [number, number, number, number];
  floor: FloorType;
  wallTiles?: number; // výška obkladu stěn (cm)
  dz?: number; // podlaha zvýšená nad úroveň podlaží (cm)
};

export type FloorType =
  | 'wood' // plovoucí podlaha
  | 'carpet'
  | 'linoleum'
  | 'brownTile'
  | 'terrazzo' // kamenitá podlaha
  | 'tile'
  | 'concrete'
  | 'stone';

// Garáž v suterénu pod obývákem – vjezd z ulice po sjezdu do vyhloubení
export const GARAGE = {
  room: [395, 805, 830, 1355] as [number, number, number, number],
  floor: 45, // podlaha garáže nad podlahou suterénu (cm) → −2,55 m
  gate: [460, 760] as [number, number], // čtyřkřídlá vrata ~3 m (odměřeno z fotky)
  ramp: [445, 1400, 790, 1760] as [number, number, number, number], // sjezd (x0, y0, x1, y1)
};

// Balkon v rohu výřezu: celá šířka výřezu (350 cm), hloubka 150 cm od zdi ložnice
export const BALCONY: [number, number, number, number] = [0, 900, 350, 1050];

export type Level = {
  id: string;
  name: string;
  z: number; // výška podlahy (cm) vůči podlaze přízemí
  height: number; // konstrukční výška podlaží
  walls: Wall[];
  rooms: Room[];
  slab: 'full' | 'none'; // stropní deska pod tímto podlažím
  spawn: [number, number];
};

// Půdorysný obrys (L-tvar, výřez pro balkony vlevo u ulice)
export const FOOTPRINT: [number, number][] = [
  [0, 0], [1100, 0], [1100, 1425], [830, 1425], [830, 1400], [350, 1400], [350, 900], [0, 900],
];

// Schodišťový pruh se vstupem je předsazený před uliční fasádu
export const STAIR_FRONT = { x0: 830, y: 1530, t: 45 }; // y = líc předsazené fasády, t = tloušťka zdi
const SF_IN = STAIR_FRONT.y - STAIR_FRONT.t; // vnitřní líc

// Schodišťová hala a otvor ve stropech
export const STAIR = {
  x0: 860, x1: 1070,
  backLanding: [770, 870] as [number, number], // podesta v úrovni podlaží
  flight: [870, 1170] as [number, number], // ramena
  midLanding: [1170, 1485] as [number, number], // mezipodesta (až k předsazené fasádě)
  split: 965, // osa mezi rameny
  steps: 10,
};
export const STAIR_HOLE: [number, number, number, number] = [860, 870, 1070, 1355];

// Střecha podle výkresu krovu: dvě valby vetknuté do sebe.
//  - nižší valba nad zahradním křídlem (ložnice, x 0–350+, y 0–900), hřeben v y = 450
//  - hlavní vyšší valba nad celou hloubkou domu, valba ke výřezu (x = 350), krátký hřeben
//    v y = 700 u štítu se sousedem (x = 1100); obě střechy se potkávají v úžlabí.
export const ROOF = {
  eave: 730, // výška okapu nad podlahou přízemí (cm)
  rise: 480, // hřeben hlavní střechy nad okapem
  ridgeY: 700,
  wingRidgeY: 450,
  hipApexX: 940, // začátek hlavního hřebene (z výkresu krovu)
  overhang: 50,
};
export const ROOF_SLOPE = ROOF.rise / ROOF.ridgeY;
const S = ROOF_SLOPE;
const K = ROOF.ridgeY / (ROOF.hipApexX - 350); // valba hlavní střechy je strmější

// Vikýř pokoje v podkroví na nižší valbě (pohled přední, krov: okno 225/80)
export const DORMER = {
  y0: 290, y1: 585, // včetně bočnic
  depth: 273, // kde se pultová stříška potká s valbou
  z0: 890, // výška stříšky nad líc fasády (cm vůči podlaze přízemí)
  slope: 0.1,
};
export const dormerRoofZ = (x: number) => DORMER.z0 + DORMER.slope * x;
const inDormer = (x: number, y: number) => x < DORMER.depth && y > DORMER.y0 && y < DORMER.y1;

type RoofFace = {
  name: string;
  pts: [number, number][];
  holes?: [number, number][][];
  h: (x: number, y: number) => number;
};

/** Roviny střechy (půdorysné polygony v cm, výška v cm nad podlahou přízemí). */
export function roofFaces(): RoofFace[] {
  const E = ROOF.eave, o = ROOF.overhang, oh = o / K;
  const A: [number, number] = [ROOF.wingRidgeY, ROOF.wingRidgeY]; // vrchol valby křídla
  const V: [number, number] = [350 + ROOF.wingRidgeY / K, ROOF.wingRidgeY]; // konec hřebene křídla / úžlabí
  const Mx = ROOF.hipApexX, My = ROOF.ridgeY;
  return [
    { name: 'zadní', pts: [[-o, -o], [1100, -o], [1100, My], [Mx, My], V, A], h: (_x, y) => E + S * y },
    {
      name: 'valba křídla', pts: [[-o, -o], A, [-o, 900 + o]], h: (x) => E + S * x,
      holes: [[[0, DORMER.y0], [DORMER.depth, DORMER.y0], [DORMER.depth, DORMER.y1], [0, DORMER.y1]]],
    },
    { name: 'přední křídla', pts: [[-o, 900 + o], A, V, [350 - oh, 900 + o]], h: (_x, y) => E + S * (900 - y) },
    { name: 'valba hlavní', pts: [[350 - oh, 900 + o], [350 - oh, 1400 + o], [Mx, My], V], h: (x) => E + K * S * (x - 350) },
    {
      // nad předsazeným schodištěm je okap posunutý dopředu
      name: 'uliční',
      pts: [[350 - oh, 1400 + o], [STAIR_FRONT.x0 - o, 1400 + o], [STAIR_FRONT.x0 - o, STAIR_FRONT.y + o], [1100, STAIR_FRONT.y + o], [1100, My], [Mx, My]],
      h: (_x, y) => E + S * (1400 - y),
    },
  ];
}

/** Výška střešní plochy (cm) v bodě půdorysu. */
export function roofHeight(x: number, y: number): number {
  const E = ROOF.eave;
  if (inDormer(x, y)) return dormerRoofZ(x);
  const back = E + S * y;
  if (K * (x - 350) <= 900 - y) return Math.min(back, E + S * (900 - y), E + S * x); // křídlo
  return Math.min(back, E + S * (1400 - y), E + K * S * (x - 350)); // hlavní střecha
}

const win = (a: number, b: number, sill = 90, h = 150): Opening => ({ a, b, sill, h, kind: 'window' });
const door = (a: number, b: number, h = 200, sill = 0): Opening => ({ a, b, sill, h, kind: 'door' });

// ---------- Obvodové zdi (společné pro suterén, přízemí a 1. patro) ----------
// Okna podle pohledů (výkres „Pohled přední“ a „Pohled boční“): trojdílná okna 225 × 150 cm,
// parapet v přízemí 80 cm, v 1. patře 115 cm; sklepní okna 225 × 65 cm.
const SILL = { S: 155, P: 80, '1P': 115 } as const;
// Okna schodiště v uliční fasádě leží nad mezipodestami, takže přecházejí přes stropní desku.
// Zadávají se absolutně (cm vůči podlaze přízemí) a rozdělí se do zdí jednotlivých podlaží.
const STAIR_WINDOWS: [number, number, number, number][] = [
  [870, 1005, 255, 415], // nad mezipodestou přízemí → 1. patro
  [870, 1005, 560, 630], // nad mezipodestou 1. patro → podkroví (pod střechou)
];
export function stairWindowsFor(levelZ: number, height: number): Opening[] {
  return STAIR_WINDOWS.flatMap(([a, b, z0, z1]) => {
    const lo = Math.max(z0, levelZ), hi = Math.min(z1, levelZ + height);
    return hi > lo ? [win(a, b, lo - levelZ, hi - lo)] : [];
  });
}

function outerWalls(level: 'S' | 'P' | '1P'): Wall[] {
  const isS = level === 'S';
  const levelZ = { S: -300, P: 0, '1P': 300 }[level];
  const sill = SILL[level];
  const fw = (a: number, b: number) => win(a, b, sill, isS ? 65 : 150);
  const walls: Wall[] = [
    // zadní fasáda do zahrady
    {
      r: [0, 0, 1100, 45],
      o: isS
        ? [win(870, 1000, 160, 50)]
        : [win(625, 700, 120, 100), win(830, 980)],
    },
    // levá fasáda (pohled přední) – okna ložnic
    { r: [0, 45, 45, 900], o: [fw(110, 335), fw(480, 705)] },
    // stěna nad výřezem (dvoukřídlé balkonové dveře z ložnice)
    {
      r: [0, 855, 395, 900],
      o: isS ? [] : [door(130, 280, 245)],
    },
    // levá stěna obýváku do výřezu (plná)
    { r: [350, 900, 395, 1400] },
    // uliční fasáda – obývák / garáž
    {
      r: [395, 1355, STAIR_FRONT.x0, 1400],
      o: isS
        ? [door(GARAGE.gate[0], GARAGE.gate[1], 300 - GARAGE.floor - 40, GARAGE.floor)] // vrata garáže
        : [fw(495, 720)],
    },
    // uliční fasáda – předsazený schodišťový pruh se vstupem
    {
      r: [STAIR_FRONT.x0, SF_IN, 1100, STAIR_FRONT.y],
      o: [
        ...(isS ? [door(880, 975, 150, 150)] : []), // vstupní dveře (spodní část)
        ...(level === 'P' ? [door(880, 975, 70, 0)] : []),
        ...stairWindowsFor(levelZ, 300),
      ],
    },
    // štítová zeď se sousedem (x = 1070–1100)
    { r: [1070, 45, 1100, SF_IN] },
  ];
  return walls;
}

function stairHallWalls(): Wall[] {
  return [
    { r: [830, 770, 860, SF_IN] }, // obývák | schodiště, bok předsazení
    { r: [860, 760, 1070, 770], o: [door(880, 960)] }, // předsíň | schodiště
  ];
}

// ---------- Přízemí / 1. patro (téměř shodná dispozice) ----------
function flatWalls(level: 'P' | '1P'): Wall[] {
  return [
    ...outerWalls(level),
    ...stairHallWalls(),
    { r: [45, 405, 575, 415] }, // ložnice | ložnice
    { r: [575, 45, 590, 770], o: [door(310, 390), door(600, 680)] }, // ložnice | jádro, předsíň
    { r: [590, 262, 785, 272], o: [door(630, 710)] }, // koupelna | chodbička
    { r: [720, 272, 730, 486] }, // chodbička | spíž
    { r: [785, 45, 795, 486] }, // koupelna, spíž | kuchyň
    { r: [730, 476, 1070, 486], o: [door(850, 930)] }, // kuchyň | předsíň
    { r: [960, 486, 970, 760], o: [door(530, 590), door(670, 750)] }, // předsíň | WC, komora
    { r: [970, 612, 1070, 622] }, // WC | šachta
    { r: [970, 655, 1070, 665] }, // šachta | komora
    { r: [395, 760, 830, 770], o: [door(460, 540), door(680, 820)] }, // ložnice/předsíň | obývák
    { r: [560, 770, 650, 800], h: 300 }, // komín S.P.I.
    // balkon ve výřezu
    { r: [0, 900, 8, BALCONY[3]], h: 100, kind: 'railing' },
    { r: [0, BALCONY[3] - 8, 350, BALCONY[3]], h: 100, kind: 'railing' },
  ];
}

function flatRooms(level: 'P' | '1P'): Room[] {
  // Přízemí: plovoucí podlahy všude kromě koupelny (hnědá dlažba, bílý obklad) a WC.
  // 1. patro: koberce v pokojích a předsíni, linoleum v kuchyni, kamenitá podlaha v koupelně.
  const P = level === 'P';
  const room: FloorType = P ? 'wood' : 'carpet';
  return [
    { name: 'Ložnice', r: [45, 45, 575, 405], floor: room },
    { name: 'Ložnice', r: [45, 415, 575, 760], floor: room },
    { name: '', r: [45, 760, 395, 855], floor: room },
    { name: 'Koupelna', r: [590, 45, 785, 262], floor: P ? 'brownTile' : 'terrazzo', wallTiles: P ? 200 : undefined },
    { name: 'Spíž', r: [730, 272, 785, 476], floor: P ? 'wood' : 'linoleum' },
    { name: '', r: [590, 272, 720, 486], floor: room },
    { name: 'Kuchyň', r: [795, 45, 1070, 476], floor: P ? 'wood' : 'linoleum' },
    { name: 'Předsíň', r: [590, 486, 960, 760], floor: room },
    { name: 'WC', r: [970, 486, 1070, 612], floor: 'tile' },
    { name: 'Komora', r: [970, 665, 1070, 760], floor: room },
    { name: 'Obývací pokoj', r: [395, 770, 830, 1355], floor: room },
    { name: 'Schodiště', r: [860, 770, 1070, 870], floor: 'terrazzo' },
    { name: 'Balkon', r: BALCONY, floor: 'stone' },
  ];
}

// ---------- Suterén ----------
const basementWalls: Wall[] = [
  ...outerWalls('S'),
  ...stairHallWalls(),
  { r: [565, 45, 610, 760], o: [door(600, 680)] }, // nosná zeď sklad | chodba
  { r: [785, 45, 800, 300] }, // sklad | prádelna
  { r: [610, 300, 1070, 315], o: [door(650, 730), door(880, 960)] },
  { r: [395, 760, 830, 805], o: [door(700, 780)] }, // chodba | sklep
];
const basementRooms: Room[] = [
  { name: 'Sklad', r: [45, 45, 565, 855], floor: 'concrete' },
  { name: 'Sklad', r: [610, 45, 785, 300], floor: 'concrete' },
  { name: 'Prádelna', r: [800, 45, 1070, 300], floor: 'tile' },
  { name: 'Chodba', r: [610, 315, 1070, 760], floor: 'concrete' },
  { name: 'Garáž', r: GARAGE.room, floor: 'concrete', dz: GARAGE.floor },
  { name: 'Schodiště', r: [860, 770, 1070, 870], floor: 'terrazzo' },
];

// ---------- Podkroví ----------
const BIG = 600;
const atticWalls: Wall[] = [
  { r: [0, 0, 1100, 45], h: BIG },
  { r: [0, 45, 45, 900], h: BIG, o: [win(325, 550, 175, 80)] }, // trojdílné okno ve vikýři
  // bočnice vikýře
  { r: [0, DORMER.y0, DORMER.depth, DORMER.y0 + 15], h: BIG },
  { r: [0, DORMER.y1 - 15, DORMER.depth, DORMER.y1], h: BIG },
  { r: [0, 855, 395, 900], h: BIG },
  { r: [350, 900, 395, 1400], h: BIG },
  { r: [395, 1355, STAIR_FRONT.x0, 1400], h: BIG },
  { r: [STAIR_FRONT.x0, SF_IN, 1100, STAIR_FRONT.y], h: BIG, o: stairWindowsFor(600, BIG) },
  { r: [1070, 45, 1100, SF_IN], h: BIG }, // štít
  // pokoj
  { r: [45, 265, 640, 280], h: 260 },
  { r: [45, 800, 640, 815], h: 260 },
  { r: [625, 45, 640, 815], h: 260, o: [door(640, 720)] },
  // koupelna
  { r: [800, 45, 815, 435], h: 260 },
  { r: [640, 420, 815, 435], h: 260, o: [door(680, 760)] },
  // předsíň
  { r: [860, 435, 875, 770], h: 260, o: [door(480, 560)] },
  { r: [640, 815, 830, 830], h: 260, o: [door(700, 780)] },
  { r: [830, 770, 860, SF_IN], h: BIG },
  // zábradlí kolem otvoru schodiště
  { r: [860, 1355 - 8, 1070, 1355], h: 100, kind: 'railing' },
];
const atticRooms: Room[] = [
  { name: 'Pokoj', r: [45, 280, 625, 800], floor: 'wood' },
  { name: 'Koupelna', r: [640, 45, 800, 420], floor: 'tile' },
  { name: 'Předsíň', r: [640, 435, 860, 815], floor: 'wood' },
  { name: 'Půda', r: [875, 45, 1070, 770], floor: 'concrete' },
  { name: 'Půda', r: [45, 45, 625, 265], floor: 'concrete' },
  { name: 'Půda', r: [395, 830, 830, 1355], floor: 'concrete' },
  { name: 'Půda', r: [45, 815, 395, 855], floor: 'concrete' },
  { name: 'Schodiště', r: [860, 770, 1070, 870], floor: 'terrazzo' },
];

export const LEVELS: Level[] = [
  { id: 'S', name: 'Suterén', z: -300, height: 300, walls: basementWalls, rooms: basementRooms, slab: 'full', spawn: [720, 600] },
  { id: 'P', name: 'Přízemí', z: 0, height: 300, walls: flatWalls('P'), rooms: flatRooms('P'), slab: 'full', spawn: [780, 640] },
  { id: '1P', name: '1. patro', z: 300, height: 300, walls: flatWalls('1P'), rooms: flatRooms('1P'), slab: 'full', spawn: [780, 640] },
  { id: 'A', name: 'Podkroví', z: 600, height: BIG, walls: atticWalls, rooms: atticRooms, slab: 'full', spawn: [740, 640] },
];

export const TERRAIN_Z = -150; // úroveň chodníku / vstupu
export const STREET_SPAWN: [number, number] = [925, 1750];
