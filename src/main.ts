import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { Store } from './store';
import { Header } from './ui/header';
import { Inbox } from './ui/inbox';
import { openMenuModal, openTaskModal } from './ui/modal';
import { PlanBar } from './ui/plans';
import { Timeline } from './ui/timeline';
import { addDays, todayKey } from './dates';
import type { Task } from './types';

const store = new Store();
const app = document.getElementById('app')!;

// ---------- Toast with undo ----------
let toastEl: HTMLElement | null = null;
let toastTimer = 0;
function toast(message: string, action?: { label: string; onClick: () => void }): void {
  toastEl?.remove();
  clearTimeout(toastTimer);
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.textContent = message;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', () => {
      action.onClick();
      toastEl?.remove();
    });
    toastEl.appendChild(b);
  }
  document.body.appendChild(toastEl);
  toastTimer = window.setTimeout(() => toastEl?.remove(), 5000);
}

// ---------- Task editing ----------
function editTask(task: Task, isNew = false): void {
  openTaskModal(task, {
    isNew,
    onSave: (t) => void store.save(t),
    onDelete: (t) => {
      void store.remove(t.id).then(() => {
        toast('Tarea eliminada', { label: 'Deshacer', onClick: () => void store.save(t) });
      });
    },
  });
}

function newTask(start?: number): void {
  const scheduled = start !== undefined;
  editTask(
    store.create({
      date: scheduled ? store.date : '',
      start: scheduled ? start : 9 * 60,
      duration: 60,
    }),
    true,
  );
}

// ---------- Layout ----------
const timeline: Timeline = new Timeline(store, {
  onEdit: (t) => editTask(t),
  onCreate: (start) => newTask(start),
  isOverInbox: (x, y): boolean => inbox.isOver(x, y),
  setInboxDropTarget: (on) => inbox.setDropTarget(on),
});
const inbox: Inbox = new Inbox(store, timeline, { onEdit: (t) => editTask(t) });
const header = new Header(store, {
  onToggleInbox: () => inbox.toggle(),
  onNew: () => newTask(),
  onMenu: () => openMenu(),
  onToggleReadOnly: () => {
    store.toggleReadOnly();
    toast(store.readOnly ? 'Modo solo lectura activado' : 'Modo solo lectura desactivado');
  },
});
const planBar = new PlanBar(store);

const main = document.createElement('main');
main.className = 'main';
main.append(planBar.el, timeline.el);
app.append(header.el, inbox.el, main);

// Close the mobile inbox drawer when tapping the timeline.
timeline.el.addEventListener('pointerdown', () => {
  if (inbox.isOpen() && window.matchMedia('(max-width: 760px)').matches) inbox.toggle(false);
});

// ---------- Menu: export / import / clear ----------
function openMenu(): void {
  openMenuModal([
    { label: 'Cambiar tema claro / oscuro', onClick: () => header.toggleTheme() },
    {
      label: 'Exportar respaldo (JSON)',
      onClick: async () => {
        const blob = new Blob([await store.exportJson()], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `dayplan-${todayKey()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
    },
    {
      label: 'Importar respaldo (JSON)',
      onClick: () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            const n = await store.importJson(await file.text());
            toast(`${n} tareas importadas`);
          } catch (err) {
            toast(`No se pudo importar: ${(err as Error).message}`);
          }
        });
        input.click();
      },
    },
    {
      label: 'Borrar todos los datos',
      danger: true,
      onClick: () => {
        if (confirm('¿Borrar todas las tareas de este dispositivo? Esta acción no se puede deshacer.')) {
          void store.clear().then(() => toast('Datos borrados'));
        }
      },
    },
  ]);
}

// ---------- Keyboard shortcuts ----------
window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('input, textarea, select, dialog')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key) {
    case 'ArrowLeft':
      void store.setDate(addDays(store.date, -1));
      break;
    case 'ArrowRight':
      void store.setDate(addDays(store.date, 1));
      break;
    case 't':
    case 'T':
      void store.setDate(todayKey());
      break;
    case 'n':
    case 'N':
      newTask();
      break;
    case 'i':
    case 'I':
      inbox.toggle();
      inbox.focusInput();
      break;
    default:
      return;
  }
  e.preventDefault();
});

// ---------- Rendering ----------
let lastDate = '';
store.subscribe(() => {
  header.render();
  inbox.render();
  planBar.render();
  timeline.render();
  if (store.date !== lastDate) {
    lastDate = store.date;
    timeline.scrollToStart();
  }
});

// Refresh "today" markers when the day rolls over or the tab becomes visible.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    header.render();
    timeline.updateNow();
  }
});

void store.load();

// ---------- PWA ----------
const updateSW = registerSW({
  onNeedRefresh() {
    toast('Hay una versión nueva', { label: 'Actualizar', onClick: () => void updateSW(true) });
  },
  onOfflineReady() {
    toast('Listo para usar sin conexión');
  },
});
