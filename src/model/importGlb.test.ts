import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateGlb } from './importGlb';

function container(description: object) {
  const json = new TextEncoder().encode(JSON.stringify(description));
  const length = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(20 + length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20); bytes.set(json, 20);
  return bytes.buffer;
}

describe('local GLB import boundary', () => {
  it('accepts the bundled, real binary cube fixture', () => {
    const bytes = readFileSync(new URL('../../public/examples/color-cube.glb', import.meta.url));
    expect(() => validateGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))).not.toThrow();
  });
  it('accepts embedded buffers and embedded image data', () => {
    expect(() => validateGlb(container({ asset: { version: '2.0' }, buffers: [{ byteLength: 8 }], images: [{ uri: 'data:image/png;base64,AAAA' }] }))).not.toThrow();
  });
  it.each(['https://example.com/model.bin', '//example.com/texture.png', './textures/local.png'])('rejects external resources: %s', (uri) => {
    expect(() => validateGlb(container({ buffers: [{ uri }] }))).toThrow('external files');
    expect(() => validateGlb(container({ images: [{ uri }] }))).toThrow('external files');
  });
  it('rejects truncated files before invoking the loader', () => {
    const buffer = container({ asset: { version: '2.0' } });
    expect(() => validateGlb(buffer.slice(0, -4))).toThrow('incomplete');
    expect(() => validateGlb(new ArrayBuffer(6))).toThrow('too short');
  });
  it.each(['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'])('gives a useful decoder limitation for %s', (extension) => {
    expect(() => validateGlb(container({ extensionsUsed: [extension] }))).toThrow('uncompressed GLB');
  });
  it('rejects a JSON-only glTF file renamed to GLB', () => {
    expect(() => validateGlb(new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' }, scenes: [] })).buffer)).toThrow('binary glTF');
  });
});
