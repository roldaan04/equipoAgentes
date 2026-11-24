---
name: panel-ui
description: Especificación de la interfaz (inicio y panel del run con 3 tarjetas de agente, kanban de tareas, timeline, archivos y vista previa), hooks de tiempo real y driver de pasos. Úsala al crear o cambiar páginas, componentes o hooks.
---

# Panel UI

Requisito clave del enunciado: **ver qué hace cada agente y en qué estado está cada tarea**. Es lo primero que mirará el evaluador, así que se le dedica más esmero que a nada.

Estilo: panel de control limpio y sobrio, Tailwind, sin librerías de componentes pesadas. Responsive, con contraste AA. Un color por agente (Orquestador violeta, Develop azul, Testing ámbar) usado de forma coherente en todas partes.

## `/` — Inicio
- Qué es, en 2 líneas, y los 3 agentes con icono y una frase cada uno.
- Formulario: textarea con la petición, ejemplos clicables («Añade una página de contacto con formulario», «Añade una sección de testimonios», «Haz el menú responsive con botón hamburguesa») y botón **Lanzar equipo**. Campo de código de acceso solo si el servidor lo exige.
- Runs recientes con su estado y fecha.

## `/runs/[id]` — Panel del run
1. **Cabecera**: petición, badge de estado y progreso (tareas hechas / total).
2. **3 tarjetas de agente**: estado (`Inactivo` / `Trabajando` / `Esperando`), indicador animado cuando trabaja, acción actual y último resultado. El estado se deriva de `runs.current_agent`, `current_action` y el último evento de cada agente.
3. **Kanban**: Pendiente · En desarrollo · En testing · Cambios pedidos · Completada · Fallida. Cada tarjeta muestra título, intentos (`2/3`) y criterios con ✓/✗. Al hacer clic se abre un drawer con la descripción, los criterios y el historial de informes (checks deterministas + veredicto LLM + feedback). Las tarjetas se animan al cambiar de columna (se vuelven a montar con `key = id:status`). **En móvil** (< md) el kanban pasa a lista vertical con solo las columnas que tienen tareas.
4. **Timeline** de `agent_events`: hora, chip del agente y mensaje, con autoscroll y botón para fijarlo.
5. **Pestañas Archivos / Vista previa**: árbol con los archivos modificados por Develop marcados, visor de código e iframe con `/preview/[runId]/`. La vista previa se recarga cuando una tarea pasa a `done`.
6. **Resumen final** del Orquestador al terminar.
7. **Errores visibles**: cuota agotada, LLM saturado (con cuenta atrás), error de red, run en error. Siempre con un texto que explique qué hacer.

## Páginas de error y navegación
- `src/app/not-found.tsx` (404 en español) y `src/app/error.tsx` (error boundary con **Reintentar**; en Next 16 la prop es `retry` y `error` llega como `unknown`). En producción solo se muestra el `digest`, nunca el mensaje del servidor.
- `LaunchForm`: tras crear el run hace `router.push`; si a los 5 s sigue en la misma página, navega con `window.location.assign`. Es una red de seguridad: en una prueba la navegación en el cliente no terminó y el botón se quedó en «Lanzando…».
- `RecentRuns`: si falla la carga, muestra el motivo y un botón **Reintentar**.

## Hooks
- `useRunRealtime(runId)`: carga inicial con `GET /api/runs/[id]` y suscripción Realtime a `runs`, `tasks`, `agent_events` y `test_reports` filtrada por `run_id`. Si no conecta en 5 s (o se cae), pasa a polling cada 2 s. Con Realtime activo se resincroniza cada 15 s, y 1 s después de `SUBSCRIBED`. Los archivos no van por Realtime: se refrescan con debounce cuando llega un evento de Develop. Expone `mode` (`connecting` | `realtime` | `polling`), que se muestra en la cabecera.
- `useRunDriver(runId, { terminal, ready, startPaused, onStep })`: mientras el run no haya terminado, llama a `POST /api/runs/[id]/step` en bucle, con 1 s entre pasos (por la cuota gratuita del LLM). Ante 409 reintenta a los 2 s; ante 429/5xx, backoff exponencial y aviso en la UI. Botón **Pausar / Reanudar**.
  - **No da el primer paso hasta que la conexión en vivo esté lista** (`mode !== connecting`): si no, se pierden los eventos del primer paso mientras se une el canal (se vio en las pruebas con navegador).
  - Qué hacer tras cada paso lo decide `decideAfterStep()` (`src/lib/ui/driver-policy.ts`, función pura con tests):
    - **LLM saturado** (`quotaExhausted` con `paused.reason = "overloaded"`, un 503): espera 20 s con cuenta atrás visible («Reintentando automáticamente», banner amarillo) y **reanuda sola**, hasta 3 veces seguidas sin ningún paso completado entre medias. A la cuarta se pausa y pide pulsar Reanudar. Pausar durante la cuenta atrás la corta.
    - **Cuota agotada** (`paused.reason = "quota"`, un 429): se pausa con el mensaje del motor y **no** se reanuda sola, porque puede ser la cuota diaria y reintentar gastaría peticiones.
    - **Sin tiempo en el paso** (`paused.reason = "timeout"`, `quotaExhausted = false`): no es un fallo; sigue con el paso siguiente.
    - Un paso completado sin pausa reinicia el contador de reanudaciones.
  - Al abrir un run que se quedó en pausa por falta de LLM (último evento = error de sistema con `payload.reason` `quota` u `overloaded`), empieza en pausa.
  - Tras 6 errores seguidos de red o servidor se pausa con aviso.

## Grids
Todo grid lleva `grid-cols-1` en móvil y sus hijos `min-w-0`: sin eso, la columna implícita crece con el contenido (p. ej. el visor de código) y la página desborda en horizontal.

## Componentes sugeridos (`src/components/`)
`AgentCard`, `AgentStrip`, `TaskBoard`, `TaskCard`, `TaskDrawer`, `CriteriaList`, `Timeline`, `FileTree`, `CodeViewer`, `PreviewFrame`, `RunHeader`, `StatusBadge`, `ErrorBanner`.

## Vista previa — `src/app/preview/[runId]/[[...path]]/route.ts`
Sirve el archivo desde `files` con su Content-Type (`index.html` por defecto) y CSP restrictiva (`default-src 'self' 'unsafe-inline'; frame-ancestors 'self'`). En la UI, el iframe lleva `sandbox="allow-scripts allow-forms"`.
