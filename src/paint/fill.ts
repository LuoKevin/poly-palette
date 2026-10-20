import { Color, Mesh } from 'three';
import type { ModelAsset } from '../model/types';
import type { BrushSettings, StrokeResult } from './brush';
import { colorCommand, releasePreparation } from './history';
import { paintBlocker, prepareMesh } from './prepareMesh';

export function modelMeshes(asset: ModelAsset): Mesh[] {
  const meshes: Mesh[] = [];
  asset.root.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
  return meshes;
}

/** Fill covers the entire selected mesh, including its hidden side. */
export function fillMesh(asset: ModelAsset, mesh: Mesh, brush: BrushSettings): StrokeResult {
  if (!modelMeshes(asset).includes(mesh)) throw new Error('Select a mesh in the current model.');
  const blocker = paintBlocker(mesh, brush.replaceTextures);
  if (blocker) throw new Error(blocker);
  const preparation = prepareMesh(asset, mesh, brush.replaceTextures);
  const colors = mesh.geometry.getAttribute('color');
  const tint = new Color(brush.color);
  const indices: number[] = [], before: number[] = [], after: number[] = [];
  for (let i = 0; i < colors.count; i++) {
    const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i);
    const next = [Math.fround(r + (tint.r - r) * brush.opacity), Math.fround(g + (tint.g - g) * brush.opacity), Math.fround(b + (tint.b - b) * brush.opacity)];
    if (next[0] === r && next[1] === g && next[2] === b) continue;
    indices.push(i); before.push(r, g, b); after.push(...next);
    colors.setXYZ(i, next[0], next[1], next[2]);
  }
  colors.needsUpdate = true;
  const name = mesh.name || 'mesh';
  const originals = preparation ? (Array.isArray(preparation.before.material) ? preparation.before.material : [preparation.before.material]) : [];
  const textureChanged = originals.some((material) => 'map' in material && !!material.map);
  if (!indices.length && !textureChanged && preparation) {
    asset.stats.vertices += preparation.before.geometry.getAttribute('position').count - mesh.geometry.getAttribute('position').count;
    mesh.geometry = preparation.before.geometry;
    mesh.material = preparation.before.material;
    releasePreparation(asset, preparation);
  }
  // Material preparation itself can change appearance (texture replacement).
  return { vertices: indices.length, mesh: name, meshId: mesh.userData.polyPaletteId,
    command: indices.length || textureChanged ? colorCommand(asset, mesh, `Fill ${name}`, new Uint32Array(indices), new Float32Array(before), new Float32Array(after), preparation) : undefined };
}
