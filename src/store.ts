import { deleteTask, getAllTasks, getTasksByDate, putTask, putTasks, clearAll } from './db';
import { todayKey } from './dates';
import { INBOX, isColorId, newId, snap, clampDuration, clampStart, type Task, type ColorId } from './types';

type Listener = () => void;

export class Store {
  date = todayKey();
  day: Task[] = [];
  inbox: Task[] = [];
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  async load(): Promise<void> {
    const [day, inbox] = await Promise.all([getTasksByDate(this.date), getTasksByDate(INBOX)]);
    this.day = day.sort((a, b) => a.start - b.start || b.duration - a.duration);
    this.inbox = inbox.sort((a, b) => a.createdAt - b.createdAt);
    this.emit();
  }

  async setDate(date: string): Promise<void> {
    this.date = date;
    await this.load();
  }

  create(fields: Partial<Task> = {}): Task {
    const now = Date.now();
    const start = clampStart(snap(fields.start ?? 9 * 60), fields.duration ?? 60);
    return {
      id: newId(),
      title: '',
      notes: '',
      color: 'blue',
      date: INBOX,
      done: false,
      createdAt: now,
      updatedAt: now,
      ...fields,
      start,
      duration: clampDuration(start, snap(fields.duration ?? 60)),
    };
  }

  async save(task: Task): Promise<void> {
    task.updatedAt = Date.now();
    task.start = clampStart(snap(task.start), task.duration);
    task.duration = clampDuration(task.start, snap(task.duration));
    await putTask(task);
    await this.load();
  }

  async remove(id: string): Promise<void> {
    await deleteTask(id);
    await this.load();
  }

  async exportJson(): Promise<string> {
    return JSON.stringify({ app: 'dayplan', version: 1, tasks: await getAllTasks() }, null, 2);
  }

  /** Merges tasks from an export file. Returns the number of imported tasks. */
  async importJson(text: string): Promise<number> {
    const parsed: unknown = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : (parsed as { tasks?: unknown })?.tasks;
    if (!Array.isArray(list)) throw new Error('Formato inválido');
    const tasks: Task[] = [];
    for (const raw of list as Record<string, unknown>[]) {
      if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string') continue;
      const duration = snap(Number(raw.duration) || 60);
      const start = clampStart(snap(Number(raw.start) || 0), duration);
      tasks.push({
        id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
        title: raw.title,
        notes: typeof raw.notes === 'string' ? raw.notes : '',
        color: isColorId(raw.color) ? (raw.color as ColorId) : 'blue',
        date: typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : INBOX,
        start,
        duration: clampDuration(start, duration),
        done: Boolean(raw.done),
        createdAt: Number(raw.createdAt) || Date.now(),
        updatedAt: Date.now(),
      });
    }
    await putTasks(tasks);
    await this.load();
    return tasks.length;
  }

  async clear(): Promise<void> {
    await clearAll();
    await this.load();
  }
}
