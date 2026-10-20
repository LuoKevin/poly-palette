# Milestone 3: select, edit, and save

Implemented on 2026-10-20. PolyPalette now supports explicit mesh selection, whole-mesh fill, stroke/fill undo and redo, and local editable projects. Everything stays in the browser.

## Run

Use Node 22.12+ (verification used 22.22.0):

```sh
cd /Users/kevinluo/Documents/Projects/poly-palette
npm ci
npm run dev
```

Open http://127.0.0.1:5173. If occupied, reuse the running server or run `npm run dev -- --port 5174`. The milestone 3 browser verification used port 5174.

```sh
npm test
npm run build
```

## Editing

- **S / Select**: click a mesh in the viewport. A purple bounding box identifies its extent. Click empty space to deselect. The **Selected mesh** list can also select hidden or small meshes.
- **F / Fill selected mesh**: blend the current color and opacity across every vertex of that mesh, including the back. Shared geometry and materials are isolated first, so other meshes retain their appearance.
- **B / Paint**: brush only visible vertices on the first mesh touched. Brush size affects strokes; it does not limit a fill.
- **⌘/Ctrl Z**: undo one complete stroke or fill. **⌘/Ctrl Shift Z** or **Ctrl Y**: redo. These shortcuts leave text fields alone. A new edit after undo discards redo.
- **Save project / ⌘/Ctrl S**: download a `.polypalette` file. **Open project** or drag/drop restores it. **Export GLB** still downloads a model for other 3D tools.

The first paint/fill operation may clone geometry, bake material tint into colors, and replace an opted-in base-color texture. These changes belong to the same undo command. Undoing the first edit restores the original geometry, materials, and texture; redoing it restores the paintable version. A brush that misses all vertices does not remove a texture. Transparent/cutout meshes remain view/export-only.

**Graphics concept:** a mesh is geometry plus material. Undoing RGB values alone would leave a replaced texture missing. History therefore stores color deltas and, for the first edit, both geometry/material states. Each stroke commits once, regardless of how many pointer events it contains. React receives a completion update, rather than one update per vertex.

## History and resources

`EditHistory` retains up to 100 commands within an estimated 64 MiB budget for color deltas, retained geometry arrays, and texture pixels. Oldest commands are evicted first. A single edit larger than the budget still applies, clears earlier history, and displays a message that it cannot be undone. The estimate is not a hard limit on all JavaScript, BVH, or GPU allocations.

History-only geometry/materials/textures are released when discarded, preserving resources still shared by the current model. Replacing a model disposes its current and retained resources. Selection, camera, and brush settings are saved with a project but do not create undo commands.

## Project format version 1

A `.polypalette` file is UTF-8 JSON with `format: "PolyPalette"`, `version: 1`, model name, embedded scene, and editor settings. The scene uses Three.js's native serialization with explicit BufferGeometry. This preserves names, material groups, stable `userData.polyPaletteId` mesh IDs, local transforms, vertex colors, and embedded textures. GLB can split a multi-material mesh into separate primitives when reopened; native project serialization avoids that change to mesh identity.

The editor section contains selected mesh ID, camera position and orbit target, interaction/navigation mode, brush color/size/opacity/texture option, background, grid, and wireframe. Viewer normalization, selection boxes, lights and grid are excluded from the model data. Wireframe display overrides are kept out of saved materials. Camera resizing preserves the view; Reset view fits it again. Orbit damping is disabled so the saved camera has no pending inertial motion.

The loader validates version, editor settings, selection, and model limits. Only explicit buffer geometry and embedded image resources are accepted; external image references are rejected before scene loading, with a loading-manager guard as a second boundary. Projects are capped at 100 MiB and the existing 2-million-triangle limit. This is not a performance guarantee. JSON projects are larger than GLBs (the verified sample was about 2.34 MiB).

Undo history is session-only and starts empty on reopening. There is no autosave or crash recovery. Save project marks the current model/settings snapshot saved; further edits or settings changes mark it dirty. GLB export does not clear that project indicator. Model replacement asks before discarding unsaved changes, and a browser unload warning protects them where supported. Invalid files leave the existing workspace and history intact.

## Verification performed

- `npm test`: **36 tests in 6 files passed**. Coverage includes full-stroke undo, fills, shared-resource isolation, texture restoration, multi-material geometry/statistics restoration, redo invalidation, resource release, memory-budget behavior, no-op edits, exact project colors/groups/IDs, embedded texture pixels, invalid versions/settings/selection and external images.
- The real GLTFExporter/GLTFLoader test now exports after fill undo/redo and checks every color component.
- Browser verification exercised viewport and list selection, isolated body/arm fills, a brush stroke, undo/redo buttons/shortcuts, new-edit redo invalidation, save/download, reload, reopen, continued painting, invalid project recovery with history retained, texture opt-in/fill/undo restoration, and GLB export/reopening after history operations.
- The two actual browser project downloads matched all **12 mesh IDs, names, local matrices, geometry arrays and editor settings exactly**, including a changed camera, 116 px brush, 50% opacity, selected arm, background and disabled grid.
- The browser GLB exported after history operations matched **8,631 RGB vertices** exactly against the project file across Body, Face and Right arm. See [comparison evidence](verification/milestone-3-roundtrip.json).
- No browser console errors were observed. Three.js emits an existing Clock deprecation warning; tests retain a CommonJS dependency warning. The production graphics chunk remains large (about 369 kB gzip).

## Short manual checklist

1. Select the sample's Body with **S**, choose a color, and press **F**. The arms/face should remain unchanged.
2. Paint a stroke, undo twice, and redo twice. Undo again, make a new fill, and verify Redo is disabled.
3. Change brush size/opacity, background, grid and camera angle. Save project, reload, open that file, and verify all settings and colors return. Continue painting.
4. Open an invalid `.polypalette` file. Dismiss the error and verify the current model and undo history still work.
5. Fill a textured mesh with replacement enabled. Undo should restore its texture. Export GLB after undo/redo, reopen it, and verify colors and proportions.

STL/OBJ/local glTF bundles, automatic recovery, and higher-detail painting remain future work.
