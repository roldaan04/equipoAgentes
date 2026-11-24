# CLAUDE.md — Agent Team (prueba técnica Speed Paradigm)

## Qué es
Prueba técnica para **Speed Paradigm**: un equipo de **3 agentes de IA** que colaboran y se ven trabajar en pantalla.

1. **Orquestador**: recibe una petición («añade una página de contacto a esta web»), la divide en tareas con criterios de aceptación y las reparte.
2. **Develop**: hace las tareas (crea y modifica archivos de la web).
3. **Testing**: comprueba el trabajo de Develop y devuelve lo que falla. El ciclo se repite hasta que todo pasa, con un máximo de 3 intentos por tarea.

### Requisitos del enunciado (checklist de entrega)
- [x] Next.js
- [x] Programado con Claude Code, documentando cómo se usó (`docs/claude-code-log.md`)
- [x] Base de datos gratuita → Supabase (plan Free)
- [ ] Publicado en Vercel (plan Hobby) con URL pública → lo hace el programador siguiendo `docs/deploy.md`
- [x] En pantalla se ve qué hace cada agente y en qué estado está cada tarea

### Regla de oro: todo gratis
Todos los servicios en plan gratuito y sin tarjeta. Solo es de pago Claude Code, que es la herramienta de desarrollo y no forma parte del producto.
- **LLM de los agentes**: Google **Gemini API, plan gratuito**, modelo **Flash-Lite** (`gemini-3.5-flash-lite`: 500 peticiones/día y 15/min; los Flash grandes solo tienen 20/día y 5/min). Si se agota la cuota, el repuesto es el proveedor `mock` (respuestas guionizadas, sin coste). Proveedor (`gemini` | `mock`) y modelo se eligen por variable de entorno.
- Nada de APIs o dependencias de pago. Si algo lo necesitara, para y pregunta.
- Los planes gratuitos tienen límites de peticiones: hay que respetarlos (reintentos con backoff ante 429 y pocos turnos por paso) y la app tiene que mostrar un error claro si se agota la cuota.

## Quién hace qué
- **Claude Code**: código, migraciones SQL, `.env.example`, tests y documentación.
- **Programador**: crea Supabase y ejecuta el SQL, rellena `.env.local` y las variables en Vercel, **hace los commits y el push a GitHub** y despliega en Vercel.
- **Claude Code NUNCA hace `git commit`, `git push` ni despliega.** Al terminar cada fase, propone un mensaje de commit (Conventional Commits, en español) y para.
- Nunca leer, imprimir ni copiar el contenido de `.env.local`.

## Stack
Next.js (última estable, App Router, `src/`), TypeScript estricto, Tailwind, `@supabase/supabase-js`, `@google/genai`, zod, node-html-parser y Vitest. Gestor de paquetes: npm. Sin frameworks de agentes (LangChain, etc.): el bucle es propio, corto y legible, porque eso es parte de lo que se evalúa.

**Next.js 16** (ver `AGENTS.md`): antes de usar una API de Next, consulta la documentación incluida en `node_modules/next/dist/docs/`. El proyecto tiene `cacheComponents` activado, así que los datos son dinámicos por defecto y los Server Components que leen datos sin cachear van dentro de `<Suspense>`.

## Arquitectura en 4 ideas
1. **Workspace virtual**: cada run copia una web semilla (`src/seed/site/`) a la tabla `files` de Supabase. Develop edita ahí y el resultado se ve en `/preview/[runId]/`.
2. **Un paso por petición**: el run es una máquina de estados. `POST /api/runs/[id]/step` ejecuta una sola acción de un agente; el navegador va llamando paso a paso. Hay un lock en BD para que no corran dos pasos a la vez. Así se cumplen los límites de tiempo de Vercel Hobby.
3. **Testing en dos capas**: checks deterministas (sin LLM) + revisión con LLM. Si falla un check determinista, la tarea no pasa.
4. **Tiempo real**: Supabase Realtime, con polling cada 2 s como respaldo.

## Skills del proyecto (en `.claude/skills/`)
Cárgalas antes de trabajar en su área:
| Skill | Cuándo |
|---|---|
| `motor-agentes` | Agentes, prompts, herramientas, máquina de estados, checks y wrapper LLM |
| `base-de-datos` | Esquema SQL, RLS, Realtime, clientes Supabase y migraciones |
| `panel-ui` | Pantallas, componentes, tiempo real y vista previa |
| `entrega` | Variables de entorno, protección de cuota, README, log de Claude Code y despliegue |

## Plan por fases
Una fase cada vez. Para dar una fase por cerrada: `npm run lint && npm run typecheck && npm test && npm run build` en verde, una entrada en `docs/claude-code-log.md` y el commit propuesto. Después, parar.

| Fase | Contenido | Necesita de Programador |
|---|---|---|
| 0 | Scaffold Next.js + TS + Tailwind + ESLint + Vitest, scripts `typecheck`/`test`, `.gitignore`, `.env.example` | — |
| 1 | Migración SQL, clientes Supabase, tipos, `env.ts`, `workspace.ts` + tests | Ejecutar el SQL y rellenar `.env.local` |
| 2 | Web semilla + `checks.ts` + tests | — |
| 3 | Wrapper LLM (Gemini/mock), los 3 agentes, `engine.ts` y `npm run demo:cli` | `GEMINI_API_KEY` en `.env.local` |
| 4 | API routes, lock, protección de cuota y preview | — |
| 5 | UI completa + Realtime + fallback | Probar en local |
| 6 | Pulido: estados vacíos, errores, responsive | — |
| 7 | README, `docs/architecture.md`, log y checklist de despliegue | Push, deploy y variables en Vercel |

## Convenciones
- TypeScript estricto, sin `any` (`unknown` + zod). Toda salida de LLM se valida con zod.
- Server Components por defecto; `'use client'` solo donde haga falta.
- `src/lib/agents/` no importa nada de React ni de Next (se puede testear y ejecutar desde la CLI).
- Los errores nunca se ocultan: se registran como evento visible en la UI.
- UI y prompts en español; identificadores de código en inglés.
- Si un cambio contradice este archivo o una skill, actualiza el documento en el mismo cambio y avisa.
