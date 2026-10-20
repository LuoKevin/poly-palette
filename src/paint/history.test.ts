import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Texture } from 'three';
import { makeAsset } from '../model/model';
import { PaintStroke } from './brush';
import { fillMesh } from './fill';
import { EditHistory } from './history';

const brush = { color: '#ff0000', size: 120, opacity: 0.5, replaceTextures: false };
function fixture() {
  const root = new Group();
  const mesh = new Mesh(new PlaneGeometry(2, 2, 20, 20), new MeshStandardMaterial({ color: 'white' }));
  mesh.name = 'Body';
  const sibling = new Mesh(mesh.geometry, mesh.material); sibling.position.x = 4;
  root.add(mesh, sibling);
  const asset = makeAsset(root, 'history', 'sample');
  const camera = new PerspectiveCamera(45, 1, 0.01, 100); camera.position.z = 4; camera.updateMatrixWorld(true);
  return { mesh, sibling, asset, camera, history: new EditHistory() };
}
const colors = (mesh: Mesh) => Array.from(mesh.geometry.getAttribute('color').array);

describe('edit history', () => {
  it('undoes a complete multi-event stroke and fill in order, without modifying shared siblings', () => {
    const { mesh, sibling, asset, camera, history } = fixture();
    const original = mesh.geometry, material = mesh.material;
    const stroke = new PaintStroke(asset, camera, 500, 500, brush, { x: 220, y: 250 });
    for (let x = 230; x <= 300; x += 10) stroke.move({ x, y: 250 });
    const result = stroke.finish();
    expect(stroke.finish()).toBe(result);
    history.push(result.command!);
    const painted = colors(mesh);
    history.push(fillMesh(asset, mesh, { ...brush, color: '#00ff00' }).command!);
    const filled = colors(mesh);
    expect(history.count).toBe(2);
    expect(sibling.geometry).toBe(original); expect(sibling.material).toBe(material);
    history.undo(); expect(colors(mesh)).toEqual(painted);
    history.undo(); expect(mesh.geometry).toBe(original); expect(mesh.material).toBe(material); expect(history.current).toBe(0);
    history.redo(); expect(colors(mesh)).toEqual(painted);
    history.redo(); expect(colors(mesh)).toEqual(filled);
  });
  it('restores textures on undo, re-prepares safely after a branch, and preserves shared textures', () => {
    const { mesh, sibling, asset, history } = fixture();
    const material = mesh.material; material.map = new Texture();
    const dispose = vi.spyOn(material.map, 'dispose');
    history.push(fillMesh(asset, mesh, { ...brush, replaceTextures: true }).command!);
    const abandoned = mesh.geometry;
    const geometryDispose = vi.spyOn(abandoned, 'dispose');
    history.undo(); expect(mesh.material).toBe(material); expect(mesh.material.map).toBeTruthy();
    expect(() => fillMesh(asset, mesh, brush)).toThrow('base-color texture');
    history.push(fillMesh(asset, mesh, { ...brush, color: '#0000ff', replaceTextures: true }).command!);
    expect(history.redoLabel).toBeUndefined(); expect(geometryDispose).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled(); expect(sibling.material.map).toBe(material.map);
    expect(mesh.geometry).not.toBe(abandoned);
    history.undo(); expect(mesh.material).toBe(material);
  });
  it('restores indexed multi-material geometry and statistics after first fill', () => {
    const root = new Group();
    const original = new BoxGeometry();
    const materials = Array.from({ length: 6 }, (_, i) => new MeshStandardMaterial({ color: i % 2 ? 'blue' : 'red' }));
    const mesh = new Mesh(original, materials); root.add(mesh);
    const asset = makeAsset(root, 'groups', 'sample'), history = new EditHistory();
    history.push(fillMesh(asset, mesh, brush).command!);
    expect(asset.stats.vertices).toBe(36);
    history.undo(); expect(mesh.geometry).toBe(original); expect(mesh.material).toBe(materials); expect(asset.stats.vertices).toBe(24);
    history.redo(); expect(asset.stats.vertices).toBe(36);
  });
  it('does not strip a texture or retain history resources when a tiny brush misses every vertex', () => {
    const { mesh, asset, camera } = fixture();
    mesh.geometry = new PlaneGeometry(2, 2); mesh.material.map = new Texture();
    const original = mesh.geometry, material = mesh.material;
    const result = new PaintStroke(asset, camera, 500, 500, { ...brush, size: 8, replaceTextures: true }, { x: 250, y: 250 }).finish();
    expect(result.command).toBeUndefined(); expect(mesh.geometry).toBe(original); expect(mesh.material).toBe(material);
    expect(asset.resources).toHaveLength(1);
  });
  it('records texture replacement even when RGB matches, but skips an unchanged untextured fill', () => {
    const { mesh, asset, camera, history } = fixture();
    const same = { ...brush, color: '#ffffff', opacity: 1 };
    expect(fillMesh(asset, mesh, same).command).toBeUndefined();
    const original = mesh.material;
    original.map = new Texture();
    const stroke = new PaintStroke(asset, camera, 500, 500, { ...same, replaceTextures: true }, { x: 250, y: 250 });
    const result = stroke.finish();
    expect(result.vertices).toBe(0); expect(result.command).toBeDefined();
    history.push(result.command!); expect(mesh.material.map).toBeNull();
    history.undo(); expect(mesh.material).toBe(original); expect(mesh.material.map).toBeTruthy();
  });
  it('enforces the history memory budget and never permits undo across a non-undoable edit', () => {
    const history = new EditHistory(10);
    let value = 0;
    const edit = (next: number, bytes = 4) => {
      const previous = value; value = next;
      return { label: `set ${next}`, bytes, undo: () => { value = previous; }, redo: () => { value = next; }, release: vi.fn() };
    };
    const first = edit(1); history.push(first); history.push(edit(2)); history.push(edit(3));
    expect(first.release).toHaveBeenCalledOnce(); expect(history.bytes).toBe(8);
    history.undo(); history.undo(); history.undo(); expect(value).toBe(1);
    history.redo(); history.redo();
    expect(history.push(edit(4, 20))).toBe(false); expect(history.bytes).toBe(0);
    history.undo(); expect(value).toBe(4);
  });
});
