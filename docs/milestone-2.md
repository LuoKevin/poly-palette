# Milestone 2: paint, export, reopen

The browser application now paints vertex colors on opaque static meshes and exports a self-contained GLB. There is no backend. Fill, undo/redo, texture painting, and project files remain later work.

## Run

```sh
cd /Users/kevinluo/Documents/Projects/poly-palette
npm ci
npm run dev
```

Open http://127.0.0.1:5173. If the existing development server is running, use that tab. Run checks with:

```sh
npm test
npm run build
```

## The graphics path

**Raycasting** sends a mathematical ray from the camera through the pointer. Its first triangle intersection chooses the mesh for the stroke. The brush uses CSS pixels, independent of screen pixel density. Vertices are transformed from their mesh's local coordinates into world space, then projected through the camera onto the screen. Their distance to the pointer segment determines brush coverage, so a fast drag does not leave gaps between individual pointer events.

**Visibility** matters separately from distance. A vertex inside the brush circle might belong to the back of a model or lie behind another mesh. The brush checks surface orientation, then casts a ray from the camera toward each candidate vertex. Any earlier surface blocks painting. A [BVH](https://github.com/gkjohnson/three-mesh-bvh) is a hierarchy of bounding boxes that makes those intersection queries faster. Results are cached for the duration of a stroke, during which camera gestures are disabled.

**Vertex colors** are float RGB attributes on geometry. The GPU interpolates them across triangles. This needs no UV coordinates, but detailed marks need closely spaced vertices. The sample's body and arms now have extra rows of vertices so the straight portions paint as smoothly as the curved parts. Imported meshes are not silently subdivided. At very low density, a brush can miss every vertex or a colored vertex can tint a triangle beyond the cursor footprint. Visibility checks stop hidden vertices from being modified; they cannot add sub-triangle paint resolution.

**Color space and opacity:** CSS picker colors are interpreted as sRGB and converted by Three.js into its linear working space. Blending uses `original + (brush - original) * coverage` in that space. Coverage combines opacity with soft edge falloff. Each vertex retains its largest coverage during the stroke, preventing repeated pointer events from darkening a stationary mark. A new stroke can add another layer. Opacity blends color; it does not make the model transparent. Lighting and tone mapping mean a lit surface will not always look identical to the flat picker swatch.

**Materials and ownership:** base material color and existing vertex color multiply. Preparation bakes that tint into the color attribute and sets the cloned material's base color to white. Shared geometry and materials are copied so other meshes do not change. Material groups retain their individual colors. Normal/roughness properties remain on the cloned material. A base-color texture would also multiply the paint, so painting a textured mesh requires enabling the explicit replacement option; only the touched mesh loses its base-color map. Transparent and alpha-cutout meshes are currently view/export-only.

**Export:** [GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html) writes the geometry's colors into glTF's `COLOR_0` attribute. The GLB includes the asset's local transforms and materials. Export starts at a detached copy of the asset root, excluding the viewport normalization wrapper, camera, lights, and grid. Reopening restores real editable vertex data rather than a rendered picture.

## Main files

- `src/paint/brush.ts`: screen-space coverage, occlusion, per-stroke color blending.
- `src/paint/prepareMesh.ts`: material preparation and shared-resource isolation.
- `src/components/PaintInteraction.tsx`: pointer capture, cursor, mode/cancellation cleanup.
- `src/model/exportGlb.ts`: binary export and browser download.
- `src/App.tsx`: controls, status, import/export actions, replacement confirmation.
- `src/paint/brush.test.ts` and `src/model/exportGlb.test.ts`: behavioral and round-trip tests.

## Manual verification checklist

1. Select **Paint** or press **B**. Choose a swatch and drag across the robot's body. The camera must stay still, and the circular cursor should match the size control.
2. Change size, pick a custom color, and paint another mesh. At 50% opacity a stroke should blend with the old color. Repeated movement over the same spot within one stroke should not keep darkening it; a second stroke should add color.
3. Press **V** and rotate the model. Navigation must not add paint. The opposite side should retain its original colors. Use **R** to restore the view.
4. Click **Export GLB**, then **Open model** and select the downloaded file. Check that the painted patches and proportions match. Switch to Paint and add another stroke to confirm editability.
5. Import the bundled color cube, which has no UVs. Paint near a visible corner with a large brush. Its sparse geometry illustrates the detail limit.
6. On a textured model, attempt a stroke with texture replacement off: expect an explanation and no change. Enable **Textured models → Replace base-color textures**, then paint; only that mesh's base-color texture should be replaced.
7. Start a stroke and release outside the viewport, or switch modes mid-stroke. Returning to the viewport must not leave the brush stuck on.

There is no undo or automatic persistence yet. Export before closing or replacing a painted model. The replacement confirmation protects unsaved painting when opening another model or loading the sample.

## Verification performed

All 26 tests passed, including opaque occlusion across a 0.001-unit gap, back-surface exclusion, shared resources, per-material initialization, UV-less painting, transformed meshes, event-independent opacity, and exact color-buffer equality through the actual GLTFExporter/GLTFLoader pair. The test also repaints the reopened model.

In the browser, painted the sample's Body, Face, and Right arm using two swatches, a custom picker color, two brush sizes, and 50%/100% opacity. Switched to Navigate and checked rotation without painting. Exported, reopened, and re-exported the model. An independent loader comparison matched all **8,631 color vertices** across the three painted meshes and the world transforms of all **12 meshes** exactly. See [the comparison record](verification/roundtrip.json) and [the exported model](verification/painted-buddy.glb).

The production build passes. Vite still reports a large initial graphics bundle (~365 kB gzip); code splitting is a later loading optimization. These checks do not establish interactive performance on every 2-million-triangle input. BVH construction and vertex scanning still run on the main thread in this milestone.
