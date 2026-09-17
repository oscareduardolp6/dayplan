/**
 * Minimal pointer-based drag helper that works with mouse, pen and touch.
 * On touch, a short hold is required before the drag starts; moving before the
 * hold completes is reported through `onPan` so the caller can scroll manually
 * (the element uses `touch-action: none`).
 */
export interface DragHandlers {
  onStart: (e: PointerEvent) => void;
  onMove: (e: PointerEvent, dx: number, dy: number) => void;
  onEnd: (e: PointerEvent, dx: number, dy: number) => void;
  onTap?: (e: PointerEvent) => void;
  onCancel?: () => void;
  onPan?: (dy: number) => void;
}

export interface DragOptions {
  threshold?: number;
  holdMs?: number;
}

export function draggable(el: HTMLElement, h: DragHandlers, opts: DragOptions = {}): void {
  const threshold = opts.threshold ?? 4;
  const holdMs = opts.holdMs ?? 220;

  el.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-drag]') && !el.hasAttribute('data-no-drag')) return;
    e.preventDefault();

    const id = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    let lastY = sy;
    let state: 'pending' | 'holding' | 'dragging' | 'panning' =
      e.pointerType === 'touch' ? 'holding' : 'pending';
    let holdTimer = 0;

    try {
      el.setPointerCapture(id);
    } catch {
      /* ignore */
    }

    if (state === 'holding') {
      holdTimer = window.setTimeout(() => {
        state = 'dragging';
        navigator.vibrate?.(8);
        h.onStart(e);
        h.onMove(e, 0, 0);
      }, holdMs);
    }

    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (state === 'holding') {
        if (Math.hypot(dx, dy) > threshold * 2) {
          clearTimeout(holdTimer);
          state = 'panning';
        } else return;
      }
      if (state === 'panning') {
        h.onPan?.(lastY - ev.clientY);
        lastY = ev.clientY;
        return;
      }
      if (state === 'pending') {
        if (Math.hypot(dx, dy) < threshold) return;
        state = 'dragging';
        h.onStart(e);
      }
      h.onMove(ev, dx, dy);
    };

    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      cleanup();
      if (state === 'dragging') h.onEnd(ev, ev.clientX - sx, ev.clientY - sy);
      else if (state !== 'panning') h.onTap?.(ev);
    };

    const cancel = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      cleanup();
      if (state === 'dragging') h.onCancel?.();
    };

    function cleanup() {
      clearTimeout(holdTimer);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      try {
        el.releasePointerCapture(id);
      } catch {
        /* ignore */
      }
    }

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  });
}
