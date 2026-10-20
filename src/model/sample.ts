import { CapsuleGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, TorusGeometry } from 'three';
import type { BufferGeometry } from 'three';
import { makeAsset } from './model';

// A deliberately multi-mesh sample. Each named part can become a fill target later.
// Built from local geometry; no model, font, HDR, or texture downloads are needed.
export function createSample() {
  const root = new Group();
  root.name = 'Orbit buddy';
  const materials = {
    lavender: new MeshStandardMaterial({ color: '#b5a0ee', roughness: 0.5 }),
    peach: new MeshStandardMaterial({ color: '#ffd4b4', roughness: 0.6 }),
    green: new MeshStandardMaterial({ color: '#9bbd9a', roughness: 0.55 }),
    dark: new MeshStandardMaterial({ color: '#393345', roughness: 0.4 }),
    orange: new MeshStandardMaterial({ color: '#f6a35d', roughness: 0.45 }),
    cream: new MeshStandardMaterial({ color: '#fff4df', roughness: 0.6 }),
  };
  function part(name: string, geometry: BufferGeometry, material: keyof typeof materials, position: [number, number, number], scale: [number, number, number] = [1, 1, 1]) {
    const mesh = new Mesh(geometry, materials[material]);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  }
  // Uniformly spaced paint samples along the body, including its straight sides.
  part('Body', new CapsuleGeometry(0.62, 0.6, 24, 64, 16), 'lavender', [0, 0.1, 0]);
  part('Face', new SphereGeometry(0.67, 64, 48), 'peach', [0, 0.95, 0.08], [1.05, 0.92, 0.88]);
  part('Left eye', new SphereGeometry(0.066, 20, 16), 'dark', [-0.22, 1.04, 0.62]);
  part('Right eye', new SphereGeometry(0.066, 20, 16), 'dark', [0.22, 1.04, 0.62]);
  const smile = part('Smile', new TorusGeometry(0.12, 0.027, 10, 24, Math.PI), 'dark', [0, 0.88, 0.66]);
  smile.rotation.z = Math.PI;
  const left = part('Left arm', new CapsuleGeometry(0.18, 0.6, 12, 32, 12), 'lavender', [-0.77, 0.2, 0]);
  left.rotation.z = -0.4;
  const right = part('Right arm', new CapsuleGeometry(0.18, 0.6, 12, 32, 12), 'lavender', [0.77, 0.2, 0]);
  right.rotation.z = 0.4;
  part('Left boot', new SphereGeometry(0.3, 28, 20), 'green', [-0.34, -0.76, 0.12], [1, 0.65, 1.25]);
  part('Right boot', new SphereGeometry(0.3, 28, 20), 'green', [0.34, -0.76, 0.12], [1, 0.65, 1.25]);
  part('Antenna', new CapsuleGeometry(0.055, 0.2, 6, 16), 'cream', [0, 1.65, 0.06]);
  part('Antenna tip', new SphereGeometry(0.14, 24, 16), 'orange', [0, 1.85, 0.06]);
  part('Badge', new SphereGeometry(0.14, 24, 16), 'cream', [0, 0.2, 0.62], [1, 1, 0.2]);
  return makeAsset(root, 'Orbit buddy', 'sample');
}
