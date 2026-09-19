export const SLOT_MIN = 15; // minimum block size in minutes
export const DAY_MIN = 24 * 60;

export const COLORS = [
  { id: 'blue', label: 'Azul', value: '#60a5fa' },
  { id: 'green', label: 'Verde', value: '#34d399' },
  { id: 'yellow', label: 'Amarillo', value: '#fbbf24' },
  { id: 'red', label: 'Rojo', value: '#f87171' },
  { id: 'purple', label: 'Morado', value: '#a78bfa' },
  { id: 'pink', label: 'Rosa', value: '#f472b6' },
  { id: 'teal', label: 'Turquesa', value: '#2dd4bf' },
  { id: 'orange', label: 'Naranja', value: '#fb923c' },
  { id: 'gray', label: 'Gris', value: '#9ca3af' },
] as const;

export type ColorId = (typeof COLORS)[number]['id'];

export interface Task {
  id: string;
  title: string;
  notes: string;
  color: ColorId;
  /** 'YYYY-MM-DD' when scheduled, '' when it lives in the inbox. */
  date: string;
  /** Id of the Plan (day version) this task belongs to. '' when date === ''. */
  planId: string;
  /** Minutes from midnight. Ignored when date === ''. */
  start: number;
  /** Duration in minutes, multiple of SLOT_MIN. */
  duration: number;
  done: boolean;
  createdAt: number;
  updatedAt: number;
}

/** A named version of a day's schedule, so alternate plans can be prepared side by side. */
export interface Plan {
  id: string;
  /** 'YYYY-MM-DD' this plan belongs to. */
  date: string;
  name: string;
  createdAt: number;
  /** Tab order among the plans of the same date. */
  order: number;
}

export const INBOX = '';

export function colorValue(id: ColorId): string {
  return COLORS.find((c) => c.id === id)?.value ?? COLORS[0].value;
}

export function isColorId(v: unknown): v is ColorId {
  return typeof v === 'string' && COLORS.some((c) => c.id === v);
}

export function snap(min: number): number {
  return Math.round(min / SLOT_MIN) * SLOT_MIN;
}

export function clampStart(start: number, duration: number): number {
  return Math.min(Math.max(0, start), DAY_MIN - duration);
}

export function clampDuration(start: number, duration: number): number {
  return Math.min(Math.max(SLOT_MIN, duration), DAY_MIN - start);
}

export function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
