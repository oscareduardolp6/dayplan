# DayPlan

Planificador de día tipo [Accomplish](https://accomplish-app.com/), pero web y PWA.
**Demo:** https://oscarlp6.dev/dayplan/

Todo se guarda localmente en el navegador (IndexedDB), sin cuentas ni servidor.

## Funciones

- Timeline vertical de 24 h dividido en bloques de 15 minutos.
- Inbox de tareas sin programar; arrastra una tarjeta al timeline para ponerle hora.
- Arrastra un bloque para moverlo, usa el borde inferior para cambiar su duracion, o arrastralo de vuelta al inbox para desprogramarlo.
- Clic en un hueco del timeline crea una tarea a esa hora.
- Bloques con 9 colores, notas y estado de completado.
- Tema claro / oscuro (sigue el sistema, o se fuerza con el boton del header).
- Navegacion por dias: anterior, siguiente, "Hoy" o selector de fecha. Puedes planear cualquier dia futuro.
- Linea roja con la hora actual cuando ves el dia de hoy.
- Exportar / importar respaldo en JSON desde el menu (...).
- Instalable como PWA y funciona sin conexion.

## Atajos de teclado

| Tecla | Accion |
| --- | --- |
| `←` / `→` | Dia anterior / siguiente |
| `T` | Ir a hoy |
| `N` | Nueva tarea |
| `I` | Abrir inbox y enfocar el campo de texto |
| `Esc` | Cerrar dialogo |

## Desarrollo

```bash
npm install
npm run dev
```

Build de produccion (el service worker y el manifest se generan aqui):

```bash
npm run build
npm run preview
```

Para regenerar los iconos PNG: `npm run icons`.

## Estructura

- `src/db.ts` acceso a IndexedDB (libreria `idb`), store `tasks` con indice por fecha.
- `src/store.ts` estado en memoria del dia actual y del inbox, importar/exportar.
- `src/drag.ts` helper de arrastre con Pointer Events (mouse, lapiz y tactil con pulsacion larga).
- `src/ui/timeline.ts` grilla de horas, bloques, mover/redimensionar, columnas para solapamientos.
- `src/ui/inbox.ts` lista de tareas sin programar y alta rapida.
- `src/ui/modal.ts` dialogo de edicion de tarea y menu.
- `src/ui/header.ts` navegacion de fechas y tema.
