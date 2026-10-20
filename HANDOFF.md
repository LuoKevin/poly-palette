# PolyPalette session handoff

Last updated: 2026-10-20. Milestones 1 and 2 are implemented. This document describes the state at handoff; recheck the working tree and running processes before changing anything.

## Start here

- Canonical project folder: `/Users/kevinluo/Documents/Projects/poly-palette`.
- The app was moved out of `/Users/kevinluo/Documents/Snorkel-AI/terminus/polypalette`. The old directory no longer exists. This project is independent of the earlier benchmark work in that repository.
- Existing Codex project: **PolyPalette**, pointing to the canonical folder above. Use this project for new chats.
- Read this file, `README.md`, `docs/architecture.md`, and `docs/milestone-2.md` before continuing.
- A Vite dev server was restarted from the new folder at `http://127.0.0.1:5173/`. Check whether it is still running before starting another; do not rely on a previous chat's process or browser handles.
- Git uses branch `main`; `origin` is `https://github.com/LuoKevin/poly-palette.git`. The user authorized the initial commit and push on 2026-10-20. The remote was checked and contained no refs before publication. Check `git log -1` and `git status --short --branch` for the current commit and upstream state. Preserve all local work; do not clean/reset this working directory.

## User intent and working style

Build an approachable, MS Paint-like tool for painting 3D models. The user is a software engineer comfortable with React, TypeScript, and backend development, learning graphics. Act as a development partner: implement incrementally and explain the important graphics ideas briefly.

Use React, TypeScript, Vite, and Three.js. React Three Fiber and Drei are already adopted. Keep the initial app entirely in the browser, with local model files, no accounts, and no backend. Prioritize working interactions and understandable controls over secondary features. Keep the app runnable at each milestone and provide relevant files, commands, a concise graphics explanation, and a manual verification checklist. Make routine implementation decisions without a long questionnaire.

The continuation chat read the project documentation and summarized readiness. The latest request is to make the initial commit and push it to the configured GitHub repository. **Milestone 3 has not yet been explicitly requested for implementation.** Let the user direct the next implementation work.

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
- Model replacement asks for confirmation if the app has unsaved painting. Export clears that dirty indicator.
- Robot body/arms were given more vertices to support useful brush detail. Current sample: 12 meshes, 24,480 triangles, 13,147 vertices.

## Code map

| File | Purpose |
| --- | --- |
| `src/App.tsx` | Editor UI, brush/mode state, shortcuts, import/export, status and replacement confirmation |
| `src/components/Viewport.tsx` | R3F scene, camera fitting, presentation wrapper, navigation and display settings |
| `src/components/PaintInteraction.tsx` | Pointer events/capture, brush cursor, stroke lifecycle and cleanup |
| `src/paint/brush.ts` | PaintStroke, screen-space coverage, BVH raycasting, visibility and blending |
| `src/paint/prepareMesh.ts` | Clone shared resources, initialize color attributes, material/texture policy |
| `src/hooks/useModel.ts` | Current asset, loading/error state, race-safe replacement, disposal |
| `src/model/importGlb.ts` | GLB validation, resource boundary and GLTFLoader |
| `src/model/exportGlb.ts` | GLTFExporter and local browser download |
| `src/model/model.ts` | Bounds/statistics, ModelAsset creation, resource disposal |
| `src/model/sample.ts` | Procedural robot |
| `src/model/types.ts` | Shared asset types |
| `src/styles.css` | Responsive creative-tool layout |

`ModelAsset.root` is the rendered/exportable original hierarchy. `ModelAsset.resources` also holds retained resources from mesh preparation; those extra resource holders must never be added to the rendered/exported hierarchy. Shared textures/materials/geometries must be disposed once, not once per mesh.

Do not bake the viewport's centering/scale into the model. Do not mutate React state per vertex. Do not multiply painted colors by the original base tint again. Keep geometry colors in Three.js's linear working space. The native color picker handles both input and change events so colors update live.

## Verification already performed

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

Use Node 22.12+, with the lockfile. Some dependencies no longer support the Node 20 range still listed in the package metadata and README.

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

- No mesh fill, explicit selection UI, undo/redo, project save/reopen, automatic saving, or recovery yet. Export GLB before closing. Reloading starts with the sample.
- GLB import only: up to 50 MiB and 2 million triangles, uncompressed and self-contained. Those guards are not a performance guarantee.
- OBJ, STL, multi-file glTF, Draco/Meshopt/KTX2, skinned/instanced/morph-target editing, and animation playback are not implemented.
- Paint supports opaque static meshes; transparent/alpha-cutout meshes remain view/export-only. Alpha-texture-aware visibility is not implemented.
- Textured painting replaces the touched mesh's base-color texture only after explicit opt-in. It does not preserve/bake image details underneath vertex paint.
- Vertex colors do not require UVs. Fine marks require dense geometry; interpolation can extend visible color beyond the cursor within large triangles. There is no automatic subdivision/unwrap.
- BVH construction, projection and vertex scanning run on the main thread. Large-file interaction latency is not comprehensively benchmarked; workers/spatial indexing and code splitting remain potential improvements.
- Original resources are retained internally for future restoration, but there is no restore UI/history yet.
- Initial publication of milestones 1 and 2 is authorized. Check Git for the latest commit and push status; further milestone implementation still requires a user request.

## Proposed milestone 3 (not started)

1. Add explicit mesh selection and fill without changing other meshes.
2. Refactor PaintStroke's internal before-color/coverage data into a completed command with before/after deltas. Current `finish()` returns only a changed-vertex count and mesh name, which is insufficient for undo.
3. Record one command per stroke/fill, with a memory budget. Clear redo on a new edit; avoid accidental history entries for every pointer event. Account for geometry/material preparation, including texture replacement, when designing undo.
4. Add a versioned local project format containing the model/paint state, stable mesh IDs, and camera/brush settings. GLB export already preserves paint but does not save editor state. The project container format has not been selected; persistent undo history can be deferred.
5. Verify fill isolation, stroke-level undo/redo, redo invalidation, save → reload → reopen → continue painting, invalid project recovery, and GLB export after history operations. Keep the existing browser-only and local-resource guarantees.

After this, add STL, OBJ and local glTF bundles incrementally. Texture painting/UV atlas generation is a later detail-oriented path, not a requirement for the current vertex workflow.

Update this handoff after meaningful changes so future chats can distinguish implemented behavior, tested evidence, and proposed work.
