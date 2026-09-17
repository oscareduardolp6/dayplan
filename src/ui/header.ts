import { addDays, fmtLong, fmtShort, relativeLabel, todayKey } from '../dates';
import type { Store } from '../store';

export interface HeaderHooks {
  onToggleInbox: () => void;
  onMenu: () => void;
  onNew: () => void;
}

const ICONS = {
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
};

const THEME_KEY = 'dayplan-theme';

function effectiveTheme(): 'light' | 'dark' {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeColor(): void {
  const color = effectiveTheme() === 'dark' ? '#111111' : '#ffffff';
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => (m.content = color));
}

export class Header {
  readonly el: HTMLElement;
  private dateLong: HTMLElement;
  private dateShort: HTMLElement;
  private relSlot: HTMLElement;
  private dateInput: HTMLInputElement;
  private themeBtn: HTMLButtonElement;

  constructor(
    private store: Store,
    private hooks: HeaderHooks,
  ) {
    this.el = document.createElement('header');
    this.el.className = 'header';
    this.el.innerHTML = `
      <div class="header__brand"><img src="${import.meta.env.BASE_URL}icons/icon.svg" alt="" /><span>DayPlan</span></div>
      <nav class="header__nav">
        <button class="icon-btn" data-nav="-1" title="Día anterior (←)">${ICONS.prev}</button>
        <button class="text-btn" data-nav="today" title="Ir a hoy (T)">Hoy</button>
        <button class="icon-btn" data-nav="1" title="Día siguiente (→)">${ICONS.next}</button>
        <label class="header__date" title="Elegir fecha">
          <span class="header__date-text header__date-text--long"></span>
          <span class="header__date-text header__date-text--short"></span>
          <span class="header__rel-slot"></span>
          <input type="date" aria-label="Fecha" />
        </label>
      </nav>
      <button class="icon-btn" data-action="new" title="Nueva tarea (N)">${ICONS.plus}</button>
      <button class="icon-btn sidebar-toggle" data-action="inbox" title="Inbox">${ICONS.inbox}</button>
      <button class="icon-btn" data-action="theme" title="Cambiar tema"></button>
      <button class="icon-btn" data-action="menu" title="Más">${ICONS.more}</button>
    `;
    this.dateLong = this.el.querySelector('.header__date-text--long')!;
    this.dateShort = this.el.querySelector('.header__date-text--short')!;
    this.relSlot = this.el.querySelector('.header__rel-slot')!;
    this.dateInput = this.el.querySelector('input[type="date"]')!;
    this.themeBtn = this.el.querySelector('[data-action="theme"]')!;

    this.el.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((b) => {
      b.addEventListener('click', () => {
        const nav = b.dataset.nav!;
        void this.store.setDate(nav === 'today' ? todayKey() : addDays(this.store.date, Number(nav)));
      });
    });
    this.dateInput.addEventListener('change', () => {
      if (this.dateInput.value) void this.store.setDate(this.dateInput.value);
    });
    this.el.querySelector('[data-action="new"]')!.addEventListener('click', () => this.hooks.onNew());
    this.el.querySelector('[data-action="inbox"]')!.addEventListener('click', () => this.hooks.onToggleInbox());
    this.el.querySelector('[data-action="menu"]')!.addEventListener('click', () => this.hooks.onMenu());
    this.themeBtn.addEventListener('click', () => this.toggleTheme());

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.renderTheme());
    this.renderTheme();
  }

  toggleTheme(): void {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    this.renderTheme();
  }

  private renderTheme(): void {
    const dark = effectiveTheme() === 'dark';
    this.themeBtn.innerHTML = dark ? ICONS.sun : ICONS.moon;
    this.themeBtn.title = dark ? 'Tema claro' : 'Tema oscuro';
    applyThemeColor();
  }

  render(): void {
    const key = this.store.date;
    const rel = relativeLabel(key);
    this.dateLong.textContent = fmtLong(key);
    this.dateShort.textContent = fmtShort(key);
    this.relSlot.replaceChildren();
    if (rel || key > todayKey()) {
      const tag = document.createElement('span');
      tag.className = 'header__rel';
      if (rel) tag.textContent = rel;
      else {
        tag.textContent = 'Futuro';
        tag.classList.add('is-future');
      }
      this.relSlot.appendChild(tag);
    }
    this.dateInput.value = key;
    document.title = `${rel ? rel + ' · ' : ''}${fmtLong(key)} · DayPlan`;
  }
}
