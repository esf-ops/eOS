import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Units are the drawing's own (70 units = the 3 cm slab thickness). Meshes are scaled to scene size by the caller. */
export const THICKNESS_UNITS = 70;
export const SLAB_DEPTH_UNITS = 200;

const loader = new SVGLoader();
const outlineCache = new Map<string, THREE.Vector2[]>();

/** Closed cross-section, counter-clockwise, finished edge at x=0 facing +x, slab body running back along -x, centred on y. */
export function edgeOutline(path: string): THREE.Vector2[] {
  const cached = outlineCache.get(path);
  if (cached) return cached.map((p) => p.clone());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><path d="${path}"/></svg>`;
  const parsed = loader.parse(svg);
  const shapes = SVGLoader.createShapes(parsed.paths[0]!);
  const raw = shapes[0]!.extractPoints(20).shape;
  const pts: THREE.Vector2[] = [];
  for (const p of raw) {
    const x = p.x <= 10.01 ? -SLAB_DEPTH_UNITS : p.x - 150;
    const y = -(p.y - 45);
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(last.x - x, last.y - y) > 1e-4) pts.push(new THREE.Vector2(x, y));
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first && last && first.distanceTo(last) < 1e-4) pts.pop();
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  outlineCache.set(path, pts);
  return pts.map((p) => p.clone());
}

/** A solid piece of countertop: the profile pulled `length` units along z. Smooth normals on the curves, creased at real corners. */
export function buildEdgeGeometry(path: string, length: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(edgeOutline(path));
  const extruded = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, steps: 1, curveSegments: 1 });
  extruded.translate(0, 0, -length / 2);
  const creased = toCreasedNormals(extruded, Math.PI / 5);
  extruded.dispose();
  return creased;
}
