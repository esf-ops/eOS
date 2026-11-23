import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** Units are the drawing's own (70 units = the 3 cm slab thickness). Meshes are scaled to scene size by the caller. */
export const THICKNESS_UNITS = 70;
export const SLAB_DEPTH_UNITS = 200;

const loader = new SVGLoader();
const outlineCache = new Map<string, THREE.Vector2[]>();

/** Closed cross-section, counter-clockwise, finished edge at x=0 facing +x, slab body running back along -x, centred on y. */
export function edgeOutline(path: string, depth: number = SLAB_DEPTH_UNITS): THREE.Vector2[] {
  const cacheKey = `${depth}|${path}`;
  const cached = outlineCache.get(cacheKey);
  if (cached) return cached.map((p) => p.clone());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"><path d="${path}"/></svg>`;
  const parsed = loader.parse(svg);
  const shapes = SVGLoader.createShapes(parsed.paths[0]!);
  const raw = shapes[0]!.extractPoints(20).shape;
  const pts: THREE.Vector2[] = [];
  for (const p of raw) {
    const x = p.x <= 10.01 ? -depth : p.x - 150;
    const y = -(p.y - 45);
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(last.x - x, last.y - y) > 1e-4) pts.push(new THREE.Vector2(x, y));
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first && last && first.distanceTo(last) < 1e-4) pts.pop();
  if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  outlineCache.set(cacheKey, pts);
  return pts.map((p) => p.clone());
}

/** A solid piece of countertop: the profile pulled `length` units along z. Smooth normals on the curves, creased at real corners. */
export function buildEdgeGeometry(path: string, length: number, depth: number = SLAB_DEPTH_UNITS): THREE.BufferGeometry {
  const shape = new THREE.Shape(edgeOutline(path, depth));
  const extruded = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, steps: 1, curveSegments: 1 });
  extruded.translate(0, 0, -length / 2);
  const creased = toCreasedNormals(extruded, Math.PI / 5);
  extruded.dispose();
  applyContinuousUvs(creased, edgeOutline(path, depth), length, depth);
  return creased;
}

// Where the stone photo starts, in drawing units (the material's texture repeat turns these into 0..1). Offsets keep every
// coordinate inside one tile for normal-size pieces (longer pieces run past a tile; the scene mirrors the photo there so the
// veining continues instead of jumping).
const UV_OFFSET_U = 50;
const UV_OFFSET_V = 400;

/**
 * Lays the stone photo onto the slab like a real piece of stone: one continuous sheet that runs over the top, around the
 * finished edge and down the underside (u = distance along the profile, v = distance along the slab), and an end face that
 * continues the top surface past the cut. The default extrusion mapping switched direction on curves and started the photo at
 * the slab's mid-thickness, which split every edge into a top and bottom half with a visible seam.
 */
function applyContinuousUvs(geo: THREE.BufferGeometry, outline: THREE.Vector2[], length: number, depth: number): void {
  const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
  // Distance along the outline, starting at the back of the top surface and heading toward the finished edge.
  let iTop = 0;
  outline.forEach((p, i) => {
    const t = outline[iTop]!;
    if (p.y > t.y + 1e-6 || (Math.abs(p.y - t.y) < 1e-6 && p.x < t.x)) iTop = i;
  });
  const topY = outline[iTop]!.y;
  const n = outline.length;
  // The outline is counter-clockwise; walking it backwards from the top-back corner goes along the top toward the edge.
  const arc = new Map<string, number>();
  let s = 0;
  for (let k = 0; k < n; k++) {
    const p = outline[(iTop - k + n) % n]!;
    if (k > 0) s += p.distanceTo(outline[(iTop - k + 1 + n) % n]!);
    arc.set(key(p.x, p.y), s);
  }
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const cap = Math.abs(nor.getZ(i)) > 0.5;
    let u: number;
    let v: number;
    if (cap) {
      u = x + depth + UV_OFFSET_U;
      v = nor.getZ(i) > 0 ? UV_OFFSET_V + length + (topY - y) : UV_OFFSET_V - (topY - y);
    } else {
      u = (arc.get(key(x, y)) ?? x + depth) + UV_OFFSET_U;
      v = z + length / 2 + UV_OFFSET_V;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}
