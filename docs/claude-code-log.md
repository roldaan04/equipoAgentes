# Cómo se usó Claude Code

Registro, fase a fase, de cómo se construyó el proyecto con Claude Code. Se escribe al cerrar cada fase.

## Preparación — CLAUDE.md, skills y plan
- **Petición a Claude Code**: leer CLAUDE.md y las 4 skills (`motor-agentes`, `base-de-datos`, `panel-ui`, `entrega`), proponer un plan por fases y señalar huecos o contradicciones antes de empezar.
- **Cómo se usó**: el contexto del proyecto vive en `CLAUDE.md` (reglas, fases, quién hace qué) y en skills de `.claude/skills/` que se cargan por área. Claude Code revisó los documentos frente al SQL y al `.env.example` reales antes de escribir código.
- **Decisiones** (aprobadas por el programador):
  - Groq fuera: proveedores `gemini` y `mock`, que hace de repuesto si se agota la cuota.
  - Nueva migración `0002_run_quota.sql` para sacar `client_ip_hash` de `runs`, que es legible públicamente.
  - `MAX_RUNS_PER_HOUR=5`, para no agotar las ~500 peticiones diarias de Gemini.
  - Vista previa con `[[...path]]` y URL explícita `index.html`, porque Next quita la barra final y eso rompe los enlaces relativos.
  - Ritmo mínimo entre llamadas al LLM y `quotaExhausted` con pausa automática en la UI.
  - Estado `in_progress` visible mientras trabaja Develop.
  - `RunStore` inyectable, para testear el engine sin BD.
  - Cliente secreto en `admin.ts` sin `server-only`, para que la CLI pueda usarlo.
- **Correcciones**: ninguna; el plan se ajustó antes de escribir código.

## Fase 0 — Scaffold
- **Petición a Claude Code**: ejecutar la fase 0: Next.js + TS + Tailwind + ESLint + Vitest, scripts `typecheck` y `test`, `.gitignore` y `.env.example`.
- **Cómo se usó**: `create-next-app@latest` en una carpeta temporal (no admite carpetas con archivos) y copia al proyecto, conservando el `.gitignore` propio. Claude Code leyó la documentación incluida en Next 16 (`node_modules/next/dist/docs/`) para decidir sobre `cacheComponents`. Bucle lint → typecheck → test → build hasta verde.
- **Decisiones**:
  - Next 16.4 con `cacheComponents` (el valor por defecto recomendado). Encaja porque toda la app es dinámica.
  - TS estricto con `noUncheckedIndexedAccess`.
  - ESLint con `no-explicit-any` como error y una regla `no-restricted-imports` que impide importar React o Next desde `src/lib/agents` y `src/lib/llm`. La convención de CLAUDE.md queda así comprobada automáticamente.
  - `@types/node` 24, porque Vitest 5 exige 22 o superior y coincide con el Node local.
  - Groq retirado de CLAUDE.md, de las skills y de `.env.example` en el mismo cambio.
- **Correcciones**: conflicto de peer dependencies entre Vitest 5 y `@types/node@20` del scaffold, resuelto subiendo a la 24. `tsc` fallaba en un clon limpio porque `LayoutProps` lo genera Next: el script `typecheck` pasa a ser `next typegen && tsc --noEmit`, verificado borrando antes `.next`.

## Fase 1 — Supabase, entorno y workspace
- **Petición a Claude Code**: migración `0002_run_quota.sql`, clientes de Supabase, tipos, `env.ts`, `workspace.ts` con tests y un script que compruebe la conexión leyendo las tablas sin imprimir claves.
- **Cómo se usó**: skills `base-de-datos` y `entrega`. Claude Code leyó los tipos de `postgrest-js` para escribir a mano un tipo `Database` compatible. Luego lanzó `npm run db:check` contra el proyecto real y, como el error llegaba vacío, escribió una sonda puntual hasta ver el código de Postgres. Bucle lint → typecheck → test → build hasta verde.
- **Decisiones**:
  - `env.ts` con zod: `LLM_MODEL` y `GEMINI_API_KEY` solo son obligatorias con `gemini`; las variables vacías cuentan como no definidas; los defaults son 5 runs por hora y 3 por IP; los errores muestran nombres, nunca valores.
  - `admin.ts` (sin `server-only`, para la CLI) y `server.ts` (con `server-only`, para la app).
  - Listas de columnas públicas en `types.ts`, para no usar nunca `select *`.
  - `workspace.ts` puro: normaliza y valida rutas (sin `..`, absolutas, `\`, ocultas ni extensiones no permitidas), mide los 100 KB en bytes UTF-8 y da el Content-Type para la vista previa.
  - La 0002 añade además un trigger para `updated_at`, así que el código no tiene que acordarse.
- **Correcciones**:
  - `db:check` mostró `42501 permission denied` incluso con la clave secreta. Este proyecto de Supabase no concede privilegios automáticos a los roles de la API sobre tablas creadas por SQL. Como la 0001 ya estaba ejecutada, los `GRANT` se añadieron a la 0002, y la regla «toda tabla nueva lleva sus GRANT» quedó documentada en la skill `base-de-datos`.
  - El primer `db:check` usaba `head: true`, que no devuelve cuerpo de error y producía falsos positivos. Se cambió a `select … limit 1` y a comprobar códigos de error concretos (`PGRST205` para tabla inexistente, `42703` para columna inexistente).
