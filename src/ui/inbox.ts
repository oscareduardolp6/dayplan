import { draggable } from '../drag';
import { fmtDuration } from '../dates';
import type { Store } from '../store';
import { SLOT_MIN, clampStart, colorValue, type Task } from '../types';
import type { Timeline } from './timeline';

export interface InboxHooks {
  onEdit: (task: Task) => void;
}

export class Inbox {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private count: HTMLElement;
  private input: HTMLInputElement;

  constructor(
    private store: Store,
    private timeline: Timeline,
    private hooks: InboxHooks,
  ) {
    this.el = document.createElement('aside');
    this.el.className = 'sidebar';
    this.el.innerHTML = `
      <div class="sidebar__head">
        <div class="sidebar__title">Inbox</div>
        <div class="sidebar__count"></div>
      </div>
      <form class="quick-add">
        <input type="text" placeholder="Nueva tarea…" aria-label="Nueva tarea" maxlength="120" />
        <button type="submit" title="Agregar">+</button>
      </form>
      <div class="inbox"></div>
    `;
    this.list = this.el.querySelector('.inbox')!;
    this.count = this.el.querySelector('.sidebar__count')!;
    this.input = this.el.querySelector('input')!;

    const form = this.el.querySelector('form')!;
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = this.input.value.trim();
      if (!title) return;
      this.input.value = '';
      void this.store.save(this.store.create({ title, duration: 30 }));
    });
  }

  isOver(x: number, y: number): boolean {
    if (getComputedStyle(this.el).transform !== 'none' && !this.el.classList.contains('is-open')) return false;
    const r = this.el.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  setDropTarget(on: boolean): void {
    this.list.classList.toggle('is-drop-target', on);
  }

  toggle(force?: boolean): void {
    this.el.classList.toggle('is-open', force);
  }

  isOpen(): boolean {
    return this.el.classList.contains('is-open');
  }

  focusInput(): void {
    this.input.focus();
  }

  render(): void {
    const tasks = this.store.inbox;
    this.count.textContent = tasks.length ? `${tasks.length}` : '';
    this.list.replaceChildren();
    if (!tasks.length) {
      const empty = document.createElement('div');
      empty.className = 'inbox__empty';
      empty.textContent = 'Sin tareas pendientes. Escribe una arriba y arrástrala al día.';
      this.list.appendChild(empty);
      return;
    }
    for (const task of tasks) this.list.appendChild(this.buildCard(task));
  }

  private buildCard(task: Task): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';
    if (task.done) card.classList.add('is-done');
    card.style.setProperty('--card-color', colorValue(task.color));
    card.innerHTML = `<div class="card__title"></div><div class="card__dur"></div>`;
    card.querySelector('.card__title')!.textContent = task.title || '(sin título)';
    card.querySelector('.card__dur')!.textContent = fmtDuration(task.duration);

    if (this.store.readOnly) {
      card.classList.add('is-locked');
      card.addEventListener('click', () => this.hooks.onEdit(task));
      return card;
    }

    let ghost: HTMLElement | null = null;
    let dropStart: number | null = null;

    const cleanup = () => {
      ghost?.remove();
      ghost = null;
      this.timeline.hidePreview();
      card.style.opacity = '';
    };

    draggable(card, {
      onStart: () => {
        ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.style.setProperty('--ghost-color', colorValue(task.color));
        ghost.textContent = task.title || '(sin título)';
        document.body.appendChild(ghost);
        card.style.opacity = '0.4';
      },
      onMove: (e) => {
        if (ghost) ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
        if (this.timeline.isOver(e.clientX, e.clientY)) {
          const min = Math.floor(this.timeline.minutesAt(e.clientY) / SLOT_MIN) * SLOT_MIN;
          dropStart = clampStart(min, task.duration);
          this.timeline.showPreview(task, dropStart);
        } else {
          dropStart = null;
          this.timeline.hidePreview();
        }
      },
      onEnd: () => {
        cleanup();
        if (dropStart !== null) {
          void this.store.save({ ...task, date: this.store.date, start: dropStart });
          if (window.matchMedia('(max-width: 760px)').matches) this.toggle(false);
        }
      },
      onCancel: cleanup,
      onTap: () => this.hooks.onEdit(task),
      onPan: (dy) => {
        this.list.scrollTop += dy;
      },
    });
    return card;
  }
}
