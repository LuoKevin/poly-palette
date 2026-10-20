import type { Material } from 'three';
// Viewer-only overrides must never leak into prepared materials or project files.
export const wireframeOriginals = new WeakMap<Material, boolean>();
export function originalWireframe(material: Material & { wireframe?: boolean }) {
  return wireframeOriginals.get(material) ?? material.wireframe ?? false;
}
