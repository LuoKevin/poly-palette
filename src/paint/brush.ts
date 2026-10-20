import { Color, DoubleSide, Matrix3, Mesh, Raycaster, Vector2, Vector3 } from 'three';
import type { Camera, Intersection } from 'three';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import type { ModelAsset } from '../model/types';
import { paintBlocker, prepareMesh } from './prepareMesh';

export interface BrushSettings { color: string; size: number; opacity: number; replaceTextures: boolean }
export interface Point { x: number; y: number }
export interface StrokeResult { vertices: number; mesh: string }

export function segmentDistance(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(point.x - start.x - t * dx, point.y - start.y - t * dy);
}

function accelerate(mesh: Mesh) {
  if (!mesh.geometry.boundsTree) {
    // Indirection leaves the model's triangle order and material groups intact.
    const options = { indirect: true, verbose: false };
    mesh.geometry.boundsTree = new MeshBVH(mesh.geometry, options);
  }
  mesh.raycast = acceleratedRaycast;
}

/** One immutable camera/brush snapshot per stroke. No React state per vertex. */
export class PaintStroke {
  private readonly ray = new Raycaster();
  private readonly meshes: Mesh[] = [];
  private readonly cameraPosition = new Vector3();
  private readonly tint: Color;
  private readonly projected: Float32Array;
  private readonly visibility: Int8Array;
  private readonly changed = new Map<number, { r: number; g: number; b: number; coverage: number }>();
  private readonly normalMatrix = new Matrix3();
  private last: Point;
  readonly mesh: Mesh;

  constructor(asset: ModelAsset, private camera: Camera, private width: number, private height: number, private brush: BrushSettings, start: Point) {
    asset.root.updateWorldMatrix(true, true);
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(this.cameraPosition);
    asset.root.traverseVisible((object) => {
      if (object instanceof Mesh && object.geometry.getAttribute('position')) {
        accelerate(object);
        this.meshes.push(object);
      }
    });
    this.ray.firstHitOnly = true;
    const hit = this.hit(start);
    if (!hit) throw new Error('Start a stroke on the model.');
    this.mesh = hit.object as Mesh;
    const blocker = paintBlocker(this.mesh, brush.replaceTextures);
    if (blocker) throw new Error(blocker);
    prepareMesh(asset, this.mesh, brush.replaceTextures);
    accelerate(this.mesh);
    this.tint = new Color(brush.color); // CSS/sRGB → linear working-space RGB.
    this.last = start;
    const positions = this.mesh.geometry.getAttribute('position');
    this.projected = new Float32Array(positions.count * 2);
    this.visibility = new Int8Array(positions.count).fill(-1);
    this.normalMatrix.getNormalMatrix(this.mesh.matrixWorld);
    const point = new Vector3();
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(positions, i).applyMatrix4(this.mesh.matrixWorld).project(camera);
      this.projected[i * 2] = point.z >= -1 && point.z <= 1 ? (point.x + 1) * width / 2 : Infinity;
      this.projected[i * 2 + 1] = (1 - point.y) * height / 2;
    }
    this.move(start);
  }

  private hit(point: Point): Intersection | undefined {
    this.ray.near = 0;
    this.ray.far = Infinity;
    this.ray.setFromCamera(new Vector2(point.x / this.width * 2 - 1, 1 - point.y / this.height * 2), this.camera);
    return this.ray.intersectObjects(this.meshes, false)[0];
  }

  private visible(index: number) {
    if (this.visibility[index] !== -1) return this.visibility[index] === 1;
    const geometry = this.mesh.geometry;
    const world = new Vector3().fromBufferAttribute(geometry.getAttribute('position'), index).applyMatrix4(this.mesh.matrixWorld);
    const towardCamera = this.cameraPosition.clone().sub(world);
    const normal = new Vector3().fromBufferAttribute(geometry.getAttribute('normal'), index).applyNormalMatrix(this.normalMatrix);
    const materials = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
    let visible = materials.some((m) => m.side === DoubleSide) || normal.dot(towardCamera) > 0;
    if (visible) {
      const distance = towardCamera.length();
      // Test the segment BEFORE the vertex: its own surface is not an occluder.
      // The viewport is normalized to about 3 units, so this epsilon is small.
      this.ray.set(this.cameraPosition, towardCamera.negate().normalize());
      this.ray.near = 0;
      this.ray.far = Math.max(0, distance - 1e-5);
      visible = this.ray.intersectObjects(this.meshes, false).length === 0;
    }
    this.visibility[index] = visible ? 1 : 0;
    return visible;
  }

  move(point: Point) {
    const colors = this.mesh.geometry.getAttribute('color');
    const radius = this.brush.size / 2;
    let updates = 0;
    for (let i = 0; i < colors.count; i++) {
      const distance = segmentDistance({ x: this.projected[i * 2], y: this.projected[i * 2 + 1] }, this.last, point);
      if (!Number.isFinite(distance) || distance >= radius || !this.visible(i)) continue;
      const fade = Math.max(0, Math.min(1, (distance / radius - 0.65) / 0.35));
      const coverage = this.brush.opacity * (1 - fade * fade * (3 - 2 * fade));
      const previous = this.changed.get(i) ?? { r: colors.getX(i), g: colors.getY(i), b: colors.getZ(i), coverage: 0 };
      if (coverage <= previous.coverage) continue;
      // Max coverage over the whole stroke makes opacity independent of event
      // frequency. Another stroke can deliberately build up another layer.
      colors.setXYZ(i,
        previous.r + (this.tint.r - previous.r) * coverage,
        previous.g + (this.tint.g - previous.g) * coverage,
        previous.b + (this.tint.b - previous.b) * coverage);
      previous.coverage = coverage;
      this.changed.set(i, previous);
      updates++;
    }
    this.last = point;
    if (updates) colors.needsUpdate = true;
    return updates;
  }

  finish(): StrokeResult { return { vertices: this.changed.size, mesh: this.mesh.name || 'mesh' }; }
}
