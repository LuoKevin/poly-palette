import type { Box3, Group, Object3D, Vector3 } from 'three';

export interface ModelStats {
  meshes: number;
  vertices: number;
  triangles: number;
  meshesWithUVs: number;
}

export interface ModelAsset {
  id: string;
  name: string;
  source: 'sample' | 'file';
  root: Group;
  resources: Object3D[];
  stats: ModelStats;
  bounds: Box3;
  center: Vector3;
  size: Vector3;
  bytes?: number;
}
