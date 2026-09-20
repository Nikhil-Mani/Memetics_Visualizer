import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

type Size = { width?: number; height: number };
const PREFIX = 'drift-panel-v1:';
export function resetPanelLayout() { window.dispatchEvent(new Event('drift-reset-layout')); }

/** Independent panel dimensions; resizing never remounts its simulation content. */
export default function ResizablePanel({ id, title, number, width, height, children, minHeight = 220 }: {
  id: string; title: string; number: string; width: string; height: number; children: ReactNode; minHeight?: number;
}) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; width: number; height: number; axis: 'width' | 'height' | 'both' } | null>(null);
  const [size, setSize] = useState<Size>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFIX + id) ?? 'null');
      if (saved && Number.isFinite(saved.height) && saved.height >= minHeight && saved.height <= 1800 &&
        (saved.width === undefined || (Number.isFinite(saved.width) && saved.width >= 260 && saved.width <= 4000))) return saved;
    } catch { /* Storage is optional in private browsing. */ }
    return { height };
  });
  useEffect(() => {
    try { localStorage.setItem(PREFIX + id, JSON.stringify(size)); } catch { /* Keep in-memory layout. */ }
  }, [id, size]);
  useEffect(() => {
    const reset = () => setSize({ height });
    window.addEventListener('drift-reset-layout', reset);
    return () => window.removeEventListener('drift-reset-layout', reset);
  }, [height]);
  const apply = (w: number, h: number, axis: 'width' | 'height' | 'both') => {
    const available = panel.current?.parentElement?.clientWidth ?? window.innerWidth;
    setSize(previous => ({
      width: axis === 'height' ? previous.width : Math.max(Math.min(260, available), Math.min(available, w)),
      height: axis === 'width' ? previous.height : Math.max(minHeight, Math.min(1800, h)),
    }));
  };
  const handle = (axis: 'width' | 'height' | 'both') => <button
    type="button" className={`resize-handle resize-${axis}`} aria-label={`Resize ${title} ${axis === 'both' ? 'width and height' : axis}`}
    title="Drag to resize. Arrow keys adjust by 20px; Shift for 60px. Double-click to reset."
    onDoubleClick={() => setSize({ height })}
    onPointerDown={e => {
      if (e.button !== 0 || !panel.current) return;
      e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
      const rect = panel.current.getBoundingClientRect();
      drag.current = { x: e.clientX, y: e.clientY, width: rect.width, height: rect.height, axis };
    }}
    onPointerMove={e => {
      const start = drag.current;
      if (start) apply(start.width + e.clientX - start.x, start.height + e.clientY - start.y, start.axis);
    }}
    onPointerUp={e => { drag.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={() => { drag.current = null; }}
    onLostPointerCapture={() => { drag.current = null; }}
    onKeyDown={e => {
      if (!panel.current || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'Home') { setSize({ height }); return; }
      const rect = panel.current.getBoundingClientRect(), step = e.shiftKey ? 60 : 20;
      apply(rect.width + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0),
        rect.height + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0), axis);
    }}><span aria-hidden="true">{axis === 'both' ? '↘' : ''}</span></button>;
  return <section ref={panel} className="workspace-panel" aria-label={title} data-panel={id}
    style={{ '--panel-width': size.width ? `${size.width}px` : width, '--panel-mobile-width': size.width ? `${size.width}px` : '100%', height: size.height } as CSSProperties}>
    <header className="panel-heading"><span className="panel-number">{number}</span><h2>{title}</h2><span className="panel-hint">↘ resize</span></header>
    <div className="panel-content">{children}</div>
    {handle('width')}{handle('height')}{handle('both')}
  </section>;
}
