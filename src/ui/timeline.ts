import { draggable } from '../drag';
import { fmtTime, isToday, nowMinutes } from '../dates';
import type { Store } from '../store';
import { DAY_MIN, INBOX, SLOT_MIN, clampDuration, clampStart, colorValue, snap, type Task } from '../types';

export interface TimelineHooks {
  onEdit: (task: Task) => void;
  onCreate: (start: number) => void;
  /** Return true when the pointer is over the inbox drop zone. */
  isOverInbox: (x: number, y: number) => boolean;
  setInboxDropTarget: (on: boolean) => void;
}

interface Placement {
  col: number;
  cols: number;
}

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

/** Assigns side-by-side columns to overlapping tasks (calendar style). */
function layoutOverlaps(tasks: Task[]): Map<string, Placement> {
  const out = new Map<string, Placement>();
  const sorted = [...tasks].sort((a, b) => a.start - b.start || b.duration - a.duration);
  let cluster: Task[] = [];
  let clusterEnd = -1;

  const flush = () => {
    if (!cluster.length) return;
    const colEnds: number[] = [];
    const cols = new Map<string, number>();
    for (const t of cluster) {
      let col = colEnds.findIndex((end) => end <= t.start);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(0);
      }
      colEnds[col] = t.start + t.duration;
      cols.set(t.id, col);
    }
    for (const t of cluster) out.set(t.id, { col: cols.get(t.id)!, cols: colEnds.length });
    cluster = [];
  };

  for (const t of sorted) {
    if (t.start >= clusterEnd) flush();
    cluster.push(t);
    clusterEnd = Math.max(clusterEnd, t.start + t.duration);
  }
  flush();
  return out;
}

export class Timeline {
  readonly el: HTMLElement;
  private inner: HTMLElement;
  private slots: HTMLElement;
  private blocks: HTMLElement;
  private nowLine: HTMLElement;
  private preview: HTMLElement | null = null;
  private dragging = false;
  private autoScrollDir = 0;
  private autoScrollRaf = 0;

  constructor(
    private store: Store,
    private hooks: TimelineHooks,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'timeline';
    this.inner = document.createElement('div');
    this.inner.className = 'timeline__inner';
    this.el.appendChild(this.inner);

    for (let h = 0; h < 24; h++) {
      const hour = document.createElement('div');
      hour.className = 'hour';
      hour.style.top = `calc(var(--hour-h) * ${h})`;
      const label = document.createElement('div');
      label.className = 'hour__label';
      label.textContent = h === 0 ? '' : fmtTime(h * 60);
      hour.appendChild(label);
      this.inner.appendChild(hour);
    }

    this.slots = document.createElement('div');
    this.slots.className = 'slots';
    this.inner.appendChild(this.slots);

    this.blocks = document.createElement('div');
    this.blocks.className = 'slots';
    this.blocks.style.pointerEvents = 'none';
    this.inner.appendChild(this.blocks);

    this.nowLine = document.createElement('div');
    this.nowLine.className = 'now-line';
    this.inner.appendChild(this.nowLine);

    this.slots.addEventListener('click', (e) => {
      if (this.dragging) return;
      const min = Math.floor(this.minutesAt(e.clientY) / SLOT_MIN) * SLOT_MIN;
      this.hooks.onCreate(clampStart(min, 60));
    });
    this.slots.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || this.dragging) return;
      const min = Math.floor(this.minutesAt(e.clientY) / SLOT_MIN) * SLOT_MIN;
      this.slots.style.setProperty('--hover-y', `${min * this.ppm()}px`);
      this.slots.classList.add('is-hover-slot');
    });
    this.slots.addEventListener('pointerleave', () => this.slots.classList.remove('is-hover-slot'));

    window.setInterval(() => this.updateNow(), 30_000);
  }

  /** Pixels per minute, derived from the --hour-h CSS variable. */
  ppm(): number {
    const h = parseFloat(getComputedStyle(this.inner).getPropertyValue('--hour-h')) || 72;
    return h / 60;
  }

  minutesAt(clientY: number): number {
    const rect = this.inner.getBoundingClientRect();
    return Math.min(Math.max(0, (clientY - rect.top) / this.ppm()), DAY_MIN);
  }

  isOver(x: number, y: number): boolean {
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  scrollBy(dy: number): void {
    this.el.scrollTop += dy;
  }

  scrollToStart(): void {
    const target = isToday(this.store.date)
      ? nowMinutes() - 90
      : this.store.day.length
        ? this.store.day[0].start - 60
        : 8 * 60;
    this.el.scrollTop = Math.max(0, target * this.ppm());
  }

  updateNow(): void {
    const show = isToday(this.store.date);
    this.nowLine.style.display = show ? '' : 'none';
    if (show) this.nowLine.style.top = `${nowMinutes() * this.ppm()}px`;
  }

  showPreview(task: Task, start: number): void {
    if (!this.preview) {
      this.preview = this.buildBlock(task, { col: 0, cols: 1 }, true);
      this.blocks.appendChild(this.preview);
    }
    this.position(this.preview, start, task.duration, { col: 0, cols: 1 });
    const time = this.preview.querySelector('.block__time');
    if (time) time.textContent = `${fmtTime(start)} – ${fmtTime(start + task.duration)}`;
  }

  hidePreview(): void {
    this.preview?.remove();
    this.preview = null;
  }

  render(): void {
    if (this.dragging) return;
    this.blocks.replaceChildren();
    this.preview = null;
    this.el.classList.toggle('is-readonly', this.store.readOnly);
    const placements = layoutOverlaps(this.store.day);
    for (const task of this.store.day) {
      const p = placements.get(task.id) ?? { col: 0, cols: 1 };
      const block = this.buildBlock(task, p, false);
      this.position(block, task.start, task.duration, p);
      if (this.store.readOnly) block.addEventListener('click', () => this.hooks.onEdit(task));
      else this.attachBlockDrag(block, task);
      this.blocks.appendChild(block);
    }
    this.updateNow();
  }

  private position(block: HTMLElement, start: number, duration: number, p: Placement): void {
    const ppm = this.ppm();
    block.style.top = `${start * ppm + 1}px`;
    block.style.height = `${Math.max(duration * ppm - 2, 12)}px`;
    block.style.left = `calc(${(p.col / p.cols) * 100}% + 2px)`;
    block.style.width = `calc(${100 / p.cols}% - 6px)`;
    block.classList.toggle('is-short', duration <= SLOT_MIN * 2);
  }

  private buildBlock(task: Task, _p: Placement, preview: boolean): HTMLElement {
    const block = document.createElement('div');
    block.className = 'block';
    block.style.setProperty('--block-color', colorValue(task.color));
    block.style.pointerEvents = preview ? 'none' : 'auto';
    if (preview) block.classList.add('is-preview');
    if (task.done) block.classList.add('is-done');
    block.dataset.id = task.id;

    const row = document.createElement('div');
    row.className = 'block__row';

    const check = document.createElement('button');
    check.className = 'block__check';
    check.type = 'button';
    check.title = task.done ? 'Marcar pendiente' : 'Marcar completada';
    check.setAttribute('data-no-drag', '');
    check.innerHTML = CHECK_SVG;
    check.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.store.save({ ...task, done: !task.done });
    });

    const title = document.createElement('div');
    title.className = 'block__title';
    title.textContent = task.title || '(sin título)';

    row.append(check, title);
    block.appendChild(row);

    const time = document.createElement('div');
    time.className = 'block__time';
    time.textContent = `${fmtTime(task.start)} – ${fmtTime(task.start + task.duration)}`;
    block.appendChild(time);

    if (!preview && !this.store.readOnly) {
      const handleTop = document.createElement('div');
      handleTop.className = 'block__resize block__resize--top';
      handleTop.setAttribute('data-no-drag', '');
      block.appendChild(handleTop);

      const handleBottom = document.createElement('div');
      handleBottom.className = 'block__resize block__resize--bottom';
      handleBottom.setAttribute('data-no-drag', '');
      block.appendChild(handleBottom);
    }
    return block;
  }

  private attachBlockDrag(block: HTMLElement, task: Task): void {
    const time = block.querySelector<HTMLElement>('.block__time')!;
    const handleTop = block.querySelector<HTMLElement>('.block__resize--top')!;
    const handleBottom = block.querySelector<HTMLElement>('.block__resize--bottom')!;
    let grabOffset = 0;
    let start = task.start;
    let duration = task.duration;
    let overInbox = false;

    const setDragging = (on: boolean) => {
      this.dragging = on;
      this.el.classList.toggle('is-dragging', on);
      block.classList.toggle('is-dragging', on);
      if (!on) this.stopAutoScroll();
    };

    draggable(
      block,
      {
        onStart: (e) => {
          setDragging(true);
          grabOffset = this.minutesAt(e.clientY) - task.start;
          start = task.start;
        },
        onMove: (e) => {
          const wasOver = overInbox;
          overInbox = this.hooks.isOverInbox(e.clientX, e.clientY);
          if (overInbox !== wasOver) {
            this.hooks.setInboxDropTarget(overInbox);
            block.style.opacity = overInbox ? '0.35' : '';
          }
          if (overInbox) {
            this.stopAutoScroll();
            return;
          }
          this.maybeAutoScroll(e.clientY);
          start = clampStart(snap(this.minutesAt(e.clientY) - grabOffset), task.duration);
          block.style.top = `${start * this.ppm() + 1}px`;
          time.textContent = `${fmtTime(start)} – ${fmtTime(start + task.duration)}`;
        },
        onEnd: () => {
          setDragging(false);
          this.hooks.setInboxDropTarget(false);
          if (overInbox) void this.store.save({ ...task, date: INBOX });
          else if (start !== task.start) void this.store.save({ ...task, start });
          else this.render();
        },
        onCancel: () => {
          setDragging(false);
          this.hooks.setInboxDropTarget(false);
          this.render();
        },
        onTap: () => this.hooks.onEdit(task),
        onPan: (dy) => this.scrollBy(dy),
      },
    );

    draggable(
      handleBottom,
      {
        onStart: () => {
          setDragging(true);
          duration = task.duration;
        },
        onMove: (e) => {
          this.maybeAutoScroll(e.clientY);
          const end = snap(this.minutesAt(e.clientY));
          duration = clampDuration(task.start, end - task.start);
          block.style.height = `${Math.max(duration * this.ppm() - 2, 12)}px`;
          block.classList.toggle('is-short', duration <= SLOT_MIN * 2);
          time.textContent = `${fmtTime(task.start)} – ${fmtTime(task.start + duration)}`;
        },
        onEnd: () => {
          setDragging(false);
          if (duration !== task.duration) void this.store.save({ ...task, duration });
          else this.render();
        },
        onCancel: () => {
          setDragging(false);
          this.render();
        },
        onPan: (dy) => this.scrollBy(dy),
      },
      { holdMs: 0 },
    );

    draggable(
      handleTop,
      {
        onStart: () => {
          setDragging(true);
          start = task.start;
          duration = task.duration;
        },
        onMove: (e) => {
          this.maybeAutoScroll(e.clientY);
          const end = task.start + task.duration;
          start = Math.max(0, Math.min(snap(this.minutesAt(e.clientY)), end - SLOT_MIN));
          duration = end - start;
          block.style.top = `${start * this.ppm() + 1}px`;
          block.style.height = `${Math.max(duration * this.ppm() - 2, 12)}px`;
          block.classList.toggle('is-short', duration <= SLOT_MIN * 2);
          time.textContent = `${fmtTime(start)} – ${fmtTime(start + duration)}`;
        },
        onEnd: () => {
          setDragging(false);
          if (start !== task.start || duration !== task.duration) void this.store.save({ ...task, start, duration });
          else this.render();
        },
        onCancel: () => {
          setDragging(false);
          this.render();
        },
        onPan: (dy) => this.scrollBy(dy),
      },
      { holdMs: 0 },
    );
  }

  private maybeAutoScroll(clientY: number): void {
    const r = this.el.getBoundingClientRect();
    const edge = 48;
    if (clientY < r.top + edge) this.autoScrollDir = -1;
    else if (clientY > r.bottom - edge) this.autoScrollDir = 1;
    else this.autoScrollDir = 0;
    if (this.autoScrollDir && !this.autoScrollRaf) {
      const step = () => {
        if (!this.autoScrollDir) {
          this.autoScrollRaf = 0;
          return;
        }
        this.el.scrollTop += this.autoScrollDir * 6;
        this.autoScrollRaf = requestAnimationFrame(step);
      };
      this.autoScrollRaf = requestAnimationFrame(step);
    }
  }

  private stopAutoScroll(): void {
    this.autoScrollDir = 0;
    if (this.autoScrollRaf) cancelAnimationFrame(this.autoScrollRaf);
    this.autoScrollRaf = 0;
  }
}
