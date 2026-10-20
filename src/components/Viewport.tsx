import { Component, useEffect, useLayoutEffect, useRef } from 'react';
import type { ComponentRef, ReactNode } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { GizmoHelper, GizmoViewport, Grid, OrbitControls } from '@react-three/drei';
import { MOUSE, Mesh, PerspectiveCamera, Vector3 } from 'three';
import type { Material } from 'three';
import type { ModelAsset } from '../model/types';
import { PaintInteraction } from './PaintInteraction';
import type { BrushSettings, StrokeResult } from '../paint/brush';
import type { RefObject } from 'react';

export interface ViewportProps {
  model: ModelAsset;
  background: string;
  grid: boolean;
  wireframe: boolean;
  navigation: 'orbit' | 'pan';
  reset: number;
  zoom: { direction: number; sequence: number };
  mode: 'navigate' | 'paint';
  brush: BrushSettings;
  onStroke: (result: StrokeResult) => void;
  onMessage: (message: string) => void;
}

function Scene({ model, background, grid, wireframe, navigation, reset, zoom, mode, brush, onStroke, onMessage, cursor }: ViewportProps & { cursor: RefObject<HTMLDivElement | null> }) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const appliedZoom = useRef(zoom.sequence);
  const { camera, size, invalidate } = useThree();
  // Normalize presentation only. The imported scene's original units/transforms
  // remain intact for future project saving and model export.
  const scale = 3 / Math.max(model.size.x, model.size.y, model.size.z);
  const radius = model.size.length() * scale / 2;
  const floorY = -model.size.y * scale / 2 - 0.03;

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls.current) return;
    const halfVertical = camera.fov * Math.PI / 360;
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * size.width / size.height);
    const distance = radius / Math.sin(Math.min(halfVertical, halfHorizontal)) * 1.2;
    camera.position.copy(new Vector3(3.4, 1.6, 6).normalize().multiplyScalar(distance));
    camera.near = radius / 1000;
    camera.far = radius * 1000;
    camera.updateProjectionMatrix();
    controls.current.target.set(0, 0, 0);
    controls.current.update();
    invalidate();
  }, [camera, model.id, radius, reset, size.width, size.height, invalidate]);

  useEffect(() => {
    if (!zoom.sequence || zoom.sequence === appliedZoom.current || !controls.current) return;
    appliedZoom.current = zoom.sequence;
    const target = controls.current.target;
    const offset = camera.position.clone().sub(target);
    const nextDistance = Math.max(radius * 0.15, Math.min(radius * 30, offset.length() * (zoom.direction > 0 ? 0.8 : 1.25)));
    camera.position.copy(target).add(offset.setLength(nextDistance));
    controls.current.update();
    invalidate();
  }, [zoom, camera, radius, invalidate]);

  useEffect(() => {
    const previous = new Map<Material & { wireframe: boolean }, boolean>();
    model.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if ('wireframe' in material && !previous.has(material)) {
          previous.set(material, material.wireframe);
          material.wireframe = wireframe || material.wireframe;
          material.needsUpdate = true;
        }
      }
    });
    invalidate();
    return () => { for (const [material, value] of previous) { material.wireframe = value; material.needsUpdate = true; } };
  }, [model, wireframe, invalidate]);

  return <>
    <color attach="background" args={[background]} />
    <hemisphereLight args={['#fffaf0', '#a2a0b9', 2.2]} />
    <directionalLight position={[4, 7, 5]} intensity={3.2} color="#fff7e8" />
    <directionalLight position={[-5, 2, -3]} intensity={2} color="#d7d9ff" />
    <group scale={scale} position={model.center.clone().multiplyScalar(-scale)}>
      <primitive object={model.root} dispose={null} />
    </group>
    {grid && <Grid position={[0, floorY, 0]} args={[30, 30]} cellSize={0.5} sectionSize={2.5} cellThickness={0.55} sectionThickness={0.7} cellColor="#b0aaa1" sectionColor="#a39b92" fadeDistance={18} fadeStrength={1.8} infiniteGrid />}
    <OrbitControls ref={controls} makeDefault enabled={mode === 'navigate'} enableDamping={mode === 'navigate'} dampingFactor={0.12}
      minDistance={radius * 0.15} maxDistance={radius * 30}
      mouseButtons={{ LEFT: navigation === 'pan' ? MOUSE.PAN : MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN }} />
    {mode === 'paint' && <PaintInteraction key={`${reset}:${zoom.sequence}:${size.width}:${size.height}`} model={model} brush={brush} cursor={cursor} onStroke={onStroke} onMessage={onMessage} />}
    {mode === 'navigate' && <GizmoHelper alignment="bottom-right" margin={[55, 55]}>
      <GizmoViewport axisColors={['#ce7b77', '#77a28a', '#8d84bf']} labelColor="#fff" hideNegativeAxes />
    </GizmoHelper>}
  </>;
}

class ViewportBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div className="viewport-fallback"><strong>The 3D view could not start.</strong><p>Try a browser with WebGL 2 and hardware acceleration enabled, or reopen the sample model.</p></div>;
    return this.props.children;
  }
}

export function Viewport(props: ViewportProps) {
  const cursor = useRef<HTMLDivElement>(null);
  return <ViewportBoundary key={props.model.id}>
    <Canvas frameloop="demand" dpr={[1, 2]} camera={{ fov: 42, position: [4, 2, 7] }}
      gl={{ antialias: true, alpha: false }}
      fallback={<div className="viewport-fallback"><strong>Interactive 3D preview</strong><p>Use the viewport toolbar to orbit, pan, zoom, or reset. If the preview does not appear, use a browser with WebGL 2 and hardware acceleration enabled.</p></div>}
      aria-label="Interactive 3D model viewport">
      <Scene {...props} cursor={cursor} />
    </Canvas>
    <div ref={cursor} className="brush-cursor" aria-hidden="true" />
  </ViewportBoundary>;
}
