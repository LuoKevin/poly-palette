import { describe, expect, it, vi } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three';
import { disposeObjects, inspectModel } from './model';
import { createSample } from './sample';

describe('scene preparation and lifetime', () => {
  it('measures world bounds without rewriting source transforms', () => {
    const root = new Group();
    const mesh = new Mesh(new BoxGeometry(2, 4, 6));
    mesh.position.set(100, -5, 20);
    root.scale.setScalar(10);
    root.add(mesh);
    const { center, size, stats } = inspectModel(root);
    expect(center.toArray()).toEqual([1000, -50, 200]);
    expect(size.toArray()).toEqual([20, 40, 60]);
    expect(mesh.position.toArray()).toEqual([100, -5, 20]);
    expect(stats).toEqual({ meshes: 1, triangles: 12, vertices: 24, meshesWithUVs: 1 });
    disposeObjects([root]);
  });
  it('reports missing UVs without rejecting paintable geometry', () => {
    const root = new Group();
    const geometry = new BoxGeometry();
    geometry.deleteAttribute('uv');
    root.add(new Mesh(geometry));
    expect(inspectModel(root).stats.meshesWithUVs).toBe(0);
    disposeObjects([root]);
  });
  it('rejects an empty scene rather than fitting an invalid camera', () => {
    expect(() => inspectModel(new Group())).toThrow('triangle mesh');
  });
  it('releases shared geometry, materials, and textures once', () => {
    const root = new Group(), geometry = new BoxGeometry(), texture = new Texture();
    const material = new MeshStandardMaterial({ map: texture });
    root.add(new Mesh(geometry, material), new Mesh(geometry, material));
    const releaseGeometry = vi.spyOn(geometry, 'dispose');
    const releaseMaterial = vi.spyOn(material, 'dispose');
    const releaseTexture = vi.spyOn(texture, 'dispose');
    disposeObjects([root, root]);
    expect(releaseGeometry).toHaveBeenCalledTimes(1);
    expect(releaseMaterial).toHaveBeenCalledTimes(1);
    expect(releaseTexture).toHaveBeenCalledTimes(1);
  });
  it('builds a self-contained sample with meaningful mesh names', () => {
    const asset = createSample();
    expect(asset.source).toBe('sample');
    expect(asset.stats.meshes).toBe(12);
    expect(asset.root.getObjectByName('Body')).toBeDefined();
    expect(asset.size.length()).toBeGreaterThan(0);
    disposeObjects(asset.resources);
  });
});
