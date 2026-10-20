import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { ModelAsset } from './types';

export async function exportGlb(asset: ModelAsset): Promise<ArrayBuffer> {
  // Cloning detaches the asset from its presentation wrapper. Local transforms,
  // material groups and COLOR_0 survive; editor lights/grid/camera are excluded.
  const root = asset.root.clone(true);
  root.updateMatrixWorld(true);
  const result = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true });
  if (!(result instanceof ArrayBuffer)) throw new Error('The exporter did not produce a binary GLB.');
  return result;
}

export function downloadGlb(buffer: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-') || 'model'}-painted.glb`;
  link.click();
  // Let the browser begin reading the Blob before releasing the URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
