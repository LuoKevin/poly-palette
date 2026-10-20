import { describe, expect, it } from 'vitest';
import { BoxGeometry, DataTexture, Group, Mesh, MeshStandardMaterial } from 'three';
import { makeAsset } from '../model/model';
import { fillMesh } from '../paint/fill';
import { EditHistory } from '../paint/history';
import { importProject, serializeProject, MAX_PROJECT_BYTES } from './project';
import type { EditorState } from './project';

const editor: EditorState = { brush: { color: '#00ff00', size: 94, opacity: 0.65, replaceTextures: false }, mode: 'select', navigation: 'pan', background: '#353d4b', grid: false, wireframe: true, selectedId: null, camera: { position: [3, 2, 7], target: [0.2, -0.1, 0] } };
async function fixture() {
  const root = new Group(); root.position.set(3, 4, 5);
  const mesh = new Mesh(new BoxGeometry(), Array.from({ length: 6 }, (_, i) => new MeshStandardMaterial({ color: i % 2 ? 'red' : 'blue' })));
  mesh.name = 'Name with spaces'; mesh.rotation.y = 0.3; root.add(mesh);
  const asset = makeAsset(root, 'Project model', 'sample');
  const wrapper = new Group(); wrapper.name = 'EDITOR ONLY'; wrapper.scale.setScalar(0.1); wrapper.add(root);
  const history = new EditHistory();
  history.push(fillMesh(asset, mesh, editor.brush).command!);
  history.undo(); history.redo();
  const state = { ...editor, selectedId: mesh.userData.polyPaletteId };
  const blob = await serializeProject(asset, state);
  return { mesh, asset, state, blob, data: JSON.parse(await blob.text()) };
}
const projectFile = (data: unknown) => new File([JSON.stringify(data)], 'test.polypalette');

describe('editable project files', () => {
  it('round trips exact colors, material groups, stable IDs, names, transforms and editor state; remains editable', async () => {
    const { mesh, state, blob } = await fixture();
    const loaded = await importProject(new File([blob], 'roundtrip.polypalette'));
    const restored = loaded.root.getObjectByName(mesh.name) as Mesh;
    expect(loaded.editor).toEqual(state); expect(restored.userData.polyPaletteId).toBe(state.selectedId);
    expect(loaded.stats.meshes).toBe(1); expect(Array.isArray(restored.material) && restored.material.length).toBe(6);
    expect(restored.geometry.groups).toEqual(mesh.geometry.groups);
    expect(Array.from(restored.geometry.getAttribute('color').array)).toEqual(Array.from(mesh.geometry.getAttribute('color').array));
    expect(restored.quaternion.angleTo(mesh.quaternion)).toBeLessThan(1e-7); expect(loaded.root.position.toArray()).toEqual([3, 4, 5]);
    expect(loaded.root.getObjectByName('EDITOR ONLY')).toBeUndefined();
    const history = new EditHistory();
    history.push(fillMesh(loaded, restored, { ...editor.brush, color: '#ff00ff' }).command!);
    expect(Array.from(restored.geometry.getAttribute('color').array)).not.toEqual(Array.from(mesh.geometry.getAttribute('color').array));
    history.undo(); expect(Array.from(restored.geometry.getAttribute('color').array)).toEqual(Array.from(mesh.geometry.getAttribute('color').array));
  });
  it('retains embedded texture pixels and restores them after undoing a replacement fill', async () => {
    const root = new Group();
    const texture = new DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: texture })); root.add(mesh);
    const asset = makeAsset(root, 'texture', 'sample');
    const blob = await serializeProject(asset, editor);
    const loaded = await importProject(new File([blob], 'texture.polypalette'));
    const restored = loaded.root.children[0] as Mesh<BoxGeometry, MeshStandardMaterial>;
    expect(Array.from((restored.material.map as DataTexture).image.data!)).toEqual([255, 0, 0, 255]);
    const history = new EditHistory();
    history.push(fillMesh(loaded, restored, { ...editor.brush, replaceTextures: true }).command!);
    expect(restored.material.map).toBeNull();
    history.undo(); expect(Array.from((restored.material.map as DataTexture).image.data!)).toEqual([255, 0, 0, 255]);
  });
  it('rejects external images before calling the loader', async () => {
    const { data } = await fixture();
    for (const url of ['https://example.com/private.png', 'file:///tmp/a.png', 'blob:any', 'data:text/html;base64,AA==']) {
      data.scene.images = [{ uuid: 'image', url }];
      await expect(importProject(projectFile(data))).rejects.toThrow('External model resources');
    }
  });
  it('rejects malformed, unsupported-version, missing-selection and invalid-settings files', async () => {
    const { data } = await fixture();
    await expect(importProject(new File(['broken'], 'bad.polypalette'))).rejects.toThrow('valid JSON');
    await expect(importProject(projectFile({ ...data, version: 2 }))).rejects.toThrow('Unsupported');
    await expect(importProject(projectFile({ ...data, editor: { ...data.editor, selectedId: 'missing' } }))).rejects.toThrow('missing mesh');
    for (const invalid of [ { ...editor, brush: { ...editor.brush, opacity: 2 } }, { ...editor, camera: { position: [0, 0, 0], target: [0, 0, 0] } }, { ...editor, grid: 'yes' } ]) {
      await expect(importProject(projectFile({ ...data, editor: invalid }))).rejects.toThrow('invalid');
    }
    await expect(importProject({ size: MAX_PROJECT_BYTES + 1 } as File)).rejects.toThrow('100 MB');
  });
});
