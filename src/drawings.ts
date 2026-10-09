// Výkresy současného stavu – generované přímo z dat modelu (půdorysy podlaží a situace).
import {
  BALCONY, BOILER, DOG_STEPS, DORMER, FOOTPRINT, GARAGE, GARDEN_STEPS, LEVELS, Level, ROOF, Room, SKLAD_PIT,
  STAIR, STAIR_FRONT, Wall, roofFaces,
} from './house';
import {
  BEDS, BREAK_X, BUSHES, FENCE_HIGH, FENCE_LOW, FENCE_SIDE, FRONT_BEDS, GARAGE_GATE, HIGH, HOUSE_GATE, PATHS,
  STREET_FENCE, YARD_STEPS, YARD_Y,
} from './site';
import { OSM } from './osm';

const INK = '#2b2620', WALL = '#e9a77f', PAPER = '#f6f1e6', SOFT = '#8a7f72', ACC = '#b4562e';
const FONT = "font-family=\"IBM Plex Sans, Helvetica, Arial, sans-serif\"";
const MONO = "font-family=\"IBM Plex Mono, Consolas, monospace\"";

const FLOOR_NAME: Record<string, string> = {
  wood: 'plovoucí podlaha', carpet: 'koberec', linoleum: 'linoleum', brownTile: 'dlažba',
  terrazzo: 'teraco', tile: 'dlažba', concrete: 'beton', stone: 'dlažba',
};
const fmt = (v: number, d = 2) => v.toFixed(d).replace('.', ',');
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function frame(title: string, sub: string, vb: [number, number, number, number], body: string, scaleNote: string, k = 1) {
  const [x, y, w, h] = vb;
  const tb = `
    <g transform="translate(${x + w - 470 * k} ${y + h - 120 * k}) scale(${k})">
      <rect width="450" height="100" fill="${PAPER}" stroke="${INK}" stroke-width="2"/>
      <line x1="0" y1="52" x2="450" y2="52" stroke="${INK}" stroke-width="1"/>
      <text x="16" y="36" ${FONT} font-size="26" font-weight="700" fill="${INK}">${esc(title)}</text>
      <text x="16" y="80" ${MONO} font-size="15" fill="${SOFT}">${esc(sub)}</text>
      <text x="434" y="80" ${MONO} font-size="15" fill="${SOFT}" text-anchor="end">${esc(scaleNote)}</text>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w / k}" height="${h / k}">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${PAPER}"/>
    <rect x="${x + 12 * k}" y="${y + 12 * k}" width="${w - 24 * k}" height="${h - 24 * k}" fill="none" stroke="${INK}" stroke-width="${1.5 * k}"/>
    ${body}${tb}</svg>`;
}

/** zeď rozdělená otvory: plné kusy + symboly oken a dveří */
function wallSvg(w: Wall) {
  const [x0, y0, x1, y1] = w.r;
  if (w.kind === 'railing') {
    const alongX = x1 - x0 >= y1 - y0;
    return alongX
      ? `<line x1="${x0}" y1="${(y0 + y1) / 2}" x2="${x1}" y2="${(y0 + y1) / 2}" stroke="#3f7a5e" stroke-width="3" stroke-dasharray="10 4"/>`
      : `<line x1="${(x0 + x1) / 2}" y1="${y0}" x2="${(x0 + x1) / 2}" y2="${y1}" stroke="#3f7a5e" stroke-width="3" stroke-dasharray="10 4"/>`;
  }
  const alongX = x1 - x0 >= y1 - y0;
  const [s0, s1] = alongX ? [x0, x1] : [y0, y1];
  // v půdorysném řezu (~1,2 m) se zobrazí otvory, které tuto výšku protínají
  const ops = (w.o ?? []).filter((o) => o.sill < 130 && o.sill + o.h > 100).sort((p, q) => p.a - q.a);
  const rect = (a: number, b: number) => alongX
    ? `<rect x="${a}" y="${y0}" width="${b - a}" height="${y1 - y0}"/>`
    : `<rect x="${x0}" y="${a}" width="${x1 - x0}" height="${b - a}"/>`;
  let out = '', cur = s0;
  const sym: string[] = [];
  for (const o of ops) {
    if (o.a > cur) out += rect(cur, o.a);
    cur = Math.max(cur, o.b);
    if (o.kind === 'window') {
      const t = alongX ? y1 - y0 : x1 - x0, m = alongX ? (y0 + y1) / 2 : (x0 + x1) / 2;
      for (const d of [-t / 6, t / 6]) {
        sym.push(alongX
          ? `<line x1="${o.a}" y1="${m + d}" x2="${o.b}" y2="${m + d}"/>`
          : `<line x1="${m + d}" y1="${o.a}" x2="${m + d}" y2="${o.b}"/>`);
      }
      sym.push(alongX
        ? `<rect x="${o.a}" y="${y0}" width="${o.b - o.a}" height="${y1 - y0}" fill="none"/>`
        : `<rect x="${x0}" y="${o.a}" width="${x1 - x0}" height="${o.b - o.a}" fill="none"/>`);
    } else {
      // dveře: křídlo + oblouk otevírání
      const r = o.b - o.a;
      if (alongX) {
        const y = y1;
        sym.push(`<line x1="${o.a}" y1="${y}" x2="${o.a}" y2="${y + r}" stroke-width="2"/>`);
        sym.push(`<path d="M ${o.a} ${y + r} A ${r} ${r} 0 0 0 ${o.b} ${y}" fill="none" stroke-dasharray="4 3"/>`);
      } else {
        const x = x1;
        sym.push(`<line x1="${x}" y1="${o.a}" x2="${x + r}" y2="${o.a}" stroke-width="2"/>`);
        sym.push(`<path d="M ${x + r} ${o.a} A ${r} ${r} 0 0 1 ${x} ${o.b}" fill="none" stroke-dasharray="4 3"/>`);
      }
    }
  }
  if (cur < s1) out += rect(cur, s1);
  return `<g fill="${WALL}" stroke="${INK}" stroke-width="2">${out}</g><g stroke="${INK}" stroke-width="1.2" fill="none">${sym.join('')}</g>`;
}

function roomLabel(r: Room, extra = '') {
  if (!r.name || r.name === 'Schodiště') return '';
  const [x0, y0, x1, y1] = r.r;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const area = ((x1 - x0) * (y1 - y0)) / 1e4;
  const small = Math.min(x1 - x0, y1 - y0) < 120;
  const fs = small ? 15 : 22;
  return `<g text-anchor="middle">
    <text x="${cx}" y="${cy - 4}" ${FONT} font-size="${fs}" font-weight="600" fill="${INK}">${esc(r.name)}</text>
    <text x="${cx}" y="${cy + fs}" ${MONO} font-size="${fs * 0.72}" fill="${ACC}">${fmt(area, 1)} m²</text>
    ${small ? '' : `<text x="${cx}" y="${cy + fs * 1.9}" ${MONO} font-size="13" fill="${SOFT}">${esc(FLOOR_NAME[r.floor] ?? '')}${extra}</text>`}
  </g>`;
}

function stairsSvg(lv: Level) {
  const { x0, x1, split, flight, midLanding } = STAIR;
  const GAP = 10, run = (flight[1] - flight[0]) / 10;
  let s = '';
  const up = lv.id !== 'A';
  if (up) {
    for (let i = 0; i <= 9; i++) {
      const y = flight[0] + run * i;
      s += `<line x1="${split + GAP}" y1="${y}" x2="${x1}" y2="${y}"/><line x1="${x0}" y1="${y}" x2="${split - GAP}" y2="${y}"/>`;
    }
    s += `<rect x="${split + GAP}" y="${flight[0]}" width="${x1 - split - GAP}" height="${flight[1] - flight[0]}" fill="none"/>`;
    s += `<rect x="${x0}" y="${flight[0]}" width="${split - GAP - x0}" height="${flight[1] - flight[0]}" fill="none"/>`;
    s += `<rect x="${x0}" y="${midLanding[0]}" width="${x1 - x0}" height="${midLanding[1] - midLanding[0]}" fill="none" stroke-dasharray="6 4"/>`;
    // šipka výstupu
    const ax = (split + GAP + x1) / 2, bx = (x0 + split - GAP) / 2;
    s += `<polyline points="${ax},${flight[0] + 10} ${ax},${flight[1] + 40} ${bx},${flight[1] + 40} ${bx},${flight[0] + 20}" fill="none" stroke="${ACC}" stroke-width="2"/>`;
    s += `<path d="M ${bx - 9} ${flight[0] + 36} L ${bx} ${flight[0] + 18} L ${bx + 9} ${flight[0] + 36}" fill="none" stroke="${ACC}" stroke-width="2"/>`;
    if (lv.id === 'S') s += `<rect x="${split - GAP}" y="${flight[0]}" width="${2 * GAP}" height="${flight[1] - flight[0]}" fill="${WALL}" stroke="${INK}" stroke-width="2"/>`;
    else s += `<line x1="${split - GAP - 3}" y1="${flight[0]}" x2="${split - GAP - 3}" y2="${flight[1]}" stroke="#a8322b" stroke-width="3"/><line x1="${split + GAP + 3}" y1="${flight[0]}" x2="${split + GAP + 3}" y2="${flight[1]}" stroke="#a8322b" stroke-width="3"/>`;
  }
  return `<g stroke="${INK}" stroke-width="1.2">${s}</g>`;
}

function steps(x0: number, y0: number, x1: number, y1: number, n: number, alongX: boolean, label?: string) {
  let s = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#efe8da"/>`;
  for (let i = 1; i < n; i++) {
    s += alongX
      ? `<line x1="${x0 + ((x1 - x0) * i) / n}" y1="${y0}" x2="${x0 + ((x1 - x0) * i) / n}" y2="${y1}"/>`
      : `<line x1="${x0}" y1="${y0 + ((y1 - y0) * i) / n}" x2="${x1}" y2="${y0 + ((y1 - y0) * i) / n}"/>`;
  }
  return `<g stroke="${INK}" stroke-width="1">${s}<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none"/></g>${label ? `<text x="${(x0 + x1) / 2}" y="${y1 + 18}" ${MONO} font-size="13" fill="${SOFT}" text-anchor="middle">${esc(label)}</text>` : ''}`;
}

function dim(x0: number, y0: number, x1: number, y1: number, text: string, vertical = false) {
  const t = 8;
  const tick = (x: number, y: number) => `<line x1="${x - t}" y1="${y + t}" x2="${x + t}" y2="${y - t}" stroke-width="2"/>`;
  const label = vertical
    ? `<text x="${x0 - 12}" y="${(y0 + y1) / 2}" ${MONO} font-size="18" fill="${INK}" text-anchor="middle" transform="rotate(-90 ${x0 - 12} ${(y0 + y1) / 2})">${text}</text>`
    : `<text x="${(x0 + x1) / 2}" y="${y0 - 10}" ${MONO} font-size="18" fill="${INK}" text-anchor="middle">${text}</text>`;
  return `<g stroke="${INK}" stroke-width="1"><line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/>${tick(x0, y0)}${tick(x1, y1)}</g>${label}`;
}

const LEVEL_TITLE: Record<string, string> = { S: 'SUTERÉN', P: 'PŘÍZEMÍ', '1P': 'I. PATRO', A: 'PODKROVÍ' };

export function levelDrawing(lv: Level): string {
  const vb: [number, number, number, number] = [-260, -230, 1620, 2050];
  let body = '';
  const fp = FOOTPRINT.map((p) => p.join(',')).join(' ');
  body += `<polygon points="${fp}" fill="#fbf8f1" stroke="none"/>`;

  // plochy místností (jemně podle podlahy)
  const tint: Record<string, string> = { wood: '#f3e4cc', carpet: '#ece4d6', linoleum: '#e4eadc', brownTile: '#e8d6c8', terrazzo: '#ebe7e0', tile: '#e8ecec', concrete: '#ece9e3', stone: '#ece4d8' };
  for (const r of lv.rooms) {
    const [x0, y0, x1, y1] = r.r;
    body += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${tint[r.floor] ?? '#f2eee6'}"/>`;
  }
  if (lv.id === 'S') {
    const pit = SKLAD_PIT.outline.map((p) => p.join(',')).join(' ');
    body += `<polygon points="${pit}" fill="none" stroke="${ACC}" stroke-width="2" stroke-dasharray="12 6"/>`;
  }
  body += stairsSvg(lv);
  for (const w of lv.walls) body += wallSvg(w);

  // zvláštnosti podlaží
  if (lv.id === 'S') {
    const st = SKLAD_PIT.steps, bs = SKLAD_PIT.boilerSteps;
    body += steps(st.x0, st.y0, st.x0 + st.run * st.n, st.y1, st.n, true);
    body += steps(bs.x1 - bs.run * bs.n, bs.y0, bs.x1, bs.y1, bs.n, true);
    body += `<rect x="${BOILER.x0}" y="${BOILER.y0}" width="${BOILER.x1 - BOILER.x0}" height="${BOILER.y1 - BOILER.y0}" fill="#fff" stroke="${INK}" stroke-width="2"/>
      <circle cx="${(BOILER.x0 + BOILER.x1) / 2}" cy="${(BOILER.y0 + BOILER.y1) / 2}" r="7" fill="none" stroke="${INK}"/>
      <text x="${BOILER.x0 - 8}" y="${(BOILER.y0 + BOILER.y1) / 2 + 5}" ${MONO} font-size="14" fill="${ACC}" text-anchor="end">kotel</text>`;
    body += `<text x="300" y="300" ${MONO} font-size="15" fill="${ACC}" text-anchor="middle">podlaha −3,50</text>`;
    // vrata garáže a sjezd
    const [g0, g1] = GARAGE.gate, [rx0, , rx1, ry1] = GARAGE.ramp;
    body += `<line x1="${g0}" y1="1400" x2="${g1}" y2="1400" stroke="#2f6b55" stroke-width="6"/>`;
    body += `<rect x="${rx0}" y="1400" width="${rx1 - rx0}" height="${ry1 - 1400}" fill="#e6e1d8" stroke="${INK}" stroke-dasharray="8 5"/>
      <text x="${(rx0 + rx1) / 2}" y="${(1400 + ry1) / 2}" ${FONT} font-size="18" fill="${SOFT}" text-anchor="middle">sjezd ↓</text>`;
    body += steps(GARDEN_STEPS.x0, GARDEN_STEPS.y0, GARDEN_STEPS.x1, GARDEN_STEPS.y1, GARDEN_STEPS.n, true);
  }
  if (lv.id === 'P' || lv.id === '1P') {
    const [bx0, by0, bx1, by1] = BALCONY;
    body += `<rect x="${bx0}" y="${by0}" width="${bx1 - bx0}" height="${by1 - by0}" fill="#efe3cf" stroke="${INK}" stroke-width="1.5"/>`;
    if (lv.id === 'P') {
      const d = DOG_STEPS, [p0, p1] = d.plat;
      body += `<rect x="${p0}" y="${d.y0}" width="${p1 - p0}" height="${d.y1 - d.y0}" fill="#e3e6e8" stroke="${INK}"/>`;
      body += steps(p0 - d.run * d.n, d.y0, p0, d.y1, d.n, true, 'ocelové schody do zahrady');
    }
    if (lv.id === 'P') body += `<rect x="850" y="${STAIR_FRONT.y}" width="200" height="50" fill="none" stroke="${INK}" stroke-dasharray="6 4"/>`;
  }
  if (lv.id === 'A') {
    // obrys střechy, hřebeny, nároží a úžlabí
    let r = '';
    for (const f of roofFaces()) r += `<polygon points="${f.pts.map((p) => p.join(',')).join(' ')}" fill="none"/>`;
    body += `<g stroke="${SOFT}" stroke-width="1.5" stroke-dasharray="14 6">${r}</g>`;
    body += `<rect x="0" y="${DORMER.y0}" width="${DORMER.depth}" height="${DORMER.y1 - DORMER.y0}" fill="none" stroke="${ACC}" stroke-width="2" stroke-dasharray="8 4"/>
      <text x="${DORMER.depth / 2}" y="${DORMER.y0 - 10}" ${MONO} font-size="14" fill="${ACC}" text-anchor="middle">vikýř</text>`;
  }
  for (const r of lv.rooms) body += roomLabel(r, lv.id === 'S' && r.dz && r.dz < 0 ? ' · −0,50' : '');

  // kóty
  body += dim(0, -90, 1100, -90, '1100');
  body += dim(-110, 0, -110, 1400, '1400', true);
  body += dim(-170, 0, -170, STAIR_FRONT.y, String(STAIR_FRONT.y), true);
  // sever
  body += northArrow(1230, -120);
  const z = lv.z === 0 ? '±0,00' : `${lv.z > 0 ? '+' : '−'}${fmt(Math.abs(lv.z) / 100)}`;
  return frame(`${LEVEL_TITLE[lv.id]} – SOUČASNÝ STAV`, `Bendlova 16A · podlaha ${z}`, vb, body, '1:100');
}

function northArrow(x: number, y: number, sc = 1) {
  // sever v souřadnicích půdorysu (z OSM): směr (−0,756; −0,654)
  const ang = (Math.atan2(-0.654, -0.756) * 180) / Math.PI + 90;
  return `<g transform="translate(${x} ${y}) scale(${sc}) rotate(${ang})">
    <circle r="34" fill="none" stroke="${INK}" stroke-width="1.5"/>
    <path d="M 0 -30 L 10 12 L 0 4 L -10 12 Z" fill="${INK}"/>
    <text y="-40" ${FONT} font-size="20" font-weight="700" text-anchor="middle" fill="${INK}" transform="rotate(${-ang} 0 -48)">S</text>
  </g>`;
}

/** situace: dům, pozemek, plot, cestičky, zahrada, ulice */
export function siteDrawing(): string {
  // metry → cm (1 m = 100 jednotek)
  const K = 100;
  const pt = (p: [number, number]) => `${p[0] * K},${p[1] * K}`;
  const vb: [number, number, number, number] = [-3700, -3100, 7600, 6200];
  let b = '';
  // silnice a chodníky (z OSM)
  type R = { kind: string; pts: [number, number][] };
  for (const r of OSM.roads as R[]) {
    if (r.kind !== 'residential' && r.kind !== 'service') continue;
    const d = r.pts.map(pt).join(' ');
    b += `<polyline points="${d}" fill="none" stroke="#cfcac2" stroke-width="${(5.5 + 3.8) * K}" stroke-linejoin="round"/>`;
    b += `<polyline points="${d}" fill="none" stroke="#6f6e6c" stroke-width="${5.5 * K}" stroke-linejoin="round"/>`;
  }
  b += `<text x="${18 * K}" y="${24.3 * K}" ${FONT} font-size="120" fill="#f6f1e6" text-anchor="middle" letter-spacing="10">BENDLOVA</text>`;
  b += `<text x="${19 * K}" y="${40 * K}" ${FONT} font-size="140" fill="#5d7f43" text-anchor="middle">park</text>`;
  // zahrada (vyvýšená), svah, dvorek, cestičky
  b += `<polygon points="${HIGH.map(pt).join(' ')}" fill="#dfe8cf" stroke="none"/>`;
  b += `<line x1="${BREAK_X * K}" y1="${YARD_Y * K}" x2="${BREAK_X * K}" y2="${7.17 * K}" stroke="#7d9a5a" stroke-width="8" stroke-dasharray="40 20"/>`;
  b += `<text x="${(BREAK_X - 0.4) * K}" y="${2 * K}" ${MONO} font-size="70" fill="#5d7f43" text-anchor="end">zlom terénu / svah</text>`;
  for (const [x0, y0, x1, y1] of PATHS) b += `<rect x="${x0 * K}" y="${y0 * K}" width="${(x1 - x0) * K}" height="${(y1 - y0) * K}" fill="#d9d4ca"/>`;
  for (const [x0, y0, x1, y1] of FRONT_BEDS) b += `<rect x="${x0 * K}" y="${y0 * K}" width="${(x1 - x0) * K}" height="${(y1 - y0) * K}" fill="#d3e2bd"/>`;
  b += `<line x1="${BREAK_X * K}" y1="${YARD_Y * K}" x2="${11 * K}" y2="${YARD_Y * K}" stroke="${INK}" stroke-width="20"/>`;
  b += `<text x="${5 * K}" y="${(YARD_Y - 0.5) * K}" ${MONO} font-size="70" fill="${INK}" text-anchor="middle">zídka 1,2 m</text>`;
  {
    const s = YARD_STEPS;
    for (let i = 0; i <= s.n; i++) b += `<line x1="${s.x0 * K}" y1="${(YARD_Y - s.run * i) * K}" x2="${s.x1 * K}" y2="${(YARD_Y - s.run * i) * K}" stroke="${INK}" stroke-width="5"/>`;
  }
  for (let i = 0; i < BEDS.n; i++) {
    const x0 = BEDS.x0 + i * (BEDS.w + BEDS.gap);
    b += `<rect x="${x0 * K}" y="${BEDS.y0 * K}" width="${BEDS.w * K}" height="${(BEDS.y1 - BEDS.y0) * K}" fill="#a98a66"/>`;
  }
  b += `<text x="${(BEDS.x0 + 2.6) * K}" y="${(BEDS.y0 - 0.6) * K}" ${MONO} font-size="70" fill="#6b5039" text-anchor="middle">záhony</text>`;
  for (const [x, y, r] of BUSHES) b += `<circle cx="${x * K}" cy="${y * K}" r="${r * K}" fill="#9bb67a"/>`;
  // sjezd a schody
  const [rx0, ry0, rx1, ry1] = GARAGE.ramp;
  b += `<rect x="${rx0}" y="${ry0}" width="${rx1 - rx0}" height="${ry1 - ry0}" fill="#c9c4bb" stroke="${INK}" stroke-width="5"/>`;
  b += `<text x="${(rx0 + rx1) / 2}" y="${(ry0 + ry1) / 2}" ${MONO} font-size="60" fill="${INK}" text-anchor="middle">sjezd</text>`;
  // dům (střecha) a balkon
  b += `<polygon points="${FOOTPRINT.map((p) => p.join(',')).join(' ')}" fill="${WALL}" stroke="${INK}" stroke-width="10"/>`;
  b += `<g stroke="${INK}" stroke-width="4" fill="none" stroke-dasharray="30 15">${roofFaces().map((f) => `<polygon points="${f.pts.map((p) => p.join(',')).join(' ')}"/>`).join('')}</g>`;
  b += `<text x="550" y="720" ${FONT} font-size="150" font-weight="700" fill="${INK}" text-anchor="middle">16A</text>`;
  b += `<rect x="${BALCONY[0]}" y="${BALCONY[1]}" width="${BALCONY[2] - BALCONY[0]}" height="${BALCONY[3] - BALCONY[1]}" fill="#efe3cf" stroke="${INK}" stroke-width="5"/>`;
  // plot
  const line = (ps: [number, number][], w: number, c: string, dash = '') => `<polyline points="${ps.map(pt).join(' ')}" fill="none" stroke="${c}" stroke-width="${w}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
  b += line(FENCE_HIGH, 10, '#2f6b55', '40 14');
  b += line(FENCE_LOW, 22, '#7f7a72');
  b += line(FENCE_SIDE, 22, '#7f7a72');
  b += line(STREET_FENCE, 22, '#7f7a72');
  const at = (x: number): [number, number] => [x, STREET_FENCE[0][1] + ((x - STREET_FENCE[0][0]) / (STREET_FENCE[1][0] - STREET_FENCE[0][0])) * (STREET_FENCE[1][1] - STREET_FENCE[0][1])];
  b += line([at(GARAGE_GATE[0]), at(GARAGE_GATE[1])], 30, '#2f6b55');
  b += line([at(HOUSE_GATE[0]), at(HOUSE_GATE[1])], 30, '#b8bcbf');
  b += `<text x="${6.2 * K}" y="${20.2 * K}" ${MONO} font-size="60" fill="#2f6b55" text-anchor="middle">vrata</text>`;
  b += `<text x="${9.3 * K}" y="${20.2 * K}" ${MONO} font-size="60" fill="${SOFT}" text-anchor="middle">branka</text>`;
  // popisy
  b += `<text x="${-14 * K}" y="${-8 * K}" ${FONT} font-size="160" fill="#5d7f43" text-anchor="middle">zahrada</text>`;
  b += `<text x="${5 * K}" y="${-1.6 * K}" ${FONT} font-size="80" fill="${INK}" text-anchor="middle">dvorek</text>`;
  b += `<text x="${2.5 * K}" y="${17.2 * K}" ${FONT} font-size="55" fill="#5d7f43" text-anchor="middle">předzahrádka</text>`;
  // legenda
  b += `<g transform="translate(-3500 2200)" ${MONO} font-size="60" fill="${INK}">
    <line x1="0" y1="0" x2="200" y2="0" stroke="#7f7a72" stroke-width="22"/><text x="240" y="20">podezdívka + pletivo</text>
    <line x1="0" y1="110" x2="200" y2="110" stroke="#2f6b55" stroke-width="10" stroke-dasharray="40 14"/><text x="240" y="130">plot v zahradě</text>
    <rect x="0" y="190" width="200" height="60" fill="#d9d4ca"/><text x="240" y="240">cestička / dvorek (úroveň ulice)</text>
    <rect x="0" y="300" width="200" height="60" fill="#dfe8cf"/><text x="240" y="350">zahrada (výš, mírný svah)</text>
  </g>`;
  b += northArrow(3400, -2700, 4);
  // měřítko
  b += `<g transform="translate(-3500 -2800)" ${MONO} font-size="60" fill="${INK}">
    <rect x="0" y="0" width="500" height="30" fill="${INK}"/><rect x="500" y="0" width="500" height="30" fill="none" stroke="${INK}" stroke-width="4"/>
    <text x="0" y="-20">0</text><text x="500" y="-20" text-anchor="middle">5</text><text x="1000" y="-20" text-anchor="middle">10 m</text>
  </g>`;
  return frame('SITUACE – SOUČASNÝ STAV', 'Bendlova 16A · pozemek, plot, terén', vb, b, '1:250', 4);
}

export const CURRENT_DRAWINGS = (): { name: string; svg: string }[] => [
  ...LEVELS.map((lv) => ({ name: `${LEVEL_TITLE[lv.id][0]}${LEVEL_TITLE[lv.id].slice(1).toLowerCase()} – současný stav`, svg: levelDrawing(lv) })),
  { name: 'Situace – současný stav', svg: siteDrawing() },
];
void ROOF;
