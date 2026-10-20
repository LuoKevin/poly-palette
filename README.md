# PolyPalette

A small, entirely browser-based 3D painting workspace built incrementally with React, TypeScript, Vite, Three.js, React Three Fiber, and Drei.

**Current milestone: select, edit, and save.** Select and fill individual meshes, paint with stroke-level undo/redo, and download editable `.polypalette` projects. Projects restore the model, brush, selection, camera, and display settings. GLB export remains available for sharing models. There is no automatic saving; save a project before closing.

## Continuing in a new chat

Start with [HANDOFF.md](HANDOFF.md) for the current state, verification evidence, known limits, and the proposed next milestone. `AGENTS.md` points coding assistants to that document automatically.

## Run locally

Use Node.js 22.12+. From a terminal:

```sh
cd /Users/kevinluo/Documents/Projects/poly-palette
npm ci
npm run dev
```

Open **http://127.0.0.1:5173**. If that port is already occupied, stop the other server or use `npm run dev -- --port 5174`.

```sh
npm test
npm run build
npm run preview
```

The preview command serves the production build at **http://127.0.0.1:4173**. Development/build tools run locally; the application has no backend, uploads, telemetry, accounts, or remote model assets. A browser with WebGL 2 is required.

## What works

- A built-in, original multi-mesh robot sample with enough vertices for broad brush strokes.
- Separate Select, Navigate, and Paint modes; editing disables camera gestures.
- Mesh selection by viewport click or list, with whole-mesh fill at the chosen color/opacity.
- One undo/redo command per stroke/fill, including geometry/material and texture restoration.
- Versioned local project save/reopen; invalid files preserve the current workspace.
- A live color picker, eight swatches, screen-pixel brush size, opacity, and a brush cursor.
- Soft vertex-color strokes on the visible portion of the first mesh touched, with occlusion checks.
- GLB export retaining vertex colors and original transforms; exported models remain paintable.
- Orbit, zoom, pan, reset-to-fit, and clickable orientation axes.
- Local GLB 2.0 import through a file picker or drag-and-drop.
- Imported materials, embedded PNG/JPEG textures, and vertex colors displayed by the glTF loader.
- Automatic centering/framing without overwriting the model's original transforms.
- Model statistics, background swatches, floor-grid and wireframe toggles.
- Errors that preserve the previously loaded model, plus resource cleanup when replacing models.

This version opens one self-contained, uncompressed GLB at a time: at most 50 MiB and 2 million triangles. These are input guards, not a performance guarantee on every device. External resource references are refused so loading a model cannot fetch remote images or buffers. Skins, morph targets, instanced meshes, Draco, Meshopt, KTX2, OBJ, STL, and multi-file `.gltf` imports are not supported yet. Animation clips are not played. UV coordinates are **not required** to display an untextured model.

## Controls

| Action | Control |
| --- | --- |
| Select a mesh | **S**, then click the mesh, or use the Selected mesh list |
| Fill selected mesh | **F**, with current color and opacity |
| Undo / redo | **⌘/Ctrl Z** / **⌘/Ctrl Shift Z** (also **Ctrl Y**) |
| Save project | **⌘/Ctrl S**, or Save project |
| Orbit | Left-drag in Orbit mode; **V** selects Orbit |
| Pan | Right-drag, or left-drag in Pan mode; **H** selects Pan |
| Zoom | Mouse wheel, trackpad pinch, or toolbar +/− |
| Reset and fit | **R** or either Reset view button |
| Touch | One finger to orbit; two fingers to zoom/pan |

Project files are UTF-8 JSON with embedded geometry/textures, capped at 100 MiB. Open project or drop a `.polypalette` file to restore it. History starts fresh on reopening and retains up to 100 commands within an estimated 64 MiB budget. Save project clears the unsaved indicator; Export GLB saves only the model.

**B** selects Paint. Paint mode disables orbit/pan/scroll gestures; the toolbar zoom and reset buttons still work. A stroke stays on its first mesh. Opacity blends once per stroke; another stroke can build more color.

Paint currently supports opaque static meshes. Textured meshes require the explicit **Replace base-color textures** option; the first stroke removes the touched mesh's base-color map. Transparency/alpha cutouts are view/export-only for now. No UVs are needed. Sparse meshes need a larger brush or more vertices; this version does not subdivide imported geometry automatically.

## Viewer verification

1. Open the app. The robot should be visible immediately, with 12 meshes in the inspector.
2. Drag to orbit, switch to Pan and drag, zoom both ways, then press **R**. The model should recenter and fit the viewport.
3. Toggle wireframe and floor grid, then change the background. Restore the settings.
4. Open `public/examples/color-cube.glb` using **Open model**. Expect a colored cube, **1 mesh**, **12 triangles**, **24 vertices**, and **0 / 1 meshes with UVs**. The Quick guide also offers this fixture as a download.
5. Drop the same GLB onto the application. It should replace the current model and fit again.
6. Try a corrupted `.glb` or a different format. Expect a useful error while the previously loaded model remains usable.
7. Choose **Load the sample**. Resize the window; the viewport and settings should remain usable.

For selection, history and saving, follow the [milestone 3 verification checklist](docs/milestone-3.md). The [milestone 2 checklist](docs/milestone-2.md) also covers brush/export behavior. Automated tests cover import validation, bounds, disposal, preparation, opacity, occlusion, transformed/UV-less meshes, and the actual Three.js exporter/loader round trip. Actual WebGL drawing, brush controls, downloads, and reopening are also checked in the browser.

## Where to work next

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Editor layout, controls, local-file input, shortcuts |
| `src/components/Viewport.tsx` | Camera, lights, navigation, display-only normalization |
| `src/hooks/useModel.ts` | Current asset, loading/error state, replacement and disposal |
| `src/model/importGlb.ts` | Validate and load a local GLB |
| `src/model/model.ts` | Inspect bounds/statistics and release GPU resources |
| `src/model/sample.ts` | Procedural sample model |
| `src/model/types.ts` | Shared asset types |
| `src/paint/brush.ts` | Screen-space strokes, visibility, linear blending |
| `src/paint/prepareMesh.ts` | Isolate shared resources and initialize colors |
| `src/components/PaintInteraction.tsx` | Pointer capture, mode lifecycle, cursor |
| `src/model/exportGlb.ts` | Download a GLB without editor objects |
| `src/paint/history.ts` | Bounded command history and shared-resource release |
| `src/paint/fill.ts` | Whole-mesh fill and mesh enumeration |
| `src/project/project.ts` | Versioned local projects, validation and download |
| `src/model/display.ts` | Keep wireframe display overrides out of saved materials |
| `src/styles.css` | Responsive editor styling |
| `docs/architecture.md` | Painting tradeoffs, graphics concepts, milestone plan |

Read [milestone 3](docs/milestone-3.md) for project/history design and verification, and [how milestone 2 works](docs/milestone-2.md) for the graphics concepts and verification results. The [architecture and milestone plan](docs/architecture.md) describes subsequent work.
