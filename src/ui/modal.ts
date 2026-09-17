import { fmtDuration, fmtTime } from '../dates';
import { COLORS, DAY_MIN, INBOX, SLOT_MIN, clampDuration, clampStart, snap, type ColorId, type Task } from '../types';

export interface ModalOptions {
  isNew: boolean;
  onSave: (task: Task) => void;
  onDelete: (task: Task) => void;
}

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300, 360, 480];

function timeToMin(v: string): number {
  const [h, m] = v.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function openTaskModal(task: Task, opts: ModalOptions): void {
  const draft: Task = { ...task };
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';

  const durationOptions = [...new Set([...DURATIONS, draft.duration])]
    .sort((a, b) => a - b)
    .map((d) => `<option value="${d}"${d === draft.duration ? ' selected' : ''}>${fmtDuration(d)}</option>`)
    .join('');

  dialog.innerHTML = `
    <form method="dialog" class="modal__body">
      <input class="modal__title-input" name="title" placeholder="Título de la tarea" maxlength="120" autocomplete="off" />
      <div class="field">
        <label>Color</label>
        <div class="swatches">
          ${COLORS.map(
            (c) =>
              `<button type="button" class="swatch${c.id === draft.color ? ' is-active' : ''}" data-color="${c.id}" title="${c.label}" style="background:${c.value}"></button>`,
          ).join('')}
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Fecha <span style="color:var(--fg-3)">(vacío = inbox)</span></label>
          <input type="date" name="date" />
        </div>
        <div class="field">
          <label>Inicio</label>
          <input type="time" name="start" step="${SLOT_MIN * 60}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Duración</label>
          <select name="duration">${durationOptions}</select>
        </div>
        <div class="field">
          <label>Estado</label>
          <label class="check-row" style="padding:8px 0;color:var(--fg)">
            <input type="checkbox" name="done" /> Completada
          </label>
        </div>
      </div>
      <div class="field">
        <label>Notas</label>
        <textarea name="notes" placeholder="Detalles, enlaces, pasos…"></textarea>
      </div>
      <div class="modal__actions">
        ${opts.isNew ? '' : '<button type="button" class="text-btn text-btn--danger" data-action="delete">Eliminar</button>'}
        <span class="spacer"></span>
        <button type="button" class="text-btn" data-action="cancel">Cancelar</button>
        <button type="submit" class="text-btn text-btn--primary" data-action="save">Guardar</button>
      </div>
    </form>
  `;

  const form = dialog.querySelector('form')!;
  const titleEl = form.elements.namedItem('title') as HTMLInputElement;
  const dateEl = form.elements.namedItem('date') as HTMLInputElement;
  const startEl = form.elements.namedItem('start') as HTMLInputElement;
  const durEl = form.elements.namedItem('duration') as HTMLSelectElement;
  const doneEl = form.elements.namedItem('done') as HTMLInputElement;
  const notesEl = form.elements.namedItem('notes') as HTMLTextAreaElement;

  titleEl.value = draft.title;
  dateEl.value = draft.date;
  startEl.value = fmtTime(draft.start);
  doneEl.checked = draft.done;
  notesEl.value = draft.notes;

  const syncStartDisabled = () => {
    startEl.disabled = !dateEl.value;
  };
  syncStartDisabled();
  dateEl.addEventListener('input', syncStartDisabled);

  form.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => {
    b.addEventListener('click', () => {
      draft.color = b.dataset.color as ColorId;
      form.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('is-active', s === b));
    });
  });

  const close = () => {
    dialog.close();
    dialog.remove();
  };

  form.querySelector('[data-action="cancel"]')!.addEventListener('click', close);
  form.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
    close();
    opts.onDelete(task);
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = titleEl.value.trim();
    if (!title) {
      titleEl.focus();
      return;
    }
    draft.title = title;
    draft.notes = notesEl.value.trim();
    draft.done = doneEl.checked;
    draft.date = /^\d{4}-\d{2}-\d{2}$/.test(dateEl.value) ? dateEl.value : INBOX;
    const duration = snap(Number(durEl.value) || 60);
    const start = draft.date === INBOX ? draft.start : timeToMin(startEl.value || '09:00');
    draft.start = clampStart(snap(start), Math.min(duration, DAY_MIN));
    draft.duration = clampDuration(draft.start, duration);
    close();
    opts.onSave(draft);
  });

  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });

  document.body.appendChild(dialog);
  dialog.showModal();
  titleEl.focus();
  if (draft.title) titleEl.select();
}

export function openMenuModal(items: { label: string; danger?: boolean; onClick: () => void }[]): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  dialog.style.width = 'min(320px, calc(100vw - 32px))';
  const body = document.createElement('div');
  body.className = 'modal__body';
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `text-btn${item.danger ? ' text-btn--danger' : ''}`;
    b.textContent = item.label;
    b.addEventListener('click', () => {
      dialog.close();
      item.onClick();
    });
    body.appendChild(b);
  }
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'text-btn text-btn--primary';
  cancel.textContent = 'Cerrar';
  cancel.addEventListener('click', () => dialog.close());
  body.appendChild(cancel);
  dialog.appendChild(body);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
}
