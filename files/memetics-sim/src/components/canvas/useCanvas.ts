import { useEffect, useRef } from 'react';
import { useSimStore } from '../../store/useSimStore';

export interface Frame {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Fraction of the way to the next simulation tick — used to interpolate pulses. */
  phase: number;
  dt: number;
}

const BASE_TICK_HZ = 20;
const MAX_STEPS_PER_FRAME = 12;

/**
 * Simulation time is decoupled from render time: the engine advances at a fixed
 * rate (scaled by the speed control) while the canvas redraws every animation
 * frame and interpolates between ticks. That keeps transmission arcs smooth at
 * 60 FPS regardless of how fast the model is running.
 */
export function useCanvas(draw: (frame: Frame) => void) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let raf = 0;
    let last = performance.now();
    let accumulator = 0;
    let lastPublish = 0;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(now - last, 100);
      last = now;

      const { running, ticksPerFrame, engine, publishFrame } = useSimStore.getState();
      const interval = 1000 / (BASE_TICK_HZ * ticksPerFrame);

      if (running) {
        accumulator += dt;
        let steps = 0;
        while (accumulator >= interval && steps < MAX_STEPS_PER_FRAME) {
          engine.step();
          accumulator -= interval;
          steps++;
        }
        if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
        if (now - lastPublish > 160) {
          publishFrame();
          lastPublish = now;
        }
      } else {
        accumulator = 0;
      }

      drawRef.current({
        ctx,
        width,
        height,
        phase: running ? Math.min(1, accumulator / interval) : 0,
        dt,
      });
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return ref;
}
