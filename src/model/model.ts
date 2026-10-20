import { Box3, Group, Material, Mesh, Texture, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { ModelAsset, ModelStats } from './types';

export const MAX_TRIANGLES = 2_000_000;

export function inspectModel(root: Group) {
  const stats: ModelStats = { meshes: 0, vertices: 0, triangles: 0, meshesWithUVs: 0 };
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    if ('isSkinnedMesh' in object || 'isInstancedMesh' in object || object.morphTargetInfluences?.length) {
      throw new Error('This first version opens static meshes. Skinned, instanced, and morph-target models are not supported yet.');
    }
    const position = object.geometry.getAttribute('position');
    if (!position) return;
    stats.meshes++;
    stats.vertices += position.count;
    stats.triangles += (object.geometry.index?.count ?? position.count) / 3;
    if (object.geometry.hasAttribute('uv')) stats.meshesWithUVs++;
  });
  if (!stats.meshes) throw new Error('This file does not contain a triangle mesh to display.');
  if (stats.triangles > MAX_TRIANGLES) throw new Error('This model exceeds the first version’s limit of 2 million triangles. Try a simplified copy.');

  const bounds = new Box3().setFromObject(root);
  const size = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  if (bounds.isEmpty() || ![...size.toArray(), ...center.toArray()].every(Number.isFinite) || size.length() <= 0) {
    throw new Error('The model has empty, non-finite, or zero-size geometry.');
  }
  return { stats, bounds, size, center };
}

export function makeAsset(root: Group, name: string, source: ModelAsset['source'], resources: Object3D[] = [root], bytes?: number): ModelAsset {
  const ids = new Set<string>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    let id = object.userData.polyPaletteId;
    if (typeof id !== 'string' || !id || ids.has(id)) id = crypto.randomUUID();
    object.userData.polyPaletteId = id;
    ids.add(id);
  });
  return { id: crypto.randomUUID(), name, source, root, resources, bytes, ...inspectModel(root) };
}

// Three.js GPU allocations have an explicit lifetime, separate from JavaScript GC.
// Deduplicate shared resources: glTF meshes commonly reuse materials and textures.
export function disposeObjects(roots: Object3D[]) {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const images = new Set<ImageBitmap>();
  for (const root of roots) root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) {
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image);
    texture.dispose();
  }
  for (const image of images) image.close();
}
