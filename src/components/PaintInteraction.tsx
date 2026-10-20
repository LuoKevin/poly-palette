import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import { PaintStroke } from '../paint/brush';
import type { BrushSettings, StrokeResult } from '../paint/brush';
import type { ModelAsset } from '../model/types';

interface Props {
  model: ModelAsset;
  brush: BrushSettings;
  cursor: RefObject<HTMLDivElement | null>;
  onStroke: (result: StrokeResult) => void;
  onMessage: (message: string) => void;
  finishStroke: RefObject<(() => void) | null>;
}

export function PaintInteraction({ model, brush, cursor, onStroke, onMessage, finishStroke }: Props) {
  const { gl, camera, invalidate } = useThree();
  const callbacks = useRef({ onStroke, onMessage });
  callbacks.current = { onStroke, onMessage };
  useEffect(() => {
    const canvas = gl.domElement;
    let stroke: PaintStroke | null = null;
    let pointer: number | null = null;
    const point = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const moveCursor = (event: PointerEvent) => {
      const p = point(event);
      if (cursor.current) {
        cursor.current.style.display = 'block';
        cursor.current.style.left = `${p.x}px`;
        cursor.current.style.top = `${p.y}px`;
        cursor.current.style.width = cursor.current.style.height = `${brush.size}px`;
        cursor.current.style.borderColor = brush.color;
      }
      return p;
    };
    const finish = () => {
      const completed = stroke;
      stroke = null;
      if (completed) { callbacks.current.onStroke(completed.finish()); invalidate(); }
      const previous = pointer;
      pointer = null;
      if (previous !== null && canvas.hasPointerCapture(previous)) canvas.releasePointerCapture(previous);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary || pointer !== null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const rect = canvas.getBoundingClientRect();
      try {
        stroke = new PaintStroke(model, camera, rect.width, rect.height, brush, moveCursor(event));
        pointer = event.pointerId;
        canvas.setPointerCapture(pointer);
        invalidate();
      } catch (error) {
        callbacks.current.onMessage(error instanceof Error ? error.message : 'This mesh could not be painted.');
      }
    };
    const move = (event: PointerEvent) => {
      if (!event.isPrimary) return;
      const p = moveCursor(event);
      if (stroke && event.pointerId === pointer) {
        event.preventDefault();
        if (!(event.buttons & 1)) { finish(); return; }
        stroke.move(p);
        invalidate();
      }
    };
    const up = (event: PointerEvent) => { if (event.pointerId === pointer) finish(); };
    const leave = () => { if (cursor.current) cursor.current.style.display = 'none'; };
    const wheel = () => { finish(); };
    finishStroke.current = finish;
    canvas.addEventListener('pointerdown', down, true);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel);
    window.addEventListener('blur', finish);
    return () => {
      finish();
      if (finishStroke.current === finish) finishStroke.current = null;
      leave();
      canvas.removeEventListener('pointerdown', down, true);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('lostpointercapture', up);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('blur', finish);
    };
  }, [model, brush, gl, camera, cursor, invalidate, finishStroke]);
  return null;
}
