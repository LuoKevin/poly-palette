import { Mesh, Texture } from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import type { ModelAsset } from '../model/types';
import type { Preparation } from './prepareMesh';

export interface EditCommand {
  label: string;
  bytes: number;
  undo: () => void;
  redo: () => void;
  release: () => void;
}

function resources(roots: Object3D[]) {
  const geometries = new Set<BufferGeometry>(), materials = new Set<Material>(), textures = new Set<Texture>();
  for (const root of roots) root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof Texture) textures.add(value);
    }
  });
  return { geometries, materials, textures };
}

/** Release history-only resources, preserving anything still shared by the asset. */
export function releasePreparation(asset: ModelAsset, preparation: Preparation) {
  const removed = resources(preparation.holders);
  asset.resources = asset.resources.filter((root) => !preparation.holders.includes(root));
  const kept = resources(asset.resources);
  for (const geometry of removed.geometries) if (!kept.geometries.has(geometry)) { geometry.boundsTree = undefined; geometry.dispose(); }
  for (const material of removed.materials) if (!kept.materials.has(material)) material.dispose();
  for (const texture of removed.textures) if (!kept.textures.has(texture)) {
    texture.dispose();
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap && ![...kept.textures].some((other) => other.image === texture.image)) texture.image.close();
  }
}

function geometryBytes(geometry: BufferGeometry) {
  return Object.values(geometry.attributes).reduce((sum, attribute) => sum + attribute.array.byteLength, geometry.index?.array.byteLength ?? 0);
}

export function colorCommand(asset: ModelAsset, mesh: Mesh, label: string, indices: Uint32Array, before: Float32Array, after: Float32Array, preparation?: Preparation): EditCommand {
  const geometry = mesh.geometry;
  const colors = geometry.getAttribute('color');
  const apply = (values: Float32Array, forward: boolean) => {
    if (preparation) {
      const state = forward ? preparation.after : preparation.before;
      asset.stats.vertices += state.geometry.getAttribute('position').count - mesh.geometry.getAttribute('position').count;
      mesh.geometry = state.geometry;
      mesh.material = state.material;
    }
    for (let i = 0; i < indices.length; i++) colors.setXYZ(indices[i], values[i * 3], values[i * 3 + 1], values[i * 3 + 2]);
    colors.needsUpdate = true;
  };
  let bytes = indices.byteLength + before.byteLength + after.byteLength;
  if (preparation) {
    bytes += geometryBytes(preparation.before.geometry) + geometryBytes(preparation.after.geometry);
    for (const texture of resources(preparation.holders).textures) {
      const image = texture.image as { width?: number; height?: number } | undefined;
      bytes += (image?.width ?? 0) * (image?.height ?? 0) * 4 * 4 / 3;
    }
  }
  return { label, bytes, undo: () => apply(before, false), redo: () => apply(after, true), release: () => { if (preparation) releasePreparation(asset, preparation); } };
}

interface Entry { command: EditCommand; before: number; after: number }
export class EditHistory {
  private past: Entry[] = [];
  private future: Entry[] = [];
  private serial = 0;
  current = 0;
  bytes = 0;
  constructor(readonly budget = 64 * 1024 * 1024, readonly limit = 100) {}
  get undoLabel() { return this.past.at(-1)?.command.label; }
  get redoLabel() { return this.future.at(-1)?.command.label; }
  get count() { return this.past.length; }
  private discard(entries: Entry[]) { for (const entry of entries) { this.bytes -= entry.command.bytes; entry.command.release(); } }
  push(command: EditCommand) {
    this.discard(this.future.splice(0));
    const entry = { command, before: this.current, after: ++this.serial };
    this.current = entry.after;
    if (command.bytes > this.budget) {
      this.clear();
      command.release();
      return false;
    }
    this.past.push(entry);
    this.bytes += command.bytes;
    while (this.bytes > this.budget || this.past.length > this.limit) this.discard(this.past.splice(0, 1));
    return true;
  }
  undo() {
    const entry = this.past.pop();
    if (!entry) return;
    entry.command.undo(); this.current = entry.before; this.future.push(entry);
    return entry.command.label;
  }
  redo() {
    const entry = this.future.pop();
    if (!entry) return;
    entry.command.redo(); this.current = entry.after; this.past.push(entry);
    return entry.command.label;
  }
  clear() { this.discard([...this.past.splice(0), ...this.future.splice(0)]); }
}
