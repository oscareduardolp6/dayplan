import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Task } from './types';

interface DayPlanDB extends DBSchema {
  tasks: {
    key: string;
    value: Task;
    indexes: { 'by-date': string };
  };
}

let dbPromise: Promise<IDBPDatabase<DayPlanDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<DayPlanDB>('dayplan', 1, {
      upgrade(database) {
        const store = database.createObjectStore('tasks', { keyPath: 'id' });
        store.createIndex('by-date', 'date');
      },
    });
  }
  return dbPromise;
}

export async function getTasksByDate(date: string): Promise<Task[]> {
  return (await db()).getAllFromIndex('tasks', 'by-date', date);
}

export async function getAllTasks(): Promise<Task[]> {
  return (await db()).getAll('tasks');
}

export async function putTask(task: Task): Promise<void> {
  await (await db()).put('tasks', task);
}

export async function putTasks(tasks: Task[]): Promise<void> {
  const tx = (await db()).transaction('tasks', 'readwrite');
  await Promise.all([...tasks.map((t) => tx.store.put(t)), tx.done]);
}

export async function deleteTask(id: string): Promise<void> {
  await (await db()).delete('tasks', id);
}

export async function clearAll(): Promise<void> {
  await (await db()).clear('tasks');
}
