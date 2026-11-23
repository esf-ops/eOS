import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { buildEdgeGeometry, SLAB_DEPTH_UNITS, THICKNESS_UNITS } from "./edgeGeometry";
import type { EdgeProfile } from "./edgeProfileData";

export type SlabFinish = "polished" | "honed";

const SCENE_THICKNESS = 3; // scene units for the 3 cm slab
const S = SCENE_THICKNESS / THICKNESS_UNITS; // drawing units -> scene units
const TEXTURE_TILE_UNITS = 1100; // how much of the slab photo one tile covers, in drawing units
const IDLE_RESUME_MS = 7000;

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function contactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class EdgeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private group = new THREE.Group();
  private material: THREE.MeshPhysicalMaterial;
  private shadow: THREE.Mesh;
  private shadowTex = contactShadowTexture();
  private textureLoader = new THREE.TextureLoader();
  private texture: THREE.Texture | null = null;
  private geoCache = new Map<string, THREE.BufferGeometry>();
  private resizeObs: ResizeObserver;
  private idleTimer: number | null = null;
  private reducedMotion: boolean;
  private disposed = false;
  private compare = false;

  constructor(private container: HTMLElement, canvas: HTMLCanvasElement, private onTextureError?: () => void) {
    this.reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(envScene, 0.04).texture;
    envScene.dispose();
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(6, 10, 7);
    this.scene.add(key, new THREE.AmbientLight(0xffffff, 0.35));

    this.material = new THREE.MeshPhysicalMaterial({ color: 0xe9e6e1, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1 });
    this.scene.add(this.group);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = -SCENE_THICKNESS / 2 - 0.35;
    this.scene.add(this.shadow);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    this.camera.position.set(10, 4.6, 7.5);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 24;
    this.controls.maxPolarAngle = Math.PI * 0.53;
    this.controls.autoRotate = !this.reducedMotion;
    this.controls.autoRotateSpeed = 1.1;
    this.controls.addEventListener("start", () => {
      this.controls.autoRotate = false;
      if (this.idleTimer) window.clearTimeout(this.idleTimer);
    });
    this.controls.addEventListener("end", () => {
      if (this.reducedMotion) return;
      if (this.idleTimer) window.clearTimeout(this.idleTimer);
      this.idleTimer = window.setTimeout(() => { this.controls.autoRotate = true; }, IDLE_RESUME_MS);
    });

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  private resize() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;
    // Keep the same horizontal framing on narrow stages (kiosk panel beside it, portrait screens).
    const REF_ASPECT = 1.5;
    const hHalf = Math.tan(THREE.MathUtils.degToRad(15)) * REF_ASPECT;
    this.camera.fov = aspect >= REF_ASPECT ? 30 : Math.min(70, THREE.MathUtils.radToDeg(2 * Math.atan(hHalf / aspect)));
    this.camera.updateProjectionMatrix();
  }

  private geometryFor(edge: EdgeProfile, length: number): THREE.BufferGeometry {
    const key = `${edge.token}:${length}`;
    let geo = this.geoCache.get(key);
    if (!geo) {
      geo = buildEdgeGeometry(edge.path, length);
      this.geoCache.set(key, geo);
    }
    return geo;
  }

  /** Hairline for a mitered joint: on both end faces and along the outer corner. Drawn in the mesh's own (drawing) units. */
  private seamLines(seam: readonly [number, number, number, number], length: number): THREE.LineSegments {
    const [x1, y1, x2, y2] = seam;
    const a = { x: x1 - 150, y: -(y1 - 45) };
    const b = { x: x2 - 150, y: -(y2 - 45) };
    const half = length / 2 + 0.3;
    // The outer corner is slightly eased, so sit the corner line just inside the sharp point.
    const c = { x: a.x - 1.2, y: a.y - 1.2 };
    const pts = [
      a.x, a.y, half, b.x, b.y, half,
      a.x, a.y, -half, b.x, b.y, -half,
      c.x, c.y, -length / 2, c.x, c.y, length / 2,
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x3a3a3a, transparent: true, opacity: 0.6 }));
  }

  /** One slab, or two side by side to compare edges. */
  setEdges(edges: readonly EdgeProfile[]) {
    for (const child of [...this.group.children]) {
      this.group.remove(child);
      child.traverse((o) => { if (o instanceof THREE.LineSegments) o.geometry.dispose(); });
    }
    this.compare = edges.length > 1;
    const length = this.compare ? 150 : 240;
    const gap = 30;
    edges.forEach((edge, i) => {
      const mesh = new THREE.Mesh(this.geometryFor(edge, length), this.material);
      mesh.scale.setScalar(S);
      const offset = this.compare ? (i === 0 ? -1 : 1) * ((length + gap) / 2) * S : 0;
      mesh.position.z = offset;
      if (edge.seam) mesh.add(this.seamLines(edge.seam, length));
      this.group.add(mesh);
    });
    // Shapes that hang below the slab (mitered edge, waterfall): drop the shadow to the bottom and frame the whole piece.
    const hang = Math.max(0, ...edges.map((e) => e.drop ?? 0)) * S;
    this.shadow.position.y = -SCENE_THICKNESS / 2 - 0.35 - hang;
    const span = (this.compare ? length * 2 + gap : length) * S;
    const centerX = (-SLAB_DEPTH_UNITS / 2) * S;
    this.shadow.scale.set(SLAB_DEPTH_UNITS * S + 5, span + 5, 1);
    this.shadow.position.x = centerX;
    this.controls.target.set(centerX * 0.4, -hang / 2, 0);
    this.controls.minDistance = this.compare ? 10 : 7;
    this.controls.maxDistance = (this.compare ? 40 : 28) + hang * 1.5;
    const dist = (this.compare ? 25 : 14.5) + hang * 2.2;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
    this.controls.update();
  }

  setFinish(finish: SlabFinish) {
    if (finish === "polished") {
      this.material.roughness = 0.12;
      this.material.clearcoat = 1;
      this.material.clearcoatRoughness = 0.06;
      this.material.envMapIntensity = 1;
    } else {
      this.material.roughness = 0.6;
      this.material.clearcoat = 0.08;
      this.material.clearcoatRoughness = 0.5;
      this.material.envMapIntensity = 0.55;
    }
    this.material.needsUpdate = true;
  }

  setTexture(url: string | null) {
    if (!url) {
      this.applyTexture(null);
      return;
    }
    this.textureLoader.setCrossOrigin("anonymous");
    this.textureLoader.load(
      url,
      (tex) => {
        if (this.disposed) { tex.dispose(); return; }
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.repeat.set(1 / TEXTURE_TILE_UNITS, 1 / TEXTURE_TILE_UNITS);
        tex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.applyTexture(tex);
      },
      undefined,
      () => { this.applyTexture(null); this.onTextureError?.(); },
    );
  }

  private applyTexture(tex: THREE.Texture | null) {
    this.texture?.dispose();
    this.texture = tex;
    this.material.map = tex;
    this.material.color.set(tex ? 0xffffff : 0xe9e6e1);
    this.material.needsUpdate = true;
  }

  dispose() {
    this.disposed = true;
    if (this.idleTimer) window.clearTimeout(this.idleTimer);
    this.renderer.setAnimationLoop(null);
    this.resizeObs.disconnect();
    this.controls.dispose();
    this.geoCache.forEach((g) => g.dispose());
    this.material.dispose();
    this.texture?.dispose();
    this.shadowTex.dispose();
    this.renderer.dispose();
  }
}
