import type { Store } from '../store';
import type { Plan } from '../types';
import { openMenuModal } from './modal';

export class PlanBar {
  readonly el: HTMLElement;
  private tabs: HTMLElement;
  private lockBadge: HTMLElement;

  constructor(private store: Store) {
    this.el = document.createElement('div');
    this.el.className = 'planbar';

    this.tabs = document.createElement('div');
    this.tabs.className = 'planbar__tabs';

    this.lockBadge = document.createElement('span');
    this.lockBadge.className = 'planbar__lock';
    this.lockBadge.textContent = '🔒 Solo lectura';

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'planbar__add';
    add.title = 'Nuevo plan para este día';
    add.textContent = '+';
    add.addEventListener('click', () => {
      const suggestion = `Plan ${String.fromCharCode(65 + this.store.plans.length)}`;
      const name = prompt('Nombre del nuevo plan (por ejemplo, "Plan B" o "Si llueve")', suggestion);
      if (name === null) return;
      void this.store.addPlan(name);
    });

    this.el.append(this.tabs, this.lockBadge, add);
  }

  render(): void {
    this.tabs.replaceChildren();
    for (const plan of this.store.plans) this.tabs.appendChild(this.buildTab(plan));
    this.lockBadge.classList.toggle('is-visible', this.store.readOnly);
  }

  private buildTab(plan: Plan): HTMLElement {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `plan-tab${plan.id === this.store.planId ? ' is-active' : ''}`;
    tab.title = `Cambiar a "${plan.name}"`;

    const name = document.createElement('span');
    name.className = 'plan-tab__name';
    name.textContent = plan.name;

    const menu = document.createElement('span');
    menu.className = 'plan-tab__menu';
    menu.textContent = '⋮';
    menu.title = 'Opciones del plan';

    tab.append(name, menu);

    tab.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.plan-tab__menu')) {
        e.stopPropagation();
        this.openPlanMenu(plan);
        return;
      }
      void this.store.setPlan(plan.id);
    });

    return tab;
  }

  private openPlanMenu(plan: Plan): void {
    const canDelete = this.store.plans.length > 1;
    openMenuModal([
      {
        label: 'Renombrar',
        onClick: () => {
          const name = prompt('Nuevo nombre del plan', plan.name);
          if (name === null) return;
          void this.store.renamePlan(plan.id, name);
        },
      },
      {
        label: 'Duplicar como nueva versión',
        onClick: () => {
          const name = prompt('Nombre del nuevo plan (copia)', `${plan.name} (copia)`);
          if (name === null) return;
          void this.store.duplicatePlan(plan.id, name);
        },
      },
      ...(canDelete
        ? [
            {
              label: 'Eliminar este plan',
              danger: true,
              onClick: () => {
                if (confirm(`¿Eliminar "${plan.name}" y todas sus tareas? Esta acción no se puede deshacer.`)) {
                  void this.store.removePlan(plan.id);
                }
              },
            },
          ]
        : []),
    ]);
  }
}
