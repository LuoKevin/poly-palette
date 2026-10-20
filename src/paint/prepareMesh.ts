import { Color, DynamicDrawUsage, Float32BufferAttribute, Group, Mesh } from 'three';
import type { BufferGeometry, Material, Object3D, Texture } from 'three';
import type { ModelAsset } from '../model/types';

import { originalWireframe } from '../model/display';

type PaintMaterial = Material & { color?: Color; map?: Texture | null; vertexColors?: boolean };
const prepared = new WeakSet<BufferGeometry>();
export interface Preparation {
  before: { geometry: BufferGeometry; material: Mesh['material'] };
  after: { geometry: BufferGeometry; material: Mesh['material'] };
  holders: Object3D[];
}

export function paintBlocker(mesh: Mesh, replaceTextures: boolean): string | null {
  for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
    const m = material as PaintMaterial;
    if (!(m.color instanceof Color)) return 'This mesh uses a material that does not support vertex colors.';
    if (m.transparent || m.opacity < 1 || m.alphaTest > 0) return 'Painting currently supports opaque meshes. Transparent and cutout meshes can still be viewed and exported.';
    if (m.map && !replaceTextures) return 'This mesh has a base-color texture. Enable “Replace base-color textures” to paint it with vertex colors.';
  }
  return null;
}

/** Prepare only the touched mesh. Never mutate another mesh's shared resources. */
export function prepareMesh(asset: ModelAsset, mesh: Mesh, replaceTextures: boolean) {
  if (prepared.has(mesh.geometry)) return;
  const blocker = paintBlocker(mesh, replaceTextures);
  if (blocker) throw new Error(blocker);
  const originalGeometry = mesh.geometry;
  const originalMaterial = mesh.material;
  const materials = (Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]) as PaintMaterial[];
  // A vertex shared by different material groups cannot store two baked tints.
  const geometry = materials.length > 1 && originalGeometry.index
    ? originalGeometry.toNonIndexed() : originalGeometry.clone();
  const oldColors = geometry.getAttribute('color');
  const count = geometry.getAttribute('position').count;
  const channels = oldColors?.itemSize === 4 ? 4 : 3;
  const colors = new Float32BufferAttribute(count * channels, channels);
  const initialize = (vertex: number, material: PaintMaterial) => {
    const base = material.color!;
    const useExisting = material.vertexColors && oldColors;
    colors.setXYZ(vertex,
      base.r * (useExisting ? oldColors.getX(vertex) : 1),
      base.g * (useExisting ? oldColors.getY(vertex) : 1),
      base.b * (useExisting ? oldColors.getZ(vertex) : 1));
    if (channels === 4) colors.setW(vertex, useExisting ? oldColors.getW(vertex) : 1);
  };
  for (let i = 0; i < count; i++) initialize(i, materials[0]);
  for (const group of geometry.groups) {
    const material = materials[group.materialIndex ?? 0] ?? materials[0];
    const end = Math.min(group.start + group.count, geometry.index?.count ?? count);
    for (let i = group.start; i < end; i++) initialize(geometry.index?.getX(i) ?? i, material);
  }
  colors.setUsage(DynamicDrawUsage);
  geometry.setAttribute('color', colors);
  if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
  const paintedMaterials = materials.map((original) => {
    const material = original.clone() as PaintMaterial;
    material.color!.setRGB(1, 1, 1);
    material.vertexColors = true;
    if ('wireframe' in material) material.wireframe = originalWireframe(original);
    if (material.map) material.map = null;
    material.needsUpdate = true;
    return material;
  });
  // Retain original resources for eventual restore/history, and dispose them with
  // the asset. They are not children of the exported or rendered scene.
  const retained = new Group();
  retained.add(new Mesh(originalGeometry, originalMaterial));
  asset.resources.push(retained);
  mesh.geometry = geometry;
  asset.stats.vertices += count - originalGeometry.getAttribute('position').count;
  mesh.material = Array.isArray(originalMaterial) ? paintedMaterials : paintedMaterials[0];
  prepared.add(geometry);
  const painted = new Group();
  painted.add(new Mesh(geometry, mesh.material));
  asset.resources.push(painted);
  return { before: { geometry: originalGeometry, material: originalMaterial }, after: { geometry, material: mesh.material }, holders: [retained, painted] } satisfies Preparation;
}
