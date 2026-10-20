import { describe, expect, it } from 'vitest';
import { BoxGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, SphereGeometry, Texture, Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import { makeAsset } from '../model/model';
import { PaintStroke, segmentDistance } from './brush';
import { paintBlocker, prepareMesh } from './prepareMesh';

const settings = { color: '#ff0000', size: 120, opacity: 0.5, replaceTextures: false };
function scene(geometry: BufferGeometry = new PlaneGeometry(2, 2, 20, 20)) {
  const root = new Group();
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: 'white' }));
  mesh.name = 'Canvas';
  root.add(mesh);
  const asset = makeAsset(root, 'test', 'sample');
  const camera = new PerspectiveCamera(45, 1, 0.01, 100);
  camera.position.z = 4;
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  return { asset, mesh, camera };
}
function atCenter(mesh: Mesh) {
  const p = mesh.geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 1e-6 && Math.abs(p.getY(i)) < 1e-6) return i;
  throw new Error('No center vertex');
}

describe('vertex brush', () => {
  it('blends linear RGB once per stroke, independently of pointer event frequency', () => {
    const { asset, mesh, camera } = scene();
    const stroke = new PaintStroke(asset, camera, 500, 500, settings, { x: 250, y: 250 });
    for (let i = 0; i < 40; i++) stroke.move({ x: 250, y: 250 });
    const colors = mesh.geometry.getAttribute('color'), center = atCenter(mesh);
    expect([colors.getX(center), colors.getY(center), colors.getZ(center)]).toEqual([1, 0.5, 0.5]);
    expect(stroke.finish().vertices).toBeGreaterThan(10);
    new PaintStroke(asset, camera, 500, 500, settings, { x: 250, y: 250 });
    expect(colors.getY(center)).toBeCloseTo(0.25);
  });
  it('covers fast pointer segments without gaps', () => {
    const { asset, mesh, camera } = scene();
    const stroke = new PaintStroke(asset, camera, 500, 500, { ...settings, size: 20 }, { x: 180, y: 250 });
    stroke.move({ x: 320, y: 250 });
    expect(mesh.geometry.getAttribute('color').getY(atCenter(mesh))).toBeCloseTo(0.5);
    expect(segmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });
  it('does not paint vertices hidden behind another mesh, even a very close one', () => {
    const { asset, mesh, camera } = scene();
    const cover = new Mesh(new PlaneGeometry(0.3, 0.3), new MeshStandardMaterial());
    cover.position.z = 0.001;
    asset.root.add(cover);
    // Begin beside the cover, then sweep across it. The stroke remains on Canvas.
    const stroke = new PaintStroke(asset, camera, 500, 500, settings, { x: 190, y: 250 });
    stroke.move({ x: 250, y: 250 });
    expect(mesh.geometry.getAttribute('color').getY(atCenter(mesh))).toBe(1);
    expect(cover.geometry.hasAttribute('color')).toBe(false);
    expect(stroke.finish().vertices).toBeGreaterThan(0);
  });
  it('does not paint through a closed surface onto its back', () => {
    const { asset, mesh, camera } = scene(new SphereGeometry(1, 32, 24));
    new PaintStroke(asset, camera, 500, 500, { ...settings, size: 200 }, { x: 250, y: 250 });
    const colors = mesh.geometry.getAttribute('color'), positions = mesh.geometry.getAttribute('position');
    let changedFront = 0;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getZ(i) < -0.1) expect(colors.getY(i)).toBe(1);
      if (colors.getY(i) < 1) changedFront++;
    }
    expect(changedFront).toBeGreaterThan(20);
  });
  it('uses world transforms, including a scaled presentation wrapper', () => {
    const { asset, mesh, camera } = scene();
    mesh.position.x = 3;
    const wrapper = new Group();
    wrapper.scale.set(0.7, 1.3, 1);
    wrapper.position.x = -2.1;
    wrapper.add(asset.root);
    wrapper.updateMatrixWorld(true);
    const center = new Vector3().setFromMatrixPosition(mesh.matrixWorld).project(camera);
    new PaintStroke(asset, camera, 500, 500, settings, { x: (center.x + 1) * 250, y: (1 - center.y) * 250 });
    expect(mesh.geometry.getAttribute('color').getY(atCenter(mesh))).toBeCloseTo(0.5);
  });
  it('paints UV-less meshes and interprets picked sRGB colors in linear space', () => {
    const { asset, mesh, camera } = scene();
    mesh.geometry.deleteAttribute('uv');
    new PaintStroke(asset, camera, 500, 500, { ...settings, color: '#808080', opacity: 1 }, { x: 250, y: 250 });
    expect(mesh.geometry.getAttribute('color').getX(atCenter(mesh))).toBeCloseTo(new Color('#808080').r);
  });
  it('does not prepare or modify anything when a stroke misses the model', () => {
    const { asset, mesh, camera } = scene();
    expect(() => new PaintStroke(asset, camera, 500, 500, settings, { x: 0, y: 0 })).toThrow('Start a stroke');
    expect(mesh.geometry.hasAttribute('color')).toBe(false);
  });
});

describe('preparing editable geometry', () => {
  it('copies shared resources and bakes base tint into existing vertex colors', () => {
    const { asset, mesh } = scene();
    const colors = new Float32BufferAttribute(mesh.geometry.getAttribute('position').count * 3, 3);
    colors.array.fill(0.5);
    mesh.geometry.setAttribute('color', colors);
    const originalMaterial = mesh.material as MeshStandardMaterial;
    originalMaterial.vertexColors = true;
    originalMaterial.color.setRGB(0.4, 0.6, 0.8);
    const sibling = new Mesh(mesh.geometry, originalMaterial);
    asset.root.add(sibling);
    prepareMesh(asset, mesh, false);
    expect(mesh.geometry).not.toBe(sibling.geometry);
    expect(mesh.material).not.toBe(sibling.material);
    expect(mesh.geometry.getAttribute('color').getX(0)).toBeCloseTo(0.2);
    expect((mesh.material as MeshStandardMaterial).color.toArray()).toEqual([1, 1, 1]);
    expect(sibling.geometry.getAttribute('color').getX(0)).toBe(0.5);
    expect(originalMaterial.color.toArray()).toEqual([0.4, 0.6, 0.8]);
  });
  it('requires explicit texture replacement and retains the original resources', () => {
    const { asset, mesh } = scene();
    const original = mesh.material as MeshStandardMaterial;
    original.map = new Texture();
    expect(paintBlocker(mesh, false)).toContain('base-color texture');
    expect(() => prepareMesh(asset, mesh, false)).toThrow();
    prepareMesh(asset, mesh, true);
    expect((mesh.material as MeshStandardMaterial).map).toBeNull();
    expect(original.map).not.toBeNull();
    expect(asset.resources).toHaveLength(3);
    original.transparent = true;
    const transparent = new Mesh(new PlaneGeometry(), original);
    expect(paintBlocker(transparent, true)).toContain('opaque');
  });
  it('bakes each material group without merging distinct colors at shared vertices', () => {
    const root = new Group();
    const materials = Array.from({ length: 6 }, (_, i) => new MeshStandardMaterial({ color: i % 2 ? 'blue' : 'red' }));
    const mesh = new Mesh(new BoxGeometry(), materials);
    root.add(mesh);
    prepareMesh(makeAsset(root, 'groups', 'sample'), mesh, false);
    const colors = mesh.geometry.getAttribute('color');
    for (const group of mesh.geometry.groups) {
      const expected = materials[group.materialIndex!].color;
      expect([colors.getX(group.start), colors.getY(group.start), colors.getZ(group.start)]).toEqual(expected.toArray());
    }
  });
});
