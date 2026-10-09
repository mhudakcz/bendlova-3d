// Otevíratelné dveře, vrata a branky – společný typ a pomocník pro křídla.
import * as THREE from 'three';

export type Door = {
  pivot: THREE.Group; // otáčí se kolem svislé osy v pantu
  parts: THREE.Mesh[]; // části křídla (pro kliknutí a kolize)
  open: boolean;
  angle: number;
  openAngle: number; // úhel otevření (rad), znaménko určuje směr
  link: string; // křídla se stejným link se otevírají společně
  base?: number; // výchozí natočení (např. plot není přesně v ose)
};

/**
 * Křídlo s pantem v bodě (x, y, z) [m, světové souřadnice]; dir = +1 křídlo vede k +X, −1 k −X
 * (pro zdi rovnoběžné s osou X). Obsah křídla se staví v lokálních souřadnicích od pantu.
 */
export function makeLeaf(
  parent: THREE.Object3D,
  hinge: [number, number, number],
  width: number,
  build: (leaf: THREE.Group, w: number) => THREE.Mesh[],
  openAngle: number,
  link: string,
  rotY = 0,
): Door {
  const pivot = new THREE.Group();
  pivot.position.set(...hinge);
  const holder = new THREE.Group();
  holder.rotation.y = rotY;
  pivot.add(holder);
  const parts = build(holder, width);
  for (const p of parts) { p.castShadow = true; p.receiveShadow = true; }
  parent.add(pivot);
  return { pivot, parts, open: false, angle: 0, openAngle, link };
}
