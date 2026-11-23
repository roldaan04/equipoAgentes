---
name: entrega
description: Variables de entorno, rutas de API, protección de la cuota gratuita, log de uso de Claude Code, README y checklist de despliegue en Vercel. Úsala en la fase 4 (API), al cerrar cada fase (log) y en la fase 7 (entrega).
---

# Entrega

## Variables de entorno
Validadas con zod en `src/lib/env.ts`, con error claro si falta alguna. `.env.example` se commitea; `.env.local` no.
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   # publishable o anon key
SUPABASE_SECRET_KEY=                    # secret o service_role key. SOLO servidor
LLM_PROVIDER=gemini                     # gemini | mock
LLM_MODEL=                              # ID exacto de un modelo Flash del plan gratuito (copiar de AI Studio)
GEMINI_API_KEY=                         # aistudio.google.com, gratis, sin tarjeta
IP_HASH_SALT=                           # cadena aleatoria
MAX_RUNS_PER_HOUR=5
MAX_RUNS_PER_IP_PER_HOUR=3
DEMO_ACCESS_CODE=                       # opcional
```
Nada con `NEXT_PUBLIC_` puede ser secreto.

## API (`src/app/api/`)
| Ruta | Qué hace |
|---|---|
| `POST /api/runs` | Valida `{ request, accessCode? }`, aplica la protección de cuota, crea el run, copia la web semilla y devuelve `{ id }` |
| `GET /api/runs` | Últimos 20 runs (columnas explícitas) |
| `GET /api/runs/[id]` | Run + tasks + informes + eventos |
| `POST /api/runs/[id]/step` | Lock → `advanceRun` → libera el lock. Devuelve `{ status, done }`. `maxDuration = 60` |
| `GET /api/config` | `{ accessCodeRequired: boolean, provider }` para la UI |

## Protección de la cuota gratuita
La URL es pública y la cuota gratuita del LLM es limitada: un visitante podría agotarla y dejar la demo sin servicio.
- Límite global por hora y límite por IP (hasheada), contando en `runs`.
- `DEMO_ACCESS_CODE` opcional.
- Petición de 1000 caracteres como máximo.
- Si la cuota del LLM se agota: mensaje claro en la UI y run reanudable.

## Log de Claude Code — `docs/claude-code-log.md`
Es un entregable explícito («cuéntanos cómo lo usaste»). Se escribe **al cerrar cada fase**, no al final:
```md
## Fase N — título
- **Petición a Claude Code**: (resumen del prompt)
- **Cómo se usó**: CLAUDE.md + skill X, plan mode, subagente para Y, bucle lint/test/build hasta verde…
- **Decisiones**: qué y por qué
- **Correcciones**: qué hubo que reorientar o arreglar a mano
```

## README final
1. Qué es, la URL pública y una captura o GIF.
2. Cómo funciona: diagrama mermaid de los 3 agentes y la máquina de estados.
3. Stack, todo en plan gratuito, y por qué cada pieza.
4. Decisiones técnicas: workspace virtual, ejecución por pasos y testing en dos capas.
5. **Cómo se construyó con Claude Code** (resumen del log: CLAUDE.md + skills, fases, plan mode y verificación).
6. Ejecutarlo en local: requisitos, `.env.local`, migración y `npm run dev`. Modo `LLM_PROVIDER=mock` para probar sin clave.
7. Limitaciones y siguientes pasos.

`docs/architecture.md`: más detalle técnico y diagramas.

## Checklist de despliegue (lo hace el programador)
1. Push a GitHub (repo público o con acceso para los evaluadores).
2. Vercel → Add New Project → importar el repo (Next.js autodetectado), plan Hobby.
3. Añadir las variables de entorno (Production y Preview).
4. Deploy y abrir la URL: lanzar un run y verificar las tarjetas, el kanban, la timeline y la vista previa.
5. Lanzar un run de vez en cuando durante la evaluación para que Supabase no pause el proyecto.
6. Poner la URL y el enlace al repo en el README.
