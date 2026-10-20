# PolyPalette session handoff

Last updated: 2026-10-20. Milestones 1–3 are implemented. This document describes the state at handoff; recheck the working tree and running processes before changing anything.

## Start here

- Canonical project folder: `/Users/kevinluo/Documents/Projects/poly-palette`.
- The app was moved out of `/Users/kevinluo/Documents/Snorkel-AI/terminus/polypalette`. The old directory no longer exists. This project is independent of the earlier benchmark work in that repository.
- Existing Codex project: **PolyPalette**, pointing to the canonical folder above. Use this project for new chats.
- Read this file, `README.md`, `docs/architecture.md`, `docs/milestone-2.md`, and `docs/milestone-3.md` before continuing.
- Milestone 3 was verified with a fresh Vite server at `http://127.0.0.1:5174/`; an older server occupied 5173. Check running processes before starting another; do not rely on previous browser/process handles.
- Git uses branch `main`; `origin` is `https://github.com/LuoKevin/poly-palette.git`. Initial commit `e5957a3` was pushed to `origin/main` on 2026-10-20. The user subsequently authorized committing and pushing milestone 3 on the same date. Check `git log -1` and `git status --short --branch` for the current commit and upstream state. Preserve all local work; do not clean/reset this working directory.

## User intent and working style

Build an approachable, MS Paint-like tool for painting 3D models. The user is a software engineer comfortable with React, TypeScript, and backend development, learning graphics. Act as a development partner: implement incrementally and explain the important graphics ideas briefly.

Use React, TypeScript, Vite, and Three.js. React Three Fiber and Drei are already adopted. Keep the initial app entirely in the browser, with local model files, no accounts, and no backend. Prioritize working interactions and understandable controls over secondary features. Keep the app runnable at each milestone and provide relevant files, commands, a concise graphics explanation, and a manual verification checklist. Make routine implementation decisions without a long questionnaire.

The user requested milestone 3 after the initial commit/push. Selection/fill, undo/redo, and editable project save/reopen are now implemented and verified. The latest request is to commit these changes and push them to GitHub. Further milestones remain unrequested.

## Implemented

### Milestone 1: explore

- React/TypeScript/Vite scaffold, responsive creative-tool layout, and procedural multi-mesh robot sample.
- Orbit, zoom, pan, reset-to-fit, clickable orientation axes; background, grid, wireframe, and model statistics.
- Local GLB 2.0 import through a file picker or drag/drop. Self-contained assets only; external buffer/image references are rejected.
- Preservation of original model transforms using a separate presentation wrapper.
- Errors preserve the previous model; replacement explicitly disposes owned GPU resources.

### Milestone 2: paint and export

- Separate Navigate and Paint modes. B selects Paint, V selects Orbit, H selects Pan, R resets the view.
- Paint mode disables camera gestures. Toolbar zoom/reset remain available. The orientation gizmo is shown in navigation mode.
- Live native color picker, eight swatches, 8–240 CSS-pixel brush diameter, 5–100% opacity, soft falloff, and cursor preview.
- A stroke targets its first mesh. Projected vertex-to-pointer-segment distances provide continuous coverage between pointer events.
- Surface orientation and occlusion checks exclude hidden vertices. Per-geometry `three-mesh-bvh` trees accelerate raycasting; visibility is cached per stroke.
- Colors blend in linear RGB. Each vertex uses maximum coverage across a stroke, so opacity does not accumulate merely because more pointer events arrive. Separate strokes layer normally.
- Preparation clones shared geometry/materials and bakes material tint into vertex colors; cloned base materials become white. Multi-material geometry is separated where needed to preserve distinct group tints.
- Base-color textures are preserved until the user explicitly enables replacement and paints that mesh. Other meshes keep their textures.
- Binary GLB download retains vertex colors, materials, and original transforms, excluding the editor wrapper, camera, lights, and grid. Reopened GLBs remain paintable.
- Model replacement asks for confirmation when the workspace has unsaved changes. Milestone 3 now clears that indicator on project save; GLB export keeps it because it excludes editor settings.
- Robot body/arms were given more vertices to support useful brush detail. Current sample: 12 meshes, 24,480 triangles, 13,147 vertices.

### Milestone 3: edit and save

- Select mode (**S**) raycasts the clicked mesh and shows a purple bounding box; a mesh list also selects hidden/small meshes. Fill (**F**) blends current color/opacity over the entire selected mesh, including hidden vertices.
- `EditHistory` records one command per stroke/fill. Undo/redo restores color deltas and first-edit geometry/material preparation, including texture removal. New edits invalidate redo. Estimated 64 MiB / 100-command budget; oldest commands evicted first. Oversized individual edits clear history and explain that they cannot be undone.
- History resource holders retain both preparation states; discarding history releases only resources no longer shared by the model or other retained states. A missed/no-op brush does not prepare a mesh or remove a texture. Explicit texture replacement still counts when RGB already matches.
- `.polypalette` version 1 is native scene JSON with explicit BufferGeometry, embedded images, stable mesh IDs, model name, brush/selection/camera/navigation/display settings. No session undo history; opening starts a fresh history. Maximum 100 MiB; existing 2-million-triangle guard also applies. Version/settings/selection/external images validated before accepting a replacement.
- Save project (**⌘/Ctrl S**) stores the complete workspace and clears its dirty indicator. GLB export remains separate. Replacement and browser unload protect unsaved changes; malformed projects preserve current model/history. There is no autosave/recovery.
- Camera position and orbit target restore from projects; resizing preserves the view, Reset fits it. Orbit damping is disabled for deterministic camera capture. Wireframe display overrides never enter saved materials.
- Runtime requirement corrected to Node 22.12+ in package metadata and README; no dependency versions changed.

## Code map

| File | Purpose |
| --- | --- |
| `src/App.tsx` | Editor UI, brush/mode state, shortcuts, import/export, status and replacement confirmation |
| `src/components/Viewport.tsx` | R3F scene, camera fitting, presentation wrapper, navigation and display settings |
| `src/components/PaintInteraction.tsx` | Pointer events/capture, brush cursor, stroke lifecycle and cleanup |
| `src/paint/brush.ts` | PaintStroke, screen-space coverage, BVH raycasting, visibility and blending |
| `src/paint/prepareMesh.ts` | Clone shared resources, initialize colors, retain before/after preparation states |
| `src/paint/history.ts` | Bounded undo/redo, color deltas, shared-resource release |
| `src/paint/fill.ts` | Whole-mesh fill and mesh enumeration |
| `src/project/project.ts` | Versioned project serialization, validation, import and download |
| `src/model/display.ts` | Keep temporary wireframe overrides out of model state |
| `src/hooks/useModel.ts` | Current asset, loading/error state, race-safe replacement, disposal |
| `src/model/importGlb.ts` | GLB validation, resource boundary and GLTFLoader |
| `src/model/exportGlb.ts` | GLTFExporter and local browser download |
| `src/model/model.ts` | Bounds/statistics, ModelAsset creation, resource disposal |
| `src/model/sample.ts` | Procedural robot |
| `src/model/types.ts` | Shared asset types |
| `src/styles.css` | Responsive creative-tool layout |

`ModelAsset.root` is the rendered/exportable original hierarchy. `ModelAsset.resources` also holds before/after history resources from mesh preparation; those extra resource holders must never be added to the rendered/exported hierarchy. Shared textures/materials/geometries must be disposed once, not once per mesh.

Do not bake the viewport's centering/scale into the model. Do not mutate React state per vertex. Do not multiply painted colors by the original base tint again. Keep geometry colors in Three.js's linear working space. The native color picker handles both input and change events so colors update live.

## Milestone 3 verification (2026-10-20)

- `npm test`: **36 tests in 6 files passed** using Node 22.22.0. The GLB round-trip test now includes fill undo/redo before exporting. New history/project suites cover first-edit restoration, sharing/disposal, budgets, branching, no-ops, textures, groups, settings, stable IDs and invalid files.
- `npm run build`: TypeScript and production build passed. Large graphics chunk warning remains (~369 kB gzip), as do the dependency CommonJS warning and browser Three.Clock deprecation warning. No browser console errors were observed.
- Actual browser interactions: viewport/list selection, body/arm fills, strokes, undo/redo, redo invalidation, project download/reload/reopen, resumed painting, invalid-version recovery with history preserved, explicit texture replacement and texture restoration on Undo, GLB download/reopening after history operations.
- Comparing two browser project downloads matched all **12 mesh IDs, names, local matrices, geometry arrays, and editor settings exactly**, including changed camera angle, brush size/opacity, selection, background and grid.
- The browser GLB exported after history operations matched all **8,631 RGB vertices** on Body, Face and Right arm against the saved project.
- Evidence: `docs/verification/milestone-3-roundtrip.json` and `docs/milestone-3.png`; walkthrough and manual checklist: `docs/milestone-3.md`. Downloaded test projects/GLBs remain in the local Downloads folder; they are not application dependencies.

## Historical milestone 2 verification

Automated checks were rerun on 2026-10-20 from the canonical folder before the initial commit: all 26 tests and the production build passed using Node 22.22.0. `npm ci` restored missing macOS native dependencies without changing the lockfile. The default Node 20 installation produced dependency engine warnings, so use Node 22.12+ for this toolchain. Browser verification below predates the folder move and was not repeated for this publication-only request; application logic is unchanged. These results do not establish that a future working tree has been tested.

- `npm test`: **26 tests in 4 files passed**.
- `npm run build`: TypeScript and Vite production build passed.
- Vite reports a large initial graphics chunk (~365 kB gzip). Unit tests also emit a Three.js CommonJS deprecation warning through a dependency; the tests pass. Browser verification showed no console errors.
- Tests cover local GLB validation, unsupported external resources/compression, bounds/transforms, UV-less meshes, resource sharing/disposal, material preparation, per-stroke opacity, pointer-segment coverage, front/back exclusion, occlusion across a 0.001-unit gap, and color-space conversion.
- `src/model/exportGlb.test.ts` uses the actual GLTFExporter and GLTFLoader. Only FileReader is adapted for Node. It verifies every color component, original transforms, exclusion of editor objects, and repainting after reopening.
- Browser checks exercised real strokes, custom color input, swatches, size and opacity sliders, mode switching/navigation, export download, reopening, and re-export.
- The browser round trip preserved all **8,631 RGB color vertices** across Body, Face, and Right arm, and the world transforms of all **12 meshes**, exactly.

Evidence in the repository:

- `docs/verification/roundtrip.json`: hashes, counts, and transforms from comparing the two browser exports using an independent GLTFLoader inspection.
- `docs/verification/painted-buddy.glb`: the painted browser-exported example (about 0.65 MiB).
- `docs/milestone-1.png` and `docs/milestone-2.png`: UI screenshots; the latter shows the reopened painted GLB.
- `public/examples/color-cube.glb`: tiny UV-less import fixture (1 mesh, 12 triangles, 24 vertices).

The browser comparison was a one-off authoring check; there is no general-purpose comparison CLI in this repository. The automated round-trip test is repeatable with `npm test`.

## Run/check commands

Use Node 22.12+, with the lockfile. The default shell used Node 20 during this session, so checks explicitly selected the installed Node 22.22.0 binary.

```sh
cd /Users/kevinluo/Documents/Projects/poly-palette
npm ci
npm run dev
```

The dev server is at `http://127.0.0.1:5173/`; it uses strict port binding. If occupied, inspect/reuse the existing server or use `npm run dev -- --port 5174`.

```sh
npm test
npm run build
npm run preview
```

Production preview defaults to `http://127.0.0.1:4173/`. `node_modules/`, `dist/`, and TypeScript build metadata are ignored by Git.

## Current limits and unresolved work

- No automatic saving or crash recovery. Save a project before closing; reloading starts with the sample. Session history is not included in project files. Project JSON is larger than GLB and serialization/validation run on the main thread.
- GLB import only: up to 50 MiB and 2 million triangles, uncompressed and self-contained. Those guards are not a performance guarantee.
- OBJ, STL, multi-file glTF, Draco/Meshopt/KTX2, skinned/instanced/morph-target editing, and animation playback are not implemented.
- Paint supports opaque static meshes; transparent/alpha-cutout meshes remain view/export-only. Alpha-texture-aware visibility is not implemented.
- Textured painting replaces the touched mesh's base-color texture only after explicit opt-in. It does not preserve/bake image details underneath vertex paint.
- Vertex colors do not require UVs. Fine marks require dense geometry; interpolation can extend visible color beyond the cursor within large triangles. There is no automatic subdivision/unwrap.
- BVH construction, projection and vertex scanning run on the main thread. Large-file interaction latency is not comprehensively benchmarked; workers/spatial indexing and code splitting remain potential improvements.
- The history budget estimates retained buffer/texture data, not all JavaScript/BVH/GPU allocations. Large meshes and texture-heavy project loads have not been comprehensively benchmarked.
- Publication of milestone 3 is authorized. Consult Git for the latest commit and upstream state; further milestone implementation remains unrequested.

## Potential next milestone (not started)

Add STL first, then OBJ and local glTF bundles incrementally, maintaining local resource resolution and GLB export. A separate recovery milestone could use IndexedDB for unsaved-work recovery. Detail painting/subdivision/UV work remains later scope. Let the user choose; the roadmap does not authorize implementation by itself.

Update this handoff after meaningful changes so future chats can distinguish implemented behavior, tested evidence, and proposed work.
