import { LoadingManager } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { disposeObjects, makeAsset } from './model';

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const unsupported = new Map([
  ['KHR_draco_mesh_compression', 'Draco geometry'],
  ['EXT_meshopt_compression', 'Meshopt geometry'],
  ['KHR_texture_basisu', 'KTX2 textures'],
]);

// Inspect the container before handing it to a loader. A .glb can still reference
// external URLs; refusing those keeps model processing entirely local.
export function validateGlb(buffer: ArrayBuffer): void {
  if (buffer.byteLength < 20) throw new Error('This file is too short to be a GLB model.');
  const view = new DataView(buffer);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error('Choose a binary glTF 2.0 (.glb) file. OBJ, STL, and .gltf bundles are coming later.');
  }
  if (view.getUint32(8, true) !== buffer.byteLength) throw new Error('This GLB appears incomplete: its declared length does not match the file.');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || jsonLength > buffer.byteLength - 20) {
    throw new Error('The GLB does not contain a valid scene description.');
  }
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, jsonLength)));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    data = parsed as Record<string, unknown>;
  } catch { throw new Error('The GLB scene description is not valid JSON.'); }
  for (const key of ['buffers', 'images']) {
    const entries = data[key];
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) if (entry && typeof entry.uri === 'string' && !entry.uri.startsWith('data:')) {
      throw new Error('This GLB references external files. Export it with embedded textures and buffers, then try again.');
    }
  }
  const extensions = new Set<string>([
    ...(Array.isArray(data.extensionsUsed) ? data.extensionsUsed : []),
    ...(Array.isArray(data.extensionsRequired) ? data.extensionsRequired : []),
  ]);
  for (const [extension, label] of unsupported) if (extensions.has(extension)) {
    throw new Error(`${label} are not supported in this milestone. Export an uncompressed GLB with embedded PNG or JPEG textures.`);
  }
}

export async function importGlb(file: File) {
  if (!file.name.toLowerCase().endsWith('.glb')) throw new Error('Choose a .glb file. More import formats will be added in later milestones.');
  if (file.size > MAX_FILE_BYTES) throw new Error('This file is larger than 50 MB. Try a smaller or simplified model.');
  const buffer = await file.arrayBuffer();
  validateGlb(buffer);
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    throw new Error('External model resources are disabled. Use a self-contained GLB.');
  });
  const gltf = await new GLTFLoader(manager).parseAsync(buffer, '');
  try {
    return makeAsset(gltf.scene, file.name.replace(/\.glb$/i, ''), 'file', gltf.scenes, file.size);
  } catch (error) {
    disposeObjects(gltf.scenes);
    throw error;
  }
}
