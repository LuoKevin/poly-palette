import { BufferGeometry, LoadingManager, Mesh, ObjectLoader, Vector3 } from 'three';
import type { Group, Material } from 'three';
import { disposeObjects, makeAsset } from '../model/model';
import type { ModelAsset } from '../model/types';
import { originalWireframe } from '../model/display';
import type { BrushSettings } from '../paint/brush';

export interface CameraState { position: [number, number, number]; target: [number, number, number] }
export interface EditorState {
  brush: BrushSettings;
  mode: 'navigate' | 'paint' | 'select';
  navigation: 'orbit' | 'pan';
  background: string;
  grid: boolean;
  wireframe: boolean;
  selectedId: string | null;
  camera: CameraState;
}
export const MAX_PROJECT_BYTES = 100 * 1024 * 1024;
const colorPattern = /^#[0-9a-f]{6}$/i;
function record(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value); }
const vector = (value: unknown): value is [number, number, number] => Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e6);

export function validateEditor(value: unknown): asserts value is EditorState {
  if (!record(value) || !record(value.brush) || !record(value.camera)) throw new Error('Project editor settings are missing.');
  const b = value.brush, c = value.camera;
  if (typeof b.color !== 'string' || !colorPattern.test(b.color) || !Number.isFinite(b.size) || b.size < 8 || b.size > 240 || !Number.isFinite(b.opacity) || b.opacity < 0.05 || b.opacity > 1 || typeof b.replaceTextures !== 'boolean'
    || !['navigate', 'paint', 'select'].includes(value.mode) || !['orbit', 'pan'].includes(value.navigation) || typeof value.background !== 'string' || !colorPattern.test(value.background)
    || typeof value.grid !== 'boolean' || typeof value.wireframe !== 'boolean' || !(value.selectedId === null || typeof value.selectedId === 'string')
    || !vector(c.position) || !vector(c.target) || new Vector3(...c.position).distanceTo(new Vector3(...c.target)) < 0.001) {
    throw new Error('Project contains invalid brush, camera, or viewport settings.');
  }
}

export async function serializeProject(asset: ModelAsset, editor: EditorState): Promise<Blob> {
  validateEditor(editor);
  // Three's native scene format retains multi-material meshes, names, shared
  // resources and stable IDs without the primitive splitting of a GLB round trip.
  const root = asset.root.clone(true);
  const geometries = new Map<BufferGeometry, BufferGeometry>();
  const materials = new Map<Material, Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const original = object.geometry;
    if (!geometries.has(original)) geometries.set(original, new BufferGeometry().copy(original));
    object.geometry = geometries.get(original)!;
    const cloneMaterial = (material: Material) => {
      if (!materials.has(material)) {
        const copy = material.clone();
        if ('wireframe' in copy) copy.wireframe = originalWireframe(material);
        materials.set(material, copy);
      }
      return materials.get(material)!;
    };
    object.material = Array.isArray(object.material) ? object.material.map(cloneMaterial) : cloneMaterial(object.material);
  });
  const scene = root.toJSON();
  const blob = new Blob([JSON.stringify({ format: 'PolyPalette', version: 1, name: asset.name, scene, editor })], { type: 'application/json' });
  if (blob.size > MAX_PROJECT_BYTES) throw new Error('This project exceeds the 100 MB project limit. Export GLB to keep the model.');
  return blob;
}

export async function importProject(file: File): Promise<ModelAsset> {
  if (file.size > MAX_PROJECT_BYTES) throw new Error('This project is larger than 100 MB.');
  let data: unknown;
  try { data = JSON.parse(await file.text()); } catch { throw new Error('This project is not valid JSON.'); }
  if (!record(data) || data.format !== 'PolyPalette') throw new Error('Choose a PolyPalette project file.');
  if (data.version !== 1) throw new Error(`Unsupported PolyPalette project version: ${String(data.version)}.`);
  validateEditor(data.editor);
  if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 500 || !record(data.scene) || !record(data.scene.object)) throw new Error('Project model data is missing.');
  const scene = data.scene;
  // No parametric constructors from untrusted JSON; saved projects contain only
  // explicit buffer geometry. Embedded images are the only permitted resources.
  if (!Array.isArray(scene.geometries) || scene.geometries.some((g: unknown) => !record(g) || g.type !== 'BufferGeometry')) throw new Error('Project contains unsupported geometry.');
  const localImage = (url: unknown) => typeof url === 'string' ? /^data:image\/(png|jpeg|webp);base64,/i.test(url) : record(url) && Array.isArray(url.data) && Number.isInteger(url.width) && url.width > 0 && Number.isInteger(url.height) && url.height > 0;
  if (scene.images !== undefined && (!Array.isArray(scene.images) || scene.images.some((image: unknown) => !record(image) || !(Array.isArray(image.url) ? image.url.every(localImage) : localImage(image.url))))) throw new Error('Project images must be embedded. External model resources are disabled.');
  const manager = new LoadingManager();
  manager.setURLModifier((url) => {
    if (/^data:image\/(png|jpeg|webp);base64,/i.test(url)) return url;
    throw new Error('External project resources are disabled.');
  });
  const root = await new ObjectLoader(manager).parseAsync(scene);
  try {
    const asset = makeAsset(root as Group, data.name, 'project', [root], file.size);
    const ids = new Set<string>();
    root.traverse((object) => { if (object instanceof Mesh) ids.add(object.userData.polyPaletteId); });
    if (data.editor.selectedId !== null && !ids.has(data.editor.selectedId)) throw new Error('Project selection references a missing mesh.');
    asset.editor = data.editor;
    return asset;
  } catch (error) { disposeObjects([root]); throw error; }
}

export function downloadProject(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-') || 'model'}.polypalette`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
