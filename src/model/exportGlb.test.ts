import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { exportGlb } from './exportGlb';
import { makeAsset } from './model';
import { PaintStroke } from '../paint/brush';
import { validateGlb } from './importGlb';

// Only FileReader is browser-specific here. Exercise the real exporter/loader,
// not a mocked color serializer. Browser download/import is verified separately.
class TestFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.(); }); }
  readAsDataURL(blob: Blob) { void blob.arrayBuffer().then((buffer) => { this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`; this.onloadend?.(); }); }
}
beforeAll(() => vi.stubGlobal('FileReader', TestFileReader));
afterAll(() => vi.unstubAllGlobals());

describe('paint → binary GLB → reopened model', () => {
  it('retains every color component and local transform, excluding editor objects', async () => {
    const root = new Group();
    root.name = 'Asset';
    root.position.x = 7;
    const geometry = new PlaneGeometry(2, 2, 20, 20);
    geometry.deleteAttribute('uv');
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: '#c8ddf0' }));
    mesh.name = 'Painted surface';
    mesh.position.set(2, 1, 0);
    root.add(mesh);
    const asset = makeAsset(root, 'test', 'sample');
    const wrapper = new Group();
    wrapper.name = 'EDITOR ONLY';
    wrapper.position.set(-9, -1, 0);
    wrapper.add(root, new Mesh(new PlaneGeometry(100, 100)));
    const camera = new PerspectiveCamera(45, 1, 0.01, 100);
    camera.position.z = 4;
    camera.updateMatrixWorld(true);
    const stroke = new PaintStroke(asset, camera, 500, 500, { color: '#d445a8', size: 120, opacity: 0.65, replaceTextures: false }, { x: 220, y: 250 });
    stroke.move({ x: 300, y: 250 });
    expect(stroke.finish().vertices).toBeGreaterThan(20);
    const before = Array.from(mesh.geometry.getAttribute('color').array);
    expect(new Set(before).size).toBeGreaterThan(6);
    const buffer = await exportGlb(asset);
    validateGlb(buffer);
    const reopened = await new GLTFLoader().parseAsync(buffer, '');
    const restored = reopened.scene.getObjectByName('Painted_surface') ?? reopened.scene.getObjectByName('Painted surface');
    expect(restored).toBeInstanceOf(Mesh);
    const restoredMesh = restored as Mesh;
    expect(Array.from(restoredMesh.geometry.getAttribute('color').array)).toEqual(before);
    expect((restoredMesh.material as MeshStandardMaterial).vertexColors).toBe(true);
    expect((restoredMesh.material as MeshStandardMaterial).color.toArray()).toEqual([1, 1, 1]);
    expect(restoredMesh.position.toArray()).toEqual([2, 1, 0]);
    expect(reopened.scene.getObjectByName('Asset')!.position.x).toBe(7);
    expect(reopened.scene.getObjectByName('EDITOR ONLY')).toBeUndefined();
    let meshes = 0;
    reopened.scene.traverse((object) => { if (object instanceof Mesh) meshes++; });
    expect(meshes).toBe(1);
    // Reopening is still editable, not merely a screenshot of the painting.
    const reopenedAsset = makeAsset(reopened.scene, 'reopened', 'file');
    const newWrapper = new Group();
    newWrapper.position.set(-9, -1, 0);
    newWrapper.add(reopened.scene);
    const next = new PaintStroke(reopenedAsset, camera, 500, 500, { color: '#00ff00', size: 50, opacity: 1, replaceTextures: false }, { x: 250, y: 250 });
    expect(next.finish().vertices).toBeGreaterThan(0);
    expect(Array.from(restoredMesh.geometry.getAttribute('color').array)).not.toEqual(before);
  });
});
