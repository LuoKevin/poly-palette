# Architecture and painting plan

## Keep the graphics code understandable

React owns the toolbar, selection, mode, brush settings, and document status. React Three Fiber connects React's lifecycle to a Three.js scene; Drei supplies camera controls and the orientation gizmo. File import, geometry preparation, painting math, history, and export belong in ordinary TypeScript modules, so they can be tested without a WebGL canvas. We do not need a backend or a global state library yet.

Pointer strokes mutate typed color buffers through a painting controller. React should not rerender for every vertex or pointer sample. The UI receives a small update when a stroke commits. The viewport already renders on demand rather than continuously when idle.

The current flow is:

```text
File picker / drop → validate GLB → Three.js loader → ModelAsset
                                                       ↓
React settings → Viewport → camera + lights + model → WebGL canvas
```

Milestone 2 adds a raycast → brush → color-buffer update path and a GLB download path. Both are implemented. All imported bytes and edited state stay in browser memory. Project downloads will provide persistence; a later optional IndexedDB recovery feature can protect unsaved work.

## Graphics concepts used in milestone 1

- **Mesh:** geometry plus a material. Geometry describes vertices and triangles; the material describes how the surface responds to light. A model may contain many meshes sharing geometry or materials.
- **Attributes:** arrays attached to vertices. Position gives location; normals describe surface orientation for lighting; color stores vertex tint; UV gives a 2D address in an image. See Three.js's [BufferGeometry documentation](https://threejs.org/docs/pages/BufferGeometry.html).
- **Scene graph:** a hierarchy of objects with transforms. A child inherits its parents' translation, rotation, and scale. The importer preserves this hierarchy.
- **Camera controls:** orbiting moves the camera around a target; panning moves both camera and target. These do not rewrite the model geometry.
- **Bounds and framing:** the model's bounding box gives its center and size. A presentation-only wrapper centers and scales it, while the camera is fitted using its field of view and viewport aspect ratio. Future export must use the original asset root, excluding the grid, lights, camera, and wrapper.
- **GPU resource ownership:** JavaScript garbage collection does not automatically release Three.js textures, geometries, and materials. Replacing a model disposes its resources once, accounting for sharing.

[React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction) is a React renderer for Three.js. It helps manage scene components without replacing Three.js concepts; we will still work directly with meshes, matrices, attributes, and raycasters.

## Vertex colors versus texture painting

| Concern | Vertex colors | Texture painting |
| --- | --- | --- |
| Where color lives | RGB values at mesh vertices, interpolated across triangles | Pixels in a 2D image sampled using UV coordinates |
| Detail | Limited by vertex spacing; a large triangle cannot hold a tiny sharp mark | Limited mainly by texture resolution and how much UV area a surface receives |
| UV-less input, including STL | Works without UVs | Requires generating an unwrap/atlas or adopting a more complex projection strategy |
| Seams | No UV seams, but duplicated vertices at the same position can acquire different colors | UV island boundaries need padding and painting across both sides; overlapping/mirrored UVs can affect multiple surfaces |
| Runtime/memory | Simple color-buffer updates; higher detail requires more geometry and more work per brush query | Fine detail without subdivision, but image uploads and undo snapshots can be large; one 4096² RGBA image is 64 MiB before mipmaps/history |
| Export | GLB can retain colors as the glTF `COLOR_0` attribute | GLB can embed the painted base-color image and its UVs |

**Recommendation: vertex coloring for the first painting milestone.** It gives us a complete paint-and-export loop quickly and works with the UV-less models we intend to import later. It suits broad painting on a sufficiently dense mesh. It is not yet a detail-painting tool for low-poly assets: a 12-triangle cube will make that limitation obvious.

Subdivision can add paint samples, but grows geometry and does not automatically produce a better-shaped model. We should add an explicit, bounded preparation operation later, not silently subdivide everything. For STL's often duplicated triangle vertices, coordinate groups can keep adjacent colors consistent without welding away hard normals. Disconnected surfaces that merely touch must not be grouped indiscriminately.

Texture painting is the later detail-oriented path. A raycast gives both a 3D hit and, when available, interpolated UV coordinates. Mapping a brush into UV space must account for seams, distortion, texture transforms, and overlapping islands. STL generally supplies triangles and normals rather than usable UVs, so keep the vertex path available until we implement an atlas generator. Projecting an arbitrary planar UV map is not a general fix for a closed model.

## Painting behavior — implemented in milestone 2

1. Add explicit **Navigate** and **Paint** modes. Only Paint consumes surface drags; it disables orbit dragging. Keep reset/zoom available and release pointer capture on cancellation.
2. Raycast the model to find the frontmost hit. Use a brush footprint in screen pixels so size feels familiar, and interpolate samples along fast pointer motion.
3. Update vertices within that footprint on the visible surface. A distance sphere alone can paint through thin walls: visibility/depth tests and surface-facing checks must exclude covered or back-facing geometry. Transformed meshes require consistent world/screen coordinates.
4. Blend linear-space colors with brush opacity and falloff, mark the color attribute as changed, and invalidate the viewport. Opacity means color blending, not making geometry transparent. A per-geometry BVH accelerates visibility rays, and visibility results are cached during each stroke. Vertex projection/scanning is still linear in mesh size; worker-based preparation is a future improvement.
5. Clone shared geometry/materials before editing a particular mesh. Otherwise painting one instance can change another unexpectedly.
6. Add a color picker, preset swatches, brush diameter, opacity, and a visible cursor. First verify strokes on the sample and an untextured imported mesh.
7. Export only the edited asset with Three.js's [GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html), using binary output, and reopen it to verify colors and transforms survive.

Material handling needs an explicit choice: vertex colors multiply the material base color and any base-color texture. Painting red over a blue texture does not simply replace it with red. For the first painting milestone, prepare an editable copy with a white base material and vertex colors initialized from an existing uniform tint/color attribute. Textured meshes remain viewable; painting them will require an explicit “replace base appearance” preparation step. Preserving arbitrary texture detail beneath vertex paint needs a later bake/compositing strategy. Original resources are retained internally; a user-facing restore/undo operation is still part of milestone 3.

Export uses GLB even when a model was imported from STL or OBJ. Standard STL has no portable color/material representation, and colored OBJ conventions are inconsistent. GLB preserves color data, though lighting and color management in another viewer can affect its appearance. Model export is distinct from an editable project: it does not retain brush settings, camera state, or undo history.

## Milestones and acceptance checks

### 1. Explore — implemented

Scaffold, procedural sample, GLB import, camera controls, framing, and errors. Run `npm ci && npm run dev` from the project directory. Use the seven-step checklist in the README; run `npm test` and `npm run build` before proceeding.

### 2. Paint and export — implemented

Implemented `src/paint/brush.ts`, `src/paint/prepareMesh.ts`, the `PaintInteraction` pointer bridge, brush settings UI, and `src/model/exportGlb.ts`. See [the milestone 2 walkthrough](milestone-2.md). Keep this milestone focused on the complete interaction rather than secondary editing tools.

Acceptance: paint several colors at different sizes/opacities; strokes stop when switching modes; navigation never paints; rotating reveals no accidental strokes through the back; export a GLB, reload it, and verify the same colors and original model transforms. Retain the same dev/test/build commands, with focused tests for blending and coordinate transforms. No milestone is complete merely because the controls appear in the UI.

### 3. Edit and save

Select a mesh and fill it. Store one undo command per stroke/fill, with before/after color deltas and a memory budget. Clear redo after a new edit. Save a versioned `.polypalette` project containing the model, current color/material state, stable mesh IDs, and camera/brush settings; reopening restores the editable state. Session undo history need not be embedded in the first project format. Validate the project version and resource references on load.

Acceptance: undo/redo multiple strokes and fills in order; filling one mesh leaves other meshes alone; save, reload the page, reopen the project, and continue painting; handle invalid project files without losing the current work.

### 4. More inputs and finer painting

Add STL first, then OBJ, then local `.gltf` bundles. OBJ materials/textures and `.gltf` files require resolving user-selected companion files entirely locally. Add measured geometry preparation, then optional texture painting with UV inspection and a later atlas generator. Consider compressed formats and animation only after the static editing workflow is reliable.

Acceptance: import a UV-less STL, paint it, and export/reopen a colored GLB; verify multi-file imports without network fetches; test texture strokes crossing UV seams and models with mirrored UVs before claiming texture painting support.
