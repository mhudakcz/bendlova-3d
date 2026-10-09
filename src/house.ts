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
  gate: [495, 735] as [number, number], // vrata v uliční zdi
  ramp: [480, 1400, 750, 1760] as [number, number, number, number], // sjezd (x0, y0, x1, y1)
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
  [0, 0], [1100, 0], [1100, 1400], [350, 1400], [350, 900], [0, 900],
];

// Schodišťová hala a otvor ve stropech
export const STAIR = {
  x0: 860, x1: 1070,
  backLanding: [770, 870] as [number, number], // podesta v úrovni podlaží
  flight: [870, 1170] as [number, number], // ramena
  midLanding: [1170, 1355] as [number, number], // mezipodesta
  split: 965, // osa mezi rameny
  steps: 10,
};
export const STAIR_HOLE: [number, number, number, number] = [860, 870, 1070, 1355];

export const ROOF = {
  eave: 730, // výška okapu nad podlahou přízemí (cm)
  rise: 480, // výška hřebene nad okapem
  ridgeY: 700,
  overhang: 50,
};
const SLOPE = ROOF.rise / ROOF.ridgeY;

/** Výška střešní plochy (cm, vůči podlaze přízemí) v bodě půdorysu – valba k x=0, štít na x=1100. */
export function roofHeight(x: number, y: number): number {
  const back = ROOF.eave + y * SLOPE;
  const front = ROOF.eave + (1400 - y) * SLOPE;
  const hip = ROOF.eave + x * SLOPE;
  return Math.min(back, front, hip, ROOF.eave + ROOF.rise);
}

const win = (a: number, b: number, sill = 90, h = 150): Opening => ({ a, b, sill, h, kind: 'window' });
const door = (a: number, b: number, h = 200, sill = 0): Opening => ({ a, b, sill, h, kind: 'door' });

// ---------- Obvodové zdi (společné pro suterén, přízemí a 1. patro) ----------
function outerWalls(level: 'S' | 'P' | '1P'): Wall[] {
  const isS = level === 'S';
  const sw = (a: number, b: number) => (isS ? win(a, b, 160, 50) : win(a, b));
  const walls: Wall[] = [
    // zadní fasáda do zahrady
    {
      r: [0, 0, 1100, 45],
      o: isS
        ? [win(870, 1000, 160, 50)]
        : [win(625, 700, 120, 100), win(830, 980)],
    },
    // levá fasáda (pohled přední) – okna ložnic
    { r: [0, 45, 45, 900], o: [sw(220, 370), sw(580, 730)] },
    // stěna nad výřezem (balkonové dveře z ložnice)
    {
      r: [0, 855, 395, 900],
      o: isS ? [] : [door(110, 260, 235)],
    },
    // levá stěna obýváku do výřezu (dveře na balkon)
    { r: [350, 900, 395, 1400], o: isS ? [] : [door(920, 1000, 235)] },
    // uliční fasáda
    {
      r: [395, 1355, 1100, 1400],
      o: isS
        ? [door(GARAGE.gate[0], GARAGE.gate[1], 300 - GARAGE.floor - 40, GARAGE.floor), door(880, 975, 150, 150)] // vrata garáže, vstupní dveře (spodní část)
        : level === 'P'
          ? [win(600, 750), door(880, 975, 85, 0)]
          : [win(600, 750), win(900, 1030, 60, 200)],
    },
    // štítová zeď se sousedem (x = 1070–1100)
    { r: [1070, 45, 1100, 1355] },
  ];
  return walls;
}

function stairHallWalls(): Wall[] {
  return [
    { r: [830, 770, 860, 1355] }, // obývák | schodiště
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
  { r: [0, 45, 45, 900], h: BIG, o: [win(420, 660, 25, 80)] }, // okno pokoje (vikýř)
  { r: [0, 855, 395, 900], h: BIG },
  { r: [350, 900, 395, 1400], h: BIG },
  { r: [395, 1355, 1100, 1400], h: BIG },
  { r: [1070, 45, 1100, 1355], h: BIG }, // štít
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
  { r: [830, 770, 860, 1355], h: 260 },
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
