import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { errorMessage } from '../api/ApiError';
import { COLORS, WIDTHS, isMeaningful, renderAnnotations, strokeWidth, type Point, type Shape, type Tool } from '../lib/annotation';
import { canvasToJpeg, loadImage } from '../lib/image';

const TOOLS: { tool: Tool; label: string; title: string }[] = [
  { tool: 'pen', label: '✎', title: 'Freihand' },
  { tool: 'ellipse', label: '◯', title: 'Kreis / Ellipse' },
  { tool: 'rect', label: '▭', title: 'Rechteck' },
  { tool: 'arrow', label: '➚', title: 'Pfeil' },
  { tool: 'text', label: 'T', title: 'Text' },
];

/**
 * Full-screen annotation editor (canvas): freehand, ellipse, rectangle, arrow, text; four colors,
 * three stroke widths, undo/redo. The result is the flattened JPEG (only the annotated version is stored).
 */
export function PhotoAnnotator({ image, onSave, onCancel }: { image: Blob; onSave: (result: Blob) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [redo, setRedo] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [tool, setTool] = useState<Tool>('ellipse');
  const [color, setColor] = useState(COLORS[0].value);
  const [widthIdx, setWidthIdx] = useState(1);
  const [textAt, setTextAt] = useState<Point | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    loadImage(image).then(setImg).catch((e) => setError(errorMessage(e)));
  }, [image]);

  // Redraw once per animation frame while drawing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      if (ctx) renderAnnotations(ctx, img, draft ? [...shapes, draft] : shapes);
    });
  }, [img, shapes, draft]);

  const width = img ? strokeWidth(WIDTHS[widthIdx].factor, img.naturalWidth, img.naturalHeight) : 4;

  const toImagePoint = (e: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const commit = (shape: Shape) => {
    setShapes((s) => [...s, shape]);
    setRedo([]);
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = toImagePoint(e);
    if (tool === 'text') {
      setTextAt(p);
      setText('');
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft(tool === 'pen' ? { kind: 'pen', color, width, points: [p] } : { kind: tool, color, width, from: p, to: p });
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!draft) return;
    const p = toImagePoint(e);
    setDraft(draft.kind === 'pen' ? { ...draft, points: [...draft.points, p] } : draft.kind === 'text' ? draft : { ...draft, to: p });
  };

  const onUp = () => {
    if (draft && isMeaningful(draft)) commit(draft);
    setDraft(null);
  };

  const addText = () => {
    if (textAt && text.trim() && img) {
      commit({ kind: 'text', color, size: width * 7, at: textAt, text: text.trim() });
    }
    setTextAt(null);
  };

  const undo = () => {
    const last = shapes[shapes.length - 1];
    if (!last) return;
    setShapes(shapes.slice(0, -1));
    setRedo([...redo, last]);
  };

  const redoLast = () => {
    const last = redo[redo.length - 1];
    if (!last) return;
    setRedo(redo.slice(0, -1));
    setShapes([...shapes, last]);
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !img) return;
    setBusy(true);
    try {
      const ctx = canvas.getContext('2d');
      if (ctx) renderAnnotations(ctx, img, shapes);
      onSave(shapes.length ? await canvasToJpeg(canvas) : image);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="overlay annotator">
      <div className="annotator-toolbar">
        <div className="tool-group">
          {TOOLS.map((t) => (
            <button key={t.tool} type="button" title={t.title} aria-label={t.title}
              className={`tool ${tool === t.tool ? 'active' : ''}`} onClick={() => setTool(t.tool)}>{t.label}</button>
          ))}
        </div>
        <div className="tool-group">
          {COLORS.map((c) => (
            <button key={c.value} type="button" title={c.name} aria-label={c.name}
              className={`swatch ${color === c.value ? 'active' : ''}`} style={{ background: c.value }} onClick={() => setColor(c.value)} />
          ))}
        </div>
        <div className="tool-group">
          {WIDTHS.map((w, i) => (
            <button key={w.name} type="button" title={w.name} aria-label={`Strich ${w.name}`}
              className={`tool ${widthIdx === i ? 'active' : ''}`} onClick={() => setWidthIdx(i)}>
              <span className="width-dot" style={{ width: 4 + i * 5, height: 4 + i * 5 }} />
            </button>
          ))}
          <button type="button" className="tool" title="Rückgängig" aria-label="Rückgängig" disabled={!shapes.length} onClick={undo}>↶</button>
          <button type="button" className="tool" title="Wiederholen" aria-label="Wiederholen" disabled={!redo.length} onClick={redoLast}>↷</button>
        </div>
      </div>
      <div className="annotator-stage">
        {img ? (
          <canvas ref={canvasRef} width={img.naturalWidth} height={img.naturalHeight}
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
        ) : (
          <p className="hint">{error ?? 'Bild wird geladen …'}</p>
        )}
      </div>
      {textAt && (
        <div className="text-prompt">
          <input autoFocus value={text} placeholder="Text eingeben" onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addText()} />
          <button type="button" className="btn btn-primary" onClick={addText}>OK</button>
          <button type="button" className="btn" onClick={() => setTextAt(null)}>Abbrechen</button>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
      <div className="overlay-bar">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Abbrechen</button>
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy || !img}>
          {busy ? 'Speichert …' : 'Übernehmen'}
        </button>
      </div>
    </div>
  );
}
