import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import { Icon } from './components/Icon';
import type { IconName } from './components/Icon';
import { Viewport } from './components/Viewport';
import { useModel } from './hooks/useModel';
import type { BrushSettings, StrokeResult } from './paint/brush';
import { downloadGlb, exportGlb } from './model/exportGlb';

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
  const { model, loading, error, setError, openFile, resetSample } = useModel();
  const [navigation, setNavigation] = useState<'orbit' | 'pan'>('orbit');
  const [mode, setMode] = useState<'navigate' | 'paint'>('navigate');
  const [brush, setBrush] = useState<BrushSettings>({ color: swatches[0], size: 72, opacity: 1, replaceTextures: false });
  const [message, setMessage] = useState('Choose Paint, then drag on the model.');
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [background, setBackground] = useState(backgrounds[0].color);
  const [grid, setGrid] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [reset, setReset] = useState(0);
  const [zoom, setZoom] = useState({ direction: 0, sequence: 0 });
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const guide = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    setDirty(false);
    setMode('navigate');
    setMessage('Choose Paint, then drag on the model.');
  }, [model.id]);

  function navigate(tool: 'orbit' | 'pan') { setMode('navigate'); setNavigation(tool); }
  function paint() { setWireframe(false); setMode('paint'); }
  function stroked(result: StrokeResult) {
    if (result.vertices) {
      setDirty(true);
      setMessage(`Painted ${numbers.format(result.vertices)} vertices on ${result.mesh}. Export GLB to keep your colors.`);
    } else setMessage('No vertices under this brush. Try a larger size or a denser mesh.');
  }
  async function saveGlb() {
    setExporting(true);
    try {
      const buffer = await exportGlb(model);
      downloadGlb(buffer, model.name);
      setDirty(false);
      setMessage('GLB exported with vertex colors. Open the downloaded file to continue painting.');
    } catch (problem) {
      setMessage(`Export failed: ${problem instanceof Error ? problem.message : 'try again.'}`);
    } finally { setExporting(false); }
  }
  const canReplace = () => !dirty || window.confirm('Replace this model? Export a GLB first if you want to keep your painting.');
  function loadFile(file: File) { if (!exporting && canReplace()) void openFile(file); }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey || guide.current?.open || (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [contenteditable="true"]'))) return;
      if (event.key.toLowerCase() === 'r') { event.preventDefault(); setReset((n) => n + 1); }
      if (event.key.toLowerCase() === 'v') navigate('orbit');
      if (event.key.toLowerCase() === 'h') navigate('pan');
      if (event.key.toLowerCase() === 'b') paint();
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, []);

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
    if (event.dataTransfer.files.length !== 1) { setError('Drop one GLB model at a time.'); return; }
    loadFile(event.dataTransfer.files[0]);
  }

  return <div className="app" onDragEnter={enter} onDragLeave={leave} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }} onDrop={drop}>
    <header className="header">
      <div className="brand">
        <span className="brand-symbol"><Icon name="cube" size={25} /></span>
        <span>Poly<span className="brand-light">Palette</span><small>A little room for big ideas.</small></span>
      </div>
      <div className="header-center"><span className="status-dot" /> Local workspace</div>
      <div className="header-actions">
        <button className="button quiet" aria-label="Quick guide" onClick={() => guide.current?.showModal()}><Icon name="info" size={17} /><span>Quick guide</span></button>
        <button className="button" disabled={exporting} onClick={() => input.current?.click()}><Icon name="upload" size={18} /> Open model</button>
        <button className="button primary" disabled={exporting || !!loading} onClick={() => void saveGlb()}><Icon name="download" size={18} /> {exporting ? 'Exporting…' : 'Export GLB'}</button>
      </div>
      <input ref={input} type="file" accept=".glb,model/gltf-binary" className="file-input" aria-label="Choose a GLB model" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = '';
        if (file) loadFile(file);
      }} />
    </header>

    <main className="workspace">
      <nav className="toolbar" aria-label="Viewport tools">
        <div className="tool-group">
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
          <div className="scene-label"><Icon name="cube" size={17} /><span>{model.name}</span><span className="small-tag">{model.source === 'sample' ? 'Sample' : 'GLB'}</span></div>
          <span className="mode-label"><span /> {mode === 'paint' ? 'Paint mode' : navigation === 'orbit' ? 'Orbit mode' : 'Pan mode'}</span>
        </div>
        <div className={`viewport ${mode === 'paint' ? 'paint-cursor' : navigation === 'pan' ? 'pan-cursor' : ''}`} style={{ background }}>
          <Viewport model={model} background={background} grid={grid} wireframe={wireframe} navigation={navigation} reset={reset} zoom={zoom} mode={exporting || loading ? 'navigate' : mode} brush={brush} onStroke={stroked} onMessage={setMessage} />
          {mode === 'navigate' && <div className="viewport-note"><span className="eyebrow">YOUR NEXT CANVAS</span><p>A new perspective<br />starts here.</p></div>}
          <div className="navigation-hint"><Icon name={mode === 'paint' ? 'brush' : navigation === 'orbit' ? 'orbit' : 'hand'} size={16} /><span>{mode === 'paint' ? 'Drag to paint' : navigation === 'orbit' ? 'Drag to orbit' : 'Drag to pan'}</span><i /><span>{mode === 'paint' ? 'V to navigate' : 'Scroll to zoom'}</span><i /><span>{mode === 'paint' ? 'One mesh per stroke' : 'Right-drag to pan'}</span></div>
          {loading && <div className="loading-pill" role="status"><span className="spinner" /> Opening {loading}…</div>}
        </div>
        <div className="canvas-footer"><span><span className="status-dot" />{loading ? 'Opening local file' : dirty ? 'Paint changed · export to keep it' : 'Ready to create'}</span><span>Perspective <span className="footer-divider">/</span> Y up</span></div>
      </section>

      <aside className="inspector" aria-label="Model and viewport settings">
        <div className="panel-title"><span>Workspace</span><span className="phase-tag">02 / PAINT</span></div>
        <section className="inspector-section brush-settings">
          <div className="mode-switch" role="group" aria-label="Interaction mode">
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
          <div className="model-card"><div className="model-icon"><Icon name="cube" size={27} /></div><div><strong title={model.name}>{model.name}</strong><span>{model.source === 'sample' ? 'Built-in sample · ready to explore' : `Local GLB · ${((model.bytes ?? 0) / 1024 / 1024).toFixed(2)} MB`}</span></div></div>
          <dl className="model-stats">
            <div><dt>Meshes</dt><dd>{numbers.format(model.stats.meshes)}</dd></div>
            <div><dt>Triangles</dt><dd>{numbers.format(model.stats.triangles)}</dd></div>
            <div><dt>Vertices</dt><dd>{numbers.format(model.stats.vertices)}</dd></div>
            <div><dt>Meshes with UVs</dt><dd>{model.stats.meshesWithUVs} / {model.stats.meshes}</dd></div>
          </dl>
          <button className="text-button" disabled={exporting} onClick={() => { if (canReplace()) resetSample(); }}>Load the sample <Icon name="arrow" size={16} /></button>
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

    {error && <div className="error-toast" role="alert"><Icon name="info" /><div><strong>Couldn’t open that model</strong><p>{error}</p></div><button aria-label="Dismiss error" onClick={() => setError(null)}><Icon name="close" size={18} /></button></div>}
    {dragging && <div className="drop-overlay"><Icon name="upload" size={38} /><h2>Drop a little dimension.</h2><p>One self-contained .glb file · up to 50 MB</p></div>}
    <dialog ref={guide} className="guide-dialog">
      <button className="dialog-close" aria-label="Close guide" onClick={() => guide.current?.close()}><Icon name="close" /></button>
      <span className="eyebrow">WELCOME TO POLYPALETTE</span><h2>Find your way around.</h2>
      <p>Navigate to orbit, zoom, or pan. Switch to Paint, choose a color and drag on a visible surface. Painting disables camera gestures; use the zoom buttons or switch back to Navigate.</p>
      <dl><div><dt><kbd>B</kbd></dt><dd>Paint tool</dd></div><div><dt><kbd>V</kbd></dt><dd>Orbit tool</dd></div><div><dt><kbd>H</kbd></dt><dd>Pan tool</dd></div><div><dt><kbd>R</kbd></dt><dd>Reset and fit the model</dd></div></dl>
      <h3>Bring your own model</h3><p>Open or drop an uncompressed, self-contained GLB 2.0 file, up to 50 MB and 2 million triangles. Embedded PNG/JPEG textures work. This milestone supports static meshes; animations, skins, morph targets, instancing, compressed assets, OBJ, and STL will come later.</p>
      <p>Export GLB downloads your model with its vertex colors. Reopen it to continue painting. A sparse mesh, such as <a href="/examples/color-cube.glb" download>this tiny color-cube GLB</a>, needs a large brush to reach its vertices. Textured meshes require the explicit replacement option; transparent meshes are view-only for now.</p>
      <p>There is no undo or automatic saving yet. Export to keep your work before closing this page. Fill, undo/redo, and editable project files are the next milestone.</p>
      <button className="button primary" onClick={() => guide.current?.close()}>Let’s explore <Icon name="arrow" size={17} /></button>
    </dialog>
  </div>;
}
