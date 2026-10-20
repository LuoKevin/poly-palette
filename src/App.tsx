import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { Icon } from './components/Icon';
import type { IconName } from './components/Icon';
import { Viewport } from './components/Viewport';
import { useModel } from './hooks/useModel';
import type { BrushSettings, StrokeResult } from './paint/brush';
import { downloadGlb, exportGlb } from './model/exportGlb';
import { EditHistory } from './paint/history';
import { fillMesh, modelMeshes } from './paint/fill';
import { downloadProject, serializeProject } from './project/project';
import type { CameraState, EditorState } from './project/project';

const swatches = ['#e8606b', '#ee9944', '#f0ce58', '#65ad8b', '#4e9cda', '#9565d4', '#f6f0e5', '#343442'];

const backgrounds = [
  { name: 'Warm paper', color: '#eeede7' },
  { name: 'Soft lilac', color: '#e9e3ef' },
  { name: 'Slate', color: '#353d4b' },
];
const numbers = new Intl.NumberFormat('en-US');

function Tool({ icon, label, active, onClick }: { icon: IconName; label: string; active?: boolean; onClick: () => void }) {
  return <button className={`tool-button ${active ? 'is-active' : ''}`} aria-label={label} title={label} aria-pressed={active} onClick={onClick}><Icon name={icon} /><span className="tool-tooltip">{label}</span></button>;
}

export function App() {
  const document = useModel();
  return <Editor key={document.model.id} {...document} />;
}

function Editor({ model, loading, error, setError, openFile, resetSample }: ReturnType<typeof useModel>) {
  const initial = model.editor;
  const [navigation, setNavigation] = useState<'orbit' | 'pan'>(initial?.navigation ?? 'orbit');
  const [mode, setMode] = useState<EditorState['mode']>(initial?.mode ?? 'navigate');
  const [brush, setBrush] = useState<BrushSettings>(initial?.brush ?? { color: swatches[0], size: 72, opacity: 1, replaceTextures: false });
  const [message, setMessage] = useState(initial ? 'Project reopened. Ready to continue editing; history starts fresh.' : 'Choose Select to pick a mesh, or Paint to brush the surface.');
  const [exporting, setExporting] = useState(false);
  const [background, setBackground] = useState(initial?.background ?? backgrounds[0].color);
  const [grid, setGrid] = useState(initial?.grid ?? true);
  const [wireframe, setWireframe] = useState(initial?.wireframe ?? false);
  const [selectedId, setSelectedId] = useState<string | null>(initial?.selectedId ?? null);
  const selection = useRef(selectedId);
  selection.current = selectedId;
  const [camera, setCamera] = useState<CameraState | null>(null);
  const [history] = useState(() => new EditHistory());
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState<string | null>(null);
  const [reset, setReset] = useState(0);
  const [zoom, setZoom] = useState({ direction: 0, sequence: 0 });
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const guide = useRef<HTMLDialogElement>(null);
  const finishStroke = useRef<(() => void) | null>(null);
  const readCamera = useRef<(() => CameraState) | null>(null);
  const busy = exporting || !!loading;
  const meshes = modelMeshes(model);
  const selected = meshes.find((mesh) => mesh.userData.polyPaletteId === selectedId);
  const settings = (view = readCamera.current?.() ?? camera): EditorState => {
    if (!view) throw new Error('Wait for the 3D view to finish opening.');
    return { brush, mode, navigation, background, grid, wireframe, selectedId: selection.current, camera: view };
  };
  const signature = camera ? JSON.stringify({ edit: history.current, ...settings(camera) }) : null;
  const dirty = saved !== null && signature !== saved;
  useEffect(() => { if (saved === null && signature !== null) setSaved(signature); }, [saved, signature]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function navigate(tool: 'orbit' | 'pan') { finishStroke.current?.(); setMode('navigate'); setNavigation(tool); }
  function paint() { finishStroke.current?.(); setWireframe(false); setMode('paint'); }
  function select() { finishStroke.current?.(); setMode('select'); }
  function recordEdit(result: StrokeResult, action = 'Painted') {
    selection.current = result.meshId;
    setSelectedId(result.meshId);
    if (result.command) {
      const retained = history.push(result.command);
      setRevision((value) => value + 1);
      setMessage(`${action} ${numbers.format(result.vertices)} vertices on ${result.mesh}.${retained ? '' : ' This edit exceeded the 64 MB history budget; earlier history was cleared and this edit cannot be undone.'}`);
    } else setMessage('No colors changed. Try a larger brush or a different color.');
  }
  function fill() {
    if (busy || !selected) return;
    finishStroke.current?.();
    try { recordEdit(fillMesh(model, selected, brush), 'Filled'); setWireframe(false); }
    catch (problem) { setMessage(problem instanceof Error ? problem.message : 'This mesh could not be filled.'); }
  }
  function travel(direction: 'undo' | 'redo') {
    if (busy) return;
    finishStroke.current?.();
    const label = history[direction]();
    if (label) { setRevision((value) => value + 1); setMessage(`${direction === 'undo' ? 'Undid' : 'Redid'}: ${label}.`); }
  }
  async function save(project: boolean) {
    if (busy) return;
    finishStroke.current?.();
    setExporting(true);
    try {
      if (project) {
        const editor = settings();
        const snapshot = JSON.stringify({ edit: history.current, ...editor });
        const blob = await serializeProject(model, editor);
        downloadProject(blob, model.name);
        setSaved(snapshot);
        setMessage('Project saved with model, selection, camera, and brush settings. Session undo history is not included.');
      } else {
        downloadGlb(await exportGlb(model), model.name);
        setMessage('GLB exported with vertex colors. Save a project to also keep your editor settings.');
      }
    } catch (problem) { setMessage(`Save failed: ${problem instanceof Error ? problem.message : 'try again.'}`); }
    finally { setExporting(false); }
  }
  function canReplace() {
    finishStroke.current?.();
    const current = camera ? JSON.stringify({ edit: history.current, ...settings() }) : null;
    return saved === null || current === saved || window.confirm('Replace this workspace? Save a project first to keep your edits and settings.');
  }
  function loadFile(file: File) { if (!busy && canReplace()) void openFile(file); }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (busy || event.altKey || guide.current?.open || (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [contenteditable="true"]'))) return;
      const key = event.key.toLowerCase();
      if (event.ctrlKey || event.metaKey) {
        if (key === 'z') { event.preventDefault(); travel(event.shiftKey ? 'redo' : 'undo'); }
        if (key === 'y') { event.preventDefault(); travel('redo'); }
        if (key === 's') { event.preventDefault(); void save(true); }
        return;
      }
      if (key === 'r') { event.preventDefault(); finishStroke.current?.(); setReset((n) => n + 1); }
      if (key === 'v') navigate('orbit');
      if (key === 'h') navigate('pan');
      if (key === 'b') paint();
      if (key === 's') select();
      if (key === 'f') fill();
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  function enter(event: DragEvent) {
    event.preventDefault();
    if (!event.dataTransfer.types.includes('Files')) return;
    dragDepth.current++;
    setDragging(true);
  }
  function leave(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (!dragDepth.current) setDragging(false);
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (event.dataTransfer.files.length !== 1) { setError('Drop one GLB model or PolyPalette project at a time.'); return; }
    loadFile(event.dataTransfer.files[0]);
  }

  return <div className="app" onDragEnter={enter} onDragLeave={leave} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }} onDrop={drop}>
    <header className="header">
      <div className="brand">
        <span className="brand-symbol"><Icon name="cube" size={25} /></span>
        <span>Poly<span className="brand-light">Palette</span><small>A little room for big ideas.</small></span>
      </div>

      <div className="header-actions">
        <button className="button quiet" aria-label="Quick guide" onClick={() => guide.current?.showModal()}><Icon name="info" size={17} /><span>Quick guide</span></button>
        <button className="button" disabled={busy} onClick={() => input.current?.click()}><Icon name="upload" size={18} /> Open model</button>
        <button className="button" disabled={busy} onClick={() => projectInput.current?.click()}>Open project</button>
        <button className="button" disabled={busy} onClick={() => void save(false)}><Icon name="download" size={18} /> Export GLB</button>
        <button className="button primary" disabled={busy} onClick={() => void save(true)}>{exporting ? 'Saving…' : 'Save project'}</button>
      </div>
      <input ref={input} type="file" accept=".glb,model/gltf-binary" className="file-input" aria-label="Choose a GLB model" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) loadFile(file);
      }} />
      <input ref={projectInput} type="file" accept=".polypalette" className="file-input" aria-label="Choose a PolyPalette project" onChange={(event) => {
        const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) loadFile(file);
      }} />
    </header>

    <main className="workspace">
      <nav className="toolbar" aria-label="Viewport tools">
        <div className="tool-group">
          <Tool icon="select" label="Select mesh (S)" active={mode === 'select'} onClick={select} />
          <Tool icon="brush" label="Paint (B)" active={mode === 'paint'} onClick={paint} />
          <Tool icon="orbit" label="Orbit (V)" active={mode === 'navigate' && navigation === 'orbit'} onClick={() => navigate('orbit')} />
          <Tool icon="hand" label="Pan (H)" active={mode === 'navigate' && navigation === 'pan'} onClick={() => navigate('pan')} />
        </div>
        <div className="tool-separator" />
        <div className="tool-group">
          <Tool icon="plus" label="Zoom in" onClick={() => setZoom((z) => ({ direction: 1, sequence: z.sequence + 1 }))} />
          <Tool icon="minus" label="Zoom out" onClick={() => setZoom((z) => ({ direction: -1, sequence: z.sequence + 1 }))} />
          <Tool icon="fit" label="Reset view (R)" onClick={() => setReset((n) => n + 1)} />
        </div>
        <span className="toolbar-bottom"><Icon name="cube" size={19} /></span>
      </nav>

      <section className="canvas-panel" aria-label="Model workspace">
        <div className="canvas-heading">
          <div className="scene-label"><Icon name="cube" size={17} /><span>{model.name}</span><span className="small-tag">{model.source === 'sample' ? 'Sample' : model.source === 'project' ? 'Project' : 'GLB'}</span></div>
          <span className="mode-label"><span /> {mode === 'select' ? 'Select mode' : mode === 'paint' ? 'Paint mode' : navigation === 'orbit' ? 'Orbit mode' : 'Pan mode'}</span>
        </div>
        <div className={`viewport ${mode !== 'navigate' ? 'paint-cursor' : navigation === 'pan' ? 'pan-cursor' : ''}`} style={{ background }}>
          <Viewport model={model} background={background} grid={grid} wireframe={wireframe} navigation={navigation} reset={reset} zoom={zoom} mode={mode} busy={busy} brush={brush} onStroke={recordEdit} onMessage={setMessage} revision={revision} selectedId={selectedId} onSelect={setSelectedId} initialCamera={initial?.camera} onCamera={(view) => setCamera((previous) => JSON.stringify(previous) === JSON.stringify(view) ? previous : view)} readCamera={readCamera} finishStroke={finishStroke} />
          {mode === 'navigate' && <div className="viewport-note"><span className="eyebrow">YOUR NEXT CANVAS</span><p>A new perspective<br />starts here.</p></div>}
          <div className="navigation-hint"><Icon name={mode === 'paint' ? 'brush' : navigation === 'orbit' ? 'orbit' : 'hand'} size={16} /><span>{mode === 'select' ? 'Click a mesh to select' : mode === 'paint' ? 'Drag to paint' : navigation === 'orbit' ? 'Drag to orbit' : 'Drag to pan'}</span><i /><span>{mode !== 'navigate' ? 'V to navigate' : 'Scroll to zoom'}</span><i /><span>{mode === 'select' ? 'F to fill' : mode === 'paint' ? 'One mesh per stroke' : 'Right-drag to pan'}</span></div>
          {loading && <div className="loading-pill" role="status"><span className="spinner" /> Opening {loading}…</div>}
        </div>
        <div className="canvas-footer"><span><span className="status-dot" />{loading ? 'Opening local file' : dirty ? 'Unsaved project changes' : 'Project up to date'}</span><span>Perspective <span className="footer-divider">/</span> Y up</span></div>
      </section>

      <aside className="inspector" aria-label="Model and viewport settings">
        <div className="panel-title"><span>Workspace</span><span className="phase-tag">03 / EDIT</span></div>
        <section className="inspector-section edit-settings">
          <h2>Edit</h2>
          <div className="history-actions">
            <button className="button" disabled={busy || !history.undoLabel} title={history.undoLabel} onClick={() => travel('undo')}>↶ Undo</button>
            <button className="button" disabled={busy || !history.redoLabel} title={history.redoLabel} onClick={() => travel('redo')}>↷ Redo</button>
          </div>
          <p className="brush-help">⌘ / Ctrl Z to undo · Shift Z to redo</p>
          <label className="mesh-label" htmlFor="selected-mesh">Selected mesh</label>
          <select id="selected-mesh" value={selectedId ?? ''} disabled={busy} onChange={(event) => { finishStroke.current?.(); setSelectedId(event.target.value || null); }}>
            <option value="">None selected</option>
            {meshes.map((mesh, i) => <option key={mesh.userData.polyPaletteId} value={mesh.userData.polyPaletteId}>{mesh.name || `Mesh ${i + 1}`}</option>)}
          </select>
          <button className="button full-width" disabled={busy || !selected} onClick={fill}><Icon name="fill" size={16} /> Fill selected mesh <kbd>F</kbd></button>
          <p className="brush-help">Fill uses the current color and opacity on the entire mesh, including its hidden side.</p>
        </section>
        <section className="inspector-section brush-settings">
          <div className="mode-switch" role="group" aria-label="Interaction mode">
            <button aria-pressed={mode === 'select'} onClick={select}><Icon name="select" size={16} /> Select</button>
            <button aria-pressed={mode === 'navigate'} onClick={() => navigate('orbit')}><Icon name="orbit" size={16} /> Navigate</button>
            <button aria-pressed={mode === 'paint'} onClick={paint}><Icon name="brush" size={16} /> Paint</button>
          </div>
          <h2>Brush</h2>
          <label className="color-picker"><span>Color</span><input aria-label="Brush color" type="color" value={brush.color} onInput={(event) => setBrush({ ...brush, color: event.currentTarget.value })} onChange={(event) => setBrush({ ...brush, color: event.target.value })} /><code>{brush.color.toUpperCase()}</code></label>
          <div className="paint-swatches" role="group" aria-label="Preset paint colors">{swatches.map((color) => <button key={color} aria-label={`Paint color ${color}`} aria-pressed={brush.color === color} className={brush.color === color ? 'selected' : ''} style={{ backgroundColor: color }} onClick={() => setBrush({ ...brush, color })} />)}</div>
          <label className="slider-label"><span>Brush size <output>{brush.size} px</output></span><input aria-label="Brush size" type="range" min="8" max="240" step="2" value={brush.size} onChange={(event) => setBrush({ ...brush, size: Number(event.target.value) })} /></label>
          <label className="slider-label"><span>Opacity <output>{Math.round(brush.opacity * 100)}%</output></span><input aria-label="Brush opacity" type="range" min="5" max="100" step="5" value={Math.round(brush.opacity * 100)} onChange={(event) => setBrush({ ...brush, opacity: Number(event.target.value) / 100 })} /></label>
          <p className="brush-help">Soft edge · visible vertices only. Detail depends on mesh density. Each stroke stays on its first mesh.</p>
          <details className="paint-options"><summary>Textured models</summary><label><input type="checkbox" checked={brush.replaceTextures} onChange={(event) => setBrush({ ...brush, replaceTextures: event.target.checked })} /> Replace base-color textures</label><p>On the first stroke, remove the touched mesh’s color texture and paint its base tint instead. Other meshes keep their textures.</p></details>
          <p className="paint-status" role="status">{message}</p>
        </section>
        <section className="inspector-section">
          <h2>Your model</h2>
          <div className="model-card"><div className="model-icon"><Icon name="cube" size={27} /></div><div><strong title={model.name}>{model.name}</strong><span>{model.source === 'sample' ? 'Built-in sample · ready to explore' : `${model.source === 'project' ? 'Local project' : 'Local GLB'} · ${((model.bytes ?? 0) / 1024 / 1024).toFixed(2)} MB`}</span></div></div>
          <dl className="model-stats">
            <div><dt>Meshes</dt><dd>{numbers.format(model.stats.meshes)}</dd></div>
            <div><dt>Triangles</dt><dd>{numbers.format(model.stats.triangles)}</dd></div>
            <div><dt>Vertices</dt><dd>{numbers.format(model.stats.vertices)}</dd></div>
            <div><dt>Meshes with UVs</dt><dd>{model.stats.meshesWithUVs} / {model.stats.meshes}</dd></div>
          </dl>
          <button className="text-button" disabled={busy} onClick={() => { if (canReplace()) resetSample(); }}>Load the sample <Icon name="arrow" size={16} /></button>
        </section>
        <section className="inspector-section">
          <h2>Viewport</h2>
          <div className="setting-label">Background</div>
          <div className="background-options" role="group" aria-label="Viewport background">
            {backgrounds.map((item) => <button key={item.color} className={`background-swatch ${background === item.color ? 'selected' : ''}`} style={{ '--swatch': item.color } as CSSProperties} aria-label={item.name} title={item.name} aria-pressed={background === item.color} onClick={() => setBackground(item.color)}>{background === item.color && <Icon name="check" size={16} />}</button>)}
            <span>{backgrounds.find((item) => item.color === background)?.name}</span>
          </div>
          <label className="toggle-row"><span><Icon name="grid" size={17} /> Floor grid</span><input type="checkbox" role="switch" checked={grid} onChange={(event) => setGrid(event.target.checked)} /><span className="toggle" /></label>
          <label className="toggle-row"><span><Icon name="cube" size={17} /> Wireframe</span><input type="checkbox" role="switch" checked={wireframe} onChange={(event) => setWireframe(event.target.checked)} /><span className="toggle" /></label>
          <button className="button full-width" onClick={() => setReset((n) => n + 1)}><Icon name="fit" size={17} /> Reset view <kbd>R</kbd></button>
        </section>
        <div className="local-note"><Icon name="shield" size={17} /><span>Your models stay in your browser.<br />No uploads. No account needed.</span></div>
      </aside>
    </main>

    {error && <div className="error-toast" role="alert"><Icon name="info" /><div><strong>Couldn’t open that file</strong><p>{error}</p></div><button aria-label="Dismiss error" onClick={() => setError(null)}><Icon name="close" size={18} /></button></div>}
    {dragging && <div className="drop-overlay"><Icon name="upload" size={38} /><h2>Drop a little dimension.</h2><p>One .glb (50 MB) or .polypalette project (100 MB)</p></div>}
    <dialog ref={guide} className="guide-dialog">
      <button className="dialog-close" aria-label="Close guide" onClick={() => guide.current?.close()}><Icon name="close" /></button>
      <span className="eyebrow">WELCOME TO POLYPALETTE</span><h2>Find your way around.</h2>
      <p>Navigate to orbit, zoom, or pan. Switch to Paint, choose a color and drag on a visible surface. Painting disables camera gestures; use the zoom buttons or switch back to Navigate.</p>
      <dl><div><dt><kbd>B</kbd></dt><dd>Paint tool</dd></div><div><dt><kbd>V</kbd></dt><dd>Orbit tool</dd></div><div><dt><kbd>H</kbd></dt><dd>Pan tool</dd></div><div><dt><kbd>R</kbd></dt><dd>Reset and fit the model</dd></div></dl>
      <h3>Bring your own model</h3><p>Open or drop an uncompressed, self-contained GLB 2.0 file, up to 50 MB and 2 million triangles. Embedded PNG/JPEG textures work. This milestone supports static meshes; animations, skins, morph targets, instancing, compressed assets, OBJ, and STL will come later.</p>
      <p>Export GLB downloads your model with its vertex colors. Reopen it to continue painting. A sparse mesh, such as <a href="/examples/color-cube.glb" download>this tiny color-cube GLB</a>, needs a large brush to reach its vertices. Textured meshes require the explicit replacement option; transparent meshes are view-only for now.</p>
      <p>Select a mesh with S or the mesh list, then press F to fill it. Undo/redo restores one stroke or fill at a time (⌘/Ctrl Z, Shift Z). Save project (⌘/Ctrl S) keeps your model, selection, brush, camera, and display settings in a local .polypalette file. Open project restores them; undo history starts fresh. There is no automatic saving.</p>
      <button className="button primary" onClick={() => guide.current?.close()}>Let’s explore <Icon name="arrow" size={17} /></button>
    </dialog>
  </div>;
}
