import {
  clearAll,
  deletePlanCascade,
  deleteTask,
  getAllPlans,
  getAllTasks,
  getPlansByDate,
  getTasksByDate,
  getTasksByPlan,
  putPlan,
  putPlans,
  putTask,
  putTasks,
} from './db';
import { todayKey } from './dates';
import {
  INBOX,
  isColorId,
  newId,
  snap,
  clampDuration,
  clampStart,
  type ColorId,
  type Plan,
  type Task,
} from './types';

type Listener = () => void;

const ACTIVE_PLAN_KEY = 'dayplan-active-plan';

function sortTasks(tasks: Task[]): Task[] {
  return tasks.sort((a, b) => a.start - b.start || b.duration - a.duration);
}

export class Store {
  date = todayKey();
  day: Task[] = [];
  inbox: Task[] = [];
  plans: Plan[] = [];
  planId = '';
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  async load(): Promise<void> {
    const [inbox, planList] = await Promise.all([getTasksByDate(INBOX), getPlansByDate(this.date)]);
    this.inbox = inbox.sort((a, b) => a.createdAt - b.createdAt);
    this.plans = planList.length ? planList.sort((a, b) => a.order - b.order) : [await this.ensureDefaultPlan(this.date)];
    const restored = this.restorePlanId();
    this.planId = this.plans.find((p) => p.id === restored)?.id ?? this.plans[0].id;
    this.persistPlanId();
    this.day = sortTasks(await getTasksByPlan(this.planId));
    this.emit();
  }

  async setDate(date: string): Promise<void> {
    this.date = date;
    await this.load();
  }

  /** Switches the visible plan (version) for the current date. */
  async setPlan(planId: string): Promise<void> {
    if (planId === this.planId || !this.plans.some((p) => p.id === planId)) return;
    this.planId = planId;
    this.persistPlanId();
    this.day = sortTasks(await getTasksByPlan(planId));
    this.emit();
  }

  /** Creates a new, empty plan for the current date and switches to it. */
  async addPlan(name?: string): Promise<void> {
    const order = this.plans.length ? Math.max(...this.plans.map((p) => p.order)) + 1 : 0;
    const plan: Plan = {
      id: newId(),
      date: this.date,
      name: name?.trim() || this.nextPlanName(),
      createdAt: Date.now(),
      order,
    };
    await putPlan(plan);
    this.plans = [...this.plans, plan];
    await this.setPlan(plan.id);
  }

  /** Copies a plan's tasks into a brand-new plan, e.g. to draft a contingency schedule. */
  async duplicatePlan(sourceId: string, name?: string): Promise<void> {
    const source = this.plans.find((p) => p.id === sourceId);
    if (!source) return;
    const tasks = sourceId === this.planId ? this.day : await getTasksByPlan(sourceId);
    const order = Math.max(...this.plans.map((p) => p.order)) + 1;
    const plan: Plan = {
      id: newId(),
      date: this.date,
      name: name?.trim() || `${source.name} (copia)`,
      createdAt: Date.now(),
      order,
    };
    const now = Date.now();
    const copies: Task[] = tasks.map((t) => ({ ...t, id: newId(), planId: plan.id, createdAt: now, updatedAt: now }));
    await putPlan(plan);
    await putTasks(copies);
    this.plans = [...this.plans, plan];
    await this.setPlan(plan.id);
  }

  async renamePlan(id: string, name: string): Promise<void> {
    const plan = this.plans.find((p) => p.id === id);
    const trimmed = name.trim();
    if (!plan || !trimmed || trimmed === plan.name) return;
    const updated = { ...plan, name: trimmed };
    await putPlan(updated);
    this.plans = this.plans.map((p) => (p.id === id ? updated : p));
    this.emit();
  }

  /** Deletes a plan and all of its tasks. Refuses to delete the last remaining plan of a day. */
  async removePlan(id: string): Promise<void> {
    if (this.plans.length <= 1 || !this.plans.some((p) => p.id === id)) return;
    const wasActive = id === this.planId;
    await deletePlanCascade(id);
    this.plans = this.plans.filter((p) => p.id !== id);
    if (wasActive) {
      this.planId = this.plans[0].id;
      this.persistPlanId();
      this.day = sortTasks(await getTasksByPlan(this.planId));
    }
    this.emit();
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
      planId: INBOX,
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
    task.planId = await this.resolvePlanId(task.date, task.planId);
    await putTask(task);
    await this.load();
  }

  async remove(id: string): Promise<void> {
    await deleteTask(id);
    await this.load();
  }

  async exportJson(): Promise<string> {
    const [tasks, plans] = await Promise.all([getAllTasks(), getAllPlans()]);
    return JSON.stringify({ app: 'dayplan', version: 2, tasks, plans }, null, 2);
  }

  /** Merges tasks and plans from an export file. Returns the number of imported tasks. */
  async importJson(text: string): Promise<number> {
    const parsed: unknown = JSON.parse(text);
    const obj = (Array.isArray(parsed) ? { tasks: parsed } : parsed) as { tasks?: unknown; plans?: unknown };
    const rawTasks = Array.isArray(obj.tasks) ? obj.tasks : [];
    const rawPlans = Array.isArray(obj.plans) ? obj.plans : [];
    if (!rawTasks.length && !rawPlans.length) throw new Error('Formato inválido');

    const plans: Plan[] = [];
    const validPlanIds = new Set<string>();
    for (const raw of rawPlans as Record<string, unknown>[]) {
      if (!raw || typeof raw !== 'object' || typeof raw.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) continue;
      const id = typeof raw.id === 'string' && raw.id ? raw.id : newId();
      plans.push({
        id,
        date: raw.date,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Plan A',
        createdAt: Number(raw.createdAt) || Date.now(),
        order: Number(raw.order) || 0,
      });
      validPlanIds.add(id);
    }

    const defaultPlanByDate = new Map<string, string>();
    const tasks: Task[] = [];
    for (const raw of rawTasks as Record<string, unknown>[]) {
      if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string') continue;
      const duration = snap(Number(raw.duration) || 60);
      const start = clampStart(snap(Number(raw.start) || 0), duration);
      const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : INBOX;
      let planId = date && typeof raw.planId === 'string' && validPlanIds.has(raw.planId) ? raw.planId : '';
      if (date && !planId) {
        planId = defaultPlanByDate.get(date) ?? '';
        if (!planId) {
          planId = newId();
          plans.push({ id: planId, date, name: 'Plan A', createdAt: Date.now(), order: 0 });
          validPlanIds.add(planId);
          defaultPlanByDate.set(date, planId);
        }
      }
      tasks.push({
        id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
        title: raw.title,
        notes: typeof raw.notes === 'string' ? raw.notes : '',
        color: isColorId(raw.color) ? (raw.color as ColorId) : 'blue',
        date,
        planId: date ? planId : INBOX,
        start,
        duration: clampDuration(start, duration),
        done: Boolean(raw.done),
        createdAt: Number(raw.createdAt) || Date.now(),
        updatedAt: Date.now(),
      });
    }
    await Promise.all([putTasks(tasks), putPlans(plans)]);
    await this.load();
    return tasks.length;
  }

  async clear(): Promise<void> {
    await clearAll();
    await this.load();
  }

  /** Resolves which plan a task should live under given its (possibly changed) date. */
  private async resolvePlanId(date: string, planId: string): Promise<string> {
    if (!date) return INBOX;
    if (date === this.date) {
      return this.plans.some((p) => p.id === planId) ? planId : this.planId;
    }
    const plans = await getPlansByDate(date);
    if (plans.length) return plans.sort((a, b) => a.order - b.order)[0].id;
    return (await this.ensureDefaultPlan(date)).id;
  }

  private async ensureDefaultPlan(date: string): Promise<Plan> {
    const plan: Plan = { id: newId(), date, name: 'Plan A', createdAt: Date.now(), order: 0 };
    await putPlan(plan);
    return plan;
  }

  private nextPlanName(): string {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const used = new Set(this.plans.map((p) => p.name));
    for (const l of letters) {
      const name = `Plan ${l}`;
      if (!used.has(name)) return name;
    }
    return `Plan ${this.plans.length + 1}`;
  }

  private restorePlanId(): string | undefined {
    try {
      const map = JSON.parse(localStorage.getItem(ACTIVE_PLAN_KEY) || '{}') as Record<string, string>;
      return typeof map[this.date] === 'string' ? map[this.date] : undefined;
    } catch {
      return undefined;
    }
  }

  private persistPlanId(): void {
    try {
      const map = JSON.parse(localStorage.getItem(ACTIVE_PLAN_KEY) || '{}') as Record<string, string>;
      map[this.date] = this.planId;
      localStorage.setItem(ACTIVE_PLAN_KEY, JSON.stringify(map));
    } catch {
      /* ignore */
    }
  }
}
