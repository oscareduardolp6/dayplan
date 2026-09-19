import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { newId } from './types';
import type { Plan, Task } from './types';

interface DayPlanDB extends DBSchema {
  tasks: {
    key: string;
    value: Task;
    indexes: { 'by-date': string; 'by-plan': string };
  };
  plans: {
    key: string;
    value: Plan;
    indexes: { 'by-date': string };
  };
}

let dbPromise: Promise<IDBPDatabase<DayPlanDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<DayPlanDB>('dayplan', 2, {
      async upgrade(database, oldVersion, _newVersion, transaction) {
        const taskStore = oldVersion < 1 ? database.createObjectStore('tasks', { keyPath: 'id' }) : transaction.objectStore('tasks');
        if (oldVersion < 1) taskStore.createIndex('by-date', 'date');

        if (oldVersion < 2) {
          const planStore = database.createObjectStore('plans', { keyPath: 'id' });
          planStore.createIndex('by-date', 'date');
          taskStore.createIndex('by-plan', 'planId');

          // Migrate pre-existing tasks: give each scheduled date a default "Plan A".
          const defaultPlanByDate = new Map<string, string>();
          for (const task of await taskStore.getAll()) {
            if (!task.date) continue;
            let planId = defaultPlanByDate.get(task.date);
            if (!planId) {
              planId = newId();
              defaultPlanByDate.set(task.date, planId);
              await planStore.add({ id: planId, date: task.date, name: 'Plan A', createdAt: Date.now(), order: 0 });
            }
            await taskStore.put({ ...task, planId });
          }
        }
      },
    });
  }
  return dbPromise;
}

export async function getTasksByDate(date: string): Promise<Task[]> {
  return (await db()).getAllFromIndex('tasks', 'by-date', date);
}

export async function getTasksByPlan(planId: string): Promise<Task[]> {
  return (await db()).getAllFromIndex('tasks', 'by-plan', planId);
}

export async function getAllTasks(): Promise<Task[]> {
  return (await db()).getAll('tasks');
}

export async function putTask(task: Task): Promise<void> {
  await (await db()).put('tasks', task);
}

export async function putTasks(tasks: Task[]): Promise<void> {
  if (!tasks.length) return;
  const tx = (await db()).transaction('tasks', 'readwrite');
  await Promise.all([...tasks.map((t) => tx.store.put(t)), tx.done]);
}

export async function deleteTask(id: string): Promise<void> {
  await (await db()).delete('tasks', id);
}

export async function getPlansByDate(date: string): Promise<Plan[]> {
  return (await db()).getAllFromIndex('plans', 'by-date', date);
}

export async function getAllPlans(): Promise<Plan[]> {
  return (await db()).getAll('plans');
}

export async function putPlan(plan: Plan): Promise<void> {
  await (await db()).put('plans', plan);
}

export async function putPlans(plans: Plan[]): Promise<void> {
  if (!plans.length) return;
  const tx = (await db()).transaction('plans', 'readwrite');
  await Promise.all([...plans.map((p) => tx.store.put(p)), tx.done]);
}

/** Deletes a plan along with every task scheduled under it. */
export async function deletePlanCascade(planId: string): Promise<void> {
  const tx = (await db()).transaction(['plans', 'tasks'], 'readwrite');
  const tasks = await tx.objectStore('tasks').index('by-plan').getAll(planId);
  await Promise.all([
    tx.objectStore('plans').delete(planId),
    ...tasks.map((t) => tx.objectStore('tasks').delete(t.id)),
    tx.done,
  ]);
}

export async function clearAll(): Promise<void> {
  const tx = (await db()).transaction(['tasks', 'plans'], 'readwrite');
  await Promise.all([tx.objectStore('tasks').clear(), tx.objectStore('plans').clear(), tx.done]);
}
