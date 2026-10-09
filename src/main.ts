import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { buildHouse, buildSurroundings, setClipping } from './build';
import { buildSite } from './site';
import { CURRENT_DRAWINGS } from './drawings';
import { LEVELS, STREET_SPAWN, TERRAIN_Z } from './house';
import './style.css';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;

// ------------------------------------------------------------------ scéna
const app = $('#app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.localClippingEnabled = true;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#cbdbe5');
scene.fog = new THREE.Fog('#cbdbe5', 160, 900);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 2500);
camera.position.set(-14, 16, 24);

scene.add(new THREE.HemisphereLight('#eef4ff', '#c9bca6', 1.3));
const sun = new THREE.DirectionalLight('#fff0d8', 2.6);
sun.position.set(-18, 30, 22);
sun.target.position.set(5.5, 0, 7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const lamp = new THREE.PointLight('#fff1dc', 9, 14, 1.4); // „baterka" při procházení
lamp.visible = false;
camera.add(lamp);
scene.add(camera);

const { levels, roof, doors: houseDoors } = buildHouse(scene);
const { context, ground, buildingColliders } = buildSurroundings(scene);
const { colliders: siteColliders, walkables: siteWalkables, doors: siteDoors } = buildSite(scene);
const doors = [...houseDoors, ...siteDoors];

// ------------------------------------------------------------------ stav
type FloorId = 'all' | 'S' | 'P' | '1P' | 'A';
const state = {
  mode: 'orbit' as 'orbit' | 'walk',
  floor: 'all' as FloorId,
  cutH: true, cutHVal: 1.4,
  cutX: false, cutXVal: 5.5,
  cutZ: false, cutZVal: 10,
  roof: true, ctx: true, labels: true,
};

const planeH = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
const planeX = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(5.5, 3, 7);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.495;
orbit.minDistance = 3;
orbit.maxDistance = 900; // oddálení na celé okolí
orbit.screenSpacePanning = false; // posun po zemi (pravé tlačítko / dva prsty)
orbit.panSpeed = 1.2;
const desiredTarget = orbit.target.clone();
let desiredCam: THREE.Vector3 | null = null;
let flying = false; // kamera se plynule přesouvá (výběr podlaží) – jinak může uživatel volně posouvat
orbit.addEventListener('start', () => { desiredCam = null; flying = false; });
function flyToFloor() {
  const sel = levelIndex(state.floor);
  const y = sel >= 0 ? LEVELS[sel].z / 100 + 1 : 3;
  const dir = camera.position.clone().sub(orbit.target).normalize();
  dir.y = Math.max(dir.y, sel >= 0 ? 0.75 : 0.45);
  dir.normalize();
  desiredCam = new THREE.Vector3(5.5, y, 7).addScaledVector(dir, sel >= 0 ? 20 : 30);
  flying = true;
}
function flyOverview() {
  desiredTarget.set(10, 0, 20);
  desiredCam = new THREE.Vector3(-260, 330, 420);
  flying = true;
}

function levelIndex(id: FloorId) {
  return LEVELS.findIndex((l) => l.id === id);
}

function applyView() {
  const walk = state.mode === 'walk';
  const sel = walk ? -1 : levelIndex(state.floor);
  levels.forEach((lo, i) => {
    lo.group.visible = sel < 0 || i <= sel;
    const showLabels = !walk && state.labels && i === sel;
    lo.labels.forEach((l) => (l.visible = showLabels));
  });
  roof.visible = walk || (state.roof && (sel < 0 || LEVELS[sel].id === 'A'));
  context.visible = state.ctx || walk;

  const planes: THREE.Plane[] = [];
  if (!walk) {
    if (sel >= 0 && state.cutH) {
      planeH.constant = LEVELS[sel].z / 100 + state.cutHVal;
      planes.push(planeH);
    }
    if (state.cutX) { planeX.constant = state.cutXVal; planes.push(planeX); }
    if (state.cutZ) { planeZ.constant = state.cutZVal; planes.push(planeZ); }
  }
  setClipping(planes);

  if (!walk) {
    const y = sel >= 0 ? LEVELS[sel].z / 100 + 1 : 3;
    desiredTarget.set(5.5, y, 7);
  }
  // UI
  document.querySelectorAll<HTMLButtonElement>('#floors button').forEach((b) =>
    b.classList.toggle('on', b.dataset.floor === state.floor));
  document.querySelectorAll<HTMLButtonElement>('#mode button').forEach((b) =>
    b.classList.toggle('on', b.dataset.mode === state.mode));
  ($('#cutHRange') as HTMLInputElement).disabled = !state.cutH || state.floor === 'all';
  ($('#cutXRange') as HTMLInputElement).disabled = !state.cutX;
  ($('#cutZRange') as HTMLInputElement).disabled = !state.cutZ;
  const fmt = (v: number) => v.toFixed(2).replace('.', ',') + ' m';
  $('#cutHVal').textContent = fmt(state.cutHVal);
  $('#cutXVal').textContent = fmt(state.cutXVal);
  $('#cutZVal').textContent = fmt(state.cutZVal);
}

// ------------------------------------------------------------------ ovládání panelu
document.querySelectorAll<HTMLButtonElement>('#floors button').forEach((b) =>
  b.addEventListener('click', () => {
    state.floor = b.dataset.floor as FloorId;
    if (state.mode === 'walk') exitWalk();
    applyView();
    flyToFloor();
  }));
document.querySelectorAll<HTMLButtonElement>('#mode button').forEach((b) =>
  b.addEventListener('click', () => {
    if (b.dataset.mode === 'walk') enterWalk(state.floor === 'all' ? 'street' : state.floor);
    else exitWalk();
  }));
const bindCheck = (id: string, key: 'cutH' | 'cutX' | 'cutZ' | 'roof' | 'ctx' | 'labels') => {
  const el = $(id) as HTMLInputElement;
  el.checked = state[key];
  el.addEventListener('change', () => { state[key] = el.checked; applyView(); });
};
bindCheck('#cutH', 'cutH');
bindCheck('#cutX', 'cutX');
bindCheck('#cutZ', 'cutZ');
bindCheck('#showRoof', 'roof');
bindCheck('#showCtx', 'ctx');
bindCheck('#showLabels', 'labels');
const bindRange = (id: string, key: 'cutHVal' | 'cutXVal' | 'cutZVal') => {
  const el = $(id) as HTMLInputElement;
  el.addEventListener('input', () => { state[key] = +el.value; applyView(); });
};
bindRange('#cutHRange', 'cutHVal');
bindRange('#cutXRange', 'cutXVal');
bindRange('#cutZRange', 'cutZVal');
$('#panelToggle').addEventListener('click', () => $('#panel').classList.toggle('hidden'));
$('#overview').addEventListener('click', () => {
  state.floor = 'all';
  if (state.mode === 'walk') exitWalk();
  applyView();
  flyOverview();
});

// ------------------------------------------------------------------ výkresy
const ORIGINAL = [
  ['suteren.jpg', 'Suterén 1:100'],
  ['prizemi.jpg', 'Přízemí 1:100'],
  ['1-patro.jpg', 'I. patro 1:100'],
  ['krov.jpg', 'Krov 1:100'],
  ['pudorysy.jpg', 'Všechny půdorysy'],
  ['rez-a-pohled.jpg', 'Řez A–A′ a pohled přední'],
  ['pohledy.jpg', 'Pohled přední a boční'],
  ['celkovy-pohled.jpg', 'Celkový průčelní pohled'],
  ['situace.jpg', 'Situace 1:1000'],
];
// původní výkresy (1948) + současný stav vygenerovaný z modelu
const PLANS: { name: string; src: () => string; group: string }[] = [
  ...CURRENT_DRAWINGS().map((d) => ({
    name: d.name.replace(' – současný stav', ''),
    group: 'Současný stav',
    src: () => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(d.svg),
  })),
  ...ORIGINAL.map(([file, name]) => ({ name, group: 'Původní výkresy 1948', src: () => `${import.meta.env.BASE_URL}plans/${file}` })),
];
const planList = $('#planList');
const planButtons: HTMLButtonElement[] = [];
const showPlan = (i: number) => {
  ($('#planImg') as HTMLImageElement).src = PLANS[i].src();
  $('#planCap').textContent = `${PLANS[i].group} · ${PLANS[i].name}`;
  planButtons.forEach((b, k) => b.classList.toggle('on', k === i));
};
let lastGroup = '';
PLANS.forEach((p, i) => {
  if (p.group !== lastGroup) {
    const h = document.createElement('div');
    h.className = 'plan-group';
    h.textContent = p.group;
    planList.appendChild(h);
    lastGroup = p.group;
  }
  const b = document.createElement('button');
  b.textContent = p.name;
  b.onclick = () => showPlan(i);
  planList.appendChild(b);
  planButtons.push(b);
});
$('#openPlans').addEventListener('click', () => {
  const map: Record<string, number> = { S: 0, P: 1, '1P': 2, A: 3 };
  showPlan(map[state.floor] ?? 4);
  $('#plans').hidden = false;
});
$('#closePlans').addEventListener('click', () => ($('#plans').hidden = true));
$('#plans').addEventListener('click', (e) => { if (e.target === $('#plans')) $('#plans').hidden = true; });

// ------------------------------------------------------------------ procházení
const EYE = 1.62, RADIUS = 0.26;
const feet = new THREE.Vector3();
let vy = 0;
const keys = new Set<string>();
const ray = new THREE.Raycaster();
const wallTargets = [...levels.flatMap((l) => [l.walls, l.rails, l.colliders]), ...siteColliders, ...buildingColliders, ...doors.flatMap((d) => d.parts)];
const floorTargets = [...levels.flatMap((l) => l.floors), ground, ...siteWalkables];
// BVH pro rychlé kolize s velkými sloučenými meshi (okolí ~500 m)
for (const o of [...wallTargets, ...floorTargets]) {
  const m = o as THREE.Mesh;
  if (m.isMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && m.geometry.attributes.position.count > 300) m.geometry.computeBoundsTree();
}

function spawnAt(where: string) {
  vy = 0;
  if (where === 'street') {
    feet.set(STREET_SPAWN[0] / 100, TERRAIN_Z / 100, STREET_SPAWN[1] / 100);
    camera.position.copy(feet).add(new THREE.Vector3(0, EYE, 0));
    camera.lookAt(feet.x, feet.y + EYE + 0.4, feet.z - 5);
  } else {
    const lv = LEVELS.find((l) => l.id === where) ?? LEVELS[1];
    feet.set(lv.spawn[0] / 100, lv.z / 100 + 0.05, lv.spawn[1] / 100);
    camera.position.copy(feet).add(new THREE.Vector3(0, EYE, 0));
    camera.lookAt(feet.x - 3, feet.y + EYE, feet.z + 2);
  }
}

function enterWalk(where: string) {
  state.mode = 'walk';
  document.body.classList.add('walking');
  orbit.enabled = false;
  lamp.visible = true;
  camera.fov = 70;
  camera.updateProjectionMatrix();
  spawnAt(where);
  applyView();
  $('#walkHud').hidden = false;
  $('#panel').classList.add('hidden');
  $('#walkPause').hidden = false;
}

function exitWalk() {
  if (state.mode !== 'walk') return;
  state.mode = 'orbit';
  walking = false;
  document.body.classList.remove('walking');
  $('#touchHud').hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  orbit.enabled = true;
  lamp.visible = false;
  camera.fov = 50;
  camera.updateProjectionMatrix();
  camera.position.set(-14, 16, 24);
  orbit.target.copy(desiredTarget);
  $('#walkHud').hidden = true;
  $('#walkPause').hidden = true;
  $('#crosshair').hidden = true;
  $('#panel').classList.remove('hidden');
  applyView();
}

// Chůze běží i bez zamknutého kurzoru (pointer lock nemusí být v každém prohlížeči dostupný).
let walking = false;
function pause() {
  walking = false;
  keys.clear();
  $('#touchHud').hidden = true;
  $('#crosshair').hidden = true;
  $('#walkPause').hidden = false;
}
function resume() {
  walking = true;
  (document.activeElement as HTMLElement | null)?.blur?.(); // aby klávesy nestiskly tlačítko v panelu
  $('#walkPause').hidden = true;
  $('#crosshair').hidden = false;
  if (document.body.classList.contains('touch')) $('#touchHud').hidden = false;
  renderer.domElement.focus();
  if (isTouch) return;
  try {
    const p = renderer.domElement.requestPointerLock?.() as unknown as Promise<void> | undefined;
    p?.catch?.(() => {});
  } catch { /* zůstane rozhlížení tažením myši */ }
}
renderer.domElement.tabIndex = 0;
document.addEventListener('pointerlockchange', () => {
  if (state.mode === 'walk' && walking && plcWasLocked) pause();
  plcWasLocked = document.pointerLockElement === renderer.domElement;
});
let plcWasLocked = false;
$('#resume').addEventListener('click', resume);
$('#exitWalk').addEventListener('click', exitWalk);
document.querySelectorAll<HTMLButtonElement>('.spawns button').forEach((b) =>
  b.addEventListener('click', () => { spawnAt(b.dataset.spawn!); resume(); }));

// rozhlížení: zamknutý kurzor -> pohyb myši, jinak tažení myší
const look = new THREE.Euler(0, 0, 0, 'YXZ');
function turn(dYaw: number, dPitch: number) {
  look.setFromQuaternion(camera.quaternion);
  look.y -= dYaw;
  look.x = Math.max(-1.5, Math.min(1.5, look.x - dPitch));
  camera.quaternion.setFromEuler(look);
}
// ---- dveře: otevřít/zavřít kliknutím, klepnutím nebo klávesou F
const doorRay = new THREE.Raycaster();
function tryToggleDoor(ndcX: number, ndcY: number) {
  camera.updateMatrixWorld();
  doorRay.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  doorRay.far = state.mode === 'walk' ? 3.5 : 200;
  const hit = doorRay.intersectObjects(doors.flatMap((d) => d.parts), false)[0];
  if (!hit) return false;
  toggleDoor(doors.find((x) => x.parts.includes(hit.object as THREE.Mesh))!);
  return true;
}
function toggleDoor(d: (typeof doors)[number]) {
  const open = !d.open;
  for (const x of doors) if (x.link === d.link) x.open = open; // obě křídla najednou
}

// ---- ovládání myší / dotykem
let dragging = false;
let downX = 0, downY = 0, downT = 0;
const touchLast = new Map<number, { x: number; y: number }>();
renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = e.clientX; downY = e.clientY; downT = performance.now();
  if (state.mode !== 'walk') return;
  if (!walking) { resume(); return; }
  dragging = true;
  touchLast.set(e.pointerId, { x: e.clientX, y: e.clientY });
  renderer.domElement.setPointerCapture?.(e.pointerId);
});
addEventListener('pointerup', (e) => {
  dragging = false;
  touchLast.delete(e.pointerId);
  // krátké klepnutí / kliknutí bez tažení = akce (dveře)
  if (e.target !== renderer.domElement) return;
  if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8 || performance.now() - downT > 350) return;
  const locked = document.pointerLockElement === renderer.domElement;
  if (state.mode === 'walk' && locked) tryToggleDoor(0, 0);
  else tryToggleDoor((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (state.mode !== 'walk' || !walking) return;
  const locked = document.pointerLockElement === renderer.domElement;
  if (e.pointerType === 'touch') {
    const last = touchLast.get(e.pointerId);
    if (last) {
      // dotyk: obraz se posouvá s prstem (opačně než myš)
      turn(-(e.clientX - last.x) * 0.005, -(e.clientY - last.y) * 0.005);
      touchLast.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    return;
  }
  if (locked || dragging) turn(e.movementX * 0.0025, e.movementY * 0.0025);
});

// ---- mobilní joystick pro chůzi
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const joy = { x: 0, y: 0 };
{
  const base = $('#joy'), knob = $('#joyKnob');
  let id = -1;
  const R = 50;
  const update = (e: PointerEvent) => {
    const r = base.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
    joy.x = dx / R; joy.y = dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  base.addEventListener('pointerdown', (e) => { id = e.pointerId; base.classList.add('active'); base.setPointerCapture(e.pointerId); update(e); e.preventDefault(); });
  base.addEventListener('pointermove', (e) => { if (e.pointerId === id) update(e); });
  const end = (e: PointerEvent) => { if (e.pointerId !== id) return; id = -1; joy.x = joy.y = 0; knob.style.transform = ''; base.classList.remove('active'); };
  base.addEventListener('pointerup', end);
  base.addEventListener('pointercancel', end);
  $('#walkMenu').addEventListener('click', () => pause());
  $('#doorBtn').addEventListener('click', () => {
    // nejbližší dveře do 3 m
    const p = camera.position;
    const d = doors.map((x) => ({ x, dist: x.parts[0].getWorldPosition(new THREE.Vector3()).distanceTo(p) })).sort((a, b) => a.dist - b.dist)[0];
    if (d && d.dist < 3.5) toggleDoor(d.x);
  });
}

const WALK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE'];
addEventListener('keydown', (e) => {
  if (state.mode !== 'walk') return;
  // při procházení nesmí mezerník/Enter/šipky ovládat tlačítka panelu (jinak by se přeplo na celý dům)
  if (['Space', 'Enter', 'NumpadEnter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape') { if (walking) pause(); else resume(); return; }
  if (!walking) { if (e.code === 'Enter' || e.code === 'Space') resume(); return; }
  if (WALK_KEYS.includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.code === 'KeyF') tryToggleDoor(0, 0);
  const jump: Record<string, string> = { Digit0: 'street', Digit1: 'S', Digit2: 'P', Digit3: '1P', Digit4: 'A' };
  if (jump[e.code]) spawnAt(jump[e.code]);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

const tmpDir = new THREE.Vector3();
const origin = new THREE.Vector3();
function blocked(dx: number, dz: number) {
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return false;
  tmpDir.set(dx / len, 0, dz / len);
  // paprsky ve třech výškách a také po stranách postavy (aby se neprošlo úzkou mezerou)
  const sx = -tmpDir.z, sz = tmpDir.x;
  for (const h of [0.45, 1.1, 1.75]) {
    for (const off of [0, -RADIUS * 0.8, RADIUS * 0.8]) {
      origin.set(feet.x + sx * off, feet.y + h, feet.z + sz * off);
      ray.set(origin, tmpDir);
      ray.far = len + (off === 0 ? RADIUS : RADIUS * 0.6);
      if (ray.intersectObjects(wallTargets, false).length) return true;
    }
  }
  return false;
}

const down = new THREE.Vector3(0, -1, 0);
function updateWalk(dt: number) {
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3().crossVectors(fwd, camera.up).normalize();
  let mx = 0, mz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) { mx += fwd.x; mz += fwd.z; }
  if (keys.has('KeyS') || keys.has('ArrowDown')) { mx -= fwd.x; mz -= fwd.z; }
  if (keys.has('KeyD')) { mx += right.x; mz += right.z; }
  if (keys.has('KeyA')) { mx -= right.x; mz -= right.z; }
  // joystick (mobil): nahoru = dopředu, do stran = úkrok
  mx += fwd.x * -joy.y + right.x * joy.x;
  mz += fwd.z * -joy.y + right.z * joy.x;
  const joyMag = Math.min(1, Math.hypot(joy.x, joy.y));
  const turnRate = 1.9 * dt;
  if (keys.has('ArrowLeft') || keys.has('KeyQ')) turn(-turnRate, 0);
  if (keys.has('ArrowRight') || keys.has('KeyE')) turn(turnRate, 0);
  const l = Math.hypot(mx, mz);
  if (l > 0) {
    const analog = joyMag > 0 && !keys.size ? 0.4 + joyMag * 0.9 : 1;
    const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 5 : 1.6) * analog * dt;
    mx = (mx / l) * speed; mz = (mz / l) * speed;
    if (!blocked(mx, mz)) { feet.x += mx; feet.z += mz; }
    else {
      if (!blocked(mx, 0)) feet.x += mx;
      else if (!blocked(0, mz)) feet.z += mz;
    }
  }
  // gravitace a schody
  origin.set(feet.x, feet.y + 0.5, feet.z);
  ray.set(origin, down);
  ray.far = 60;
  const hit = ray.intersectObjects(floorTargets, false)[0];
  const groundY = hit ? hit.point.y : TERRAIN_Z / 100;
  if (feet.y <= groundY + 0.02) { feet.y = groundY; vy = 0; }
  else {
    vy -= 18 * dt;
    feet.y = Math.max(groundY, feet.y + vy * dt);
    if (feet.y === groundY) vy = 0;
  }
  camera.position.set(feet.x, feet.y + EYE, feet.z);
  drawMinimap();
}

// minimapa aktuálního podlaží
const mm = $('#minimap') as HTMLCanvasElement;
const mg = mm.getContext('2d')!;
const FLOOR_COL: Record<string, string> = {
  wood: '#e4c9a3', tile: '#dfe3e2', stone: '#d6c8b4', concrete: '#cfcac1',
  carpet: '#c9bca8', linoleum: '#c9cfbe', brownTile: '#9a7560', terrazzo: '#d4cfc6',
};
function currentLevel() {
  let idx = 0;
  LEVELS.forEach((l, i) => { if (feet.y >= l.z / 100 - 0.4) idx = i; });
  return LEVELS[idx];
}
function drawMinimap() {
  const lv = currentLevel();
  const outside = feet.x < 0 || feet.x > 11 || feet.z < 0 || feet.z > 15.3 || (feet.x < 3.5 && feet.z > 9);
  $('#whereami').textContent = !outside ? lv.name : feet.z > 18.8 ? 'Ulice Bendlova' : feet.z > 11 ? 'Předzahrádka' : 'Zahrada';
  const pad = 14, s = (mm.width - pad * 2) / 1100;
  mg.clearRect(0, 0, mm.width, mm.height);
  mg.save();
  mg.translate(pad, pad);
  for (const r of lv.rooms) {
    mg.fillStyle = FLOOR_COL[r.floor];
    mg.fillRect(r.r[0] * s, r.r[1] * s, (r.r[2] - r.r[0]) * s, (r.r[3] - r.r[1]) * s);
  }
  for (const w of lv.walls) {
    mg.fillStyle = w.kind === 'railing' ? '#6b6155' : '#d98c64';
    const [x0, y0, x1, y1] = w.r;
    mg.fillRect(x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);
    mg.fillStyle = FLOOR_COL.wood;
    const alongX = x1 - x0 >= y1 - y0;
    for (const o of w.o ?? []) {
      mg.fillStyle = o.kind === 'door' ? '#f3ecdf' : '#9cc3d8';
      if (alongX) mg.fillRect(o.a * s, y0 * s, (o.b - o.a) * s, (y1 - y0) * s);
      else mg.fillRect(x0 * s, o.a * s, (x1 - x0) * s, (o.b - o.a) * s);
    }
  }
  // hráč
  const px = feet.x * 100 * s, py = feet.z * 100 * s;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const ang = Math.atan2(dir.z, dir.x);
  mg.translate(px, py);
  mg.rotate(ang);
  mg.fillStyle = 'rgba(43,38,32,.18)';
  mg.beginPath(); mg.moveTo(0, 0); mg.arc(0, 0, 34, -0.55, 0.55); mg.fill();
  mg.fillStyle = '#2b2620';
  mg.beginPath(); mg.moveTo(8, 0); mg.lineTo(-5, -5); mg.lineTo(-5, 5); mg.closePath(); mg.fill();
  mg.restore();
}

// ------------------------------------------------------------------ smyčka
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.mode === 'walk') {
    if (walking) updateWalk(dt);
  } else {
    const k = 1 - Math.pow(0.002, dt);
    if (flying) {
      orbit.target.lerp(desiredTarget, k);
      if (desiredCam) camera.position.lerp(desiredCam, k);
      if ((!desiredCam || camera.position.distanceTo(desiredCam) < 0.05) && orbit.target.distanceTo(desiredTarget) < 0.05) { desiredCam = null; flying = false; }
    }
    orbit.update();
  }
  for (const d of doors) {
    const target = d.open ? d.openAngle : 0;
    d.angle += (target - d.angle) * Math.min(1, dt * 6);
    d.pivot.rotation.y = (d.base ?? 0) + d.angle;
  }
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(loop);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

applyView();
loop();
// pro ladění
Object.assign(window as object, { __app: { scene, camera, state, levels, enterWalk, exitWalk, spawnAt, feet, keys, updateWalk, doors, joy } });
