export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local date -> 'YYYY-MM-DD'. */
export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): string {
  return toKey(new Date());
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export function isToday(key: string): boolean {
  return key === todayKey();
}

export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export function fmtTime(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = Math.round(min % 60);
  return `${pad(h)}:${pad(m)}`;
}

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

const longFmt = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' });
const shortFmt = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' });

export function fmtLong(key: string): string {
  const s = longFmt.format(fromKey(key));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fmtShort(key: string): string {
  const s = shortFmt.format(fromKey(key)).replace(/\./g, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function relativeLabel(key: string): string | null {
  const t = todayKey();
  if (key === t) return 'Hoy';
  if (key === addDays(t, 1)) return 'Mañana';
  if (key === addDays(t, -1)) return 'Ayer';
  return null;
}
