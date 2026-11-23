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

## Fase 2 — Web semilla y checks deterministas
- **Petición a Claude Code**: crear la web semilla y `checks.ts` con sus tests.
- **Cómo se usó**: skill `motor-agentes`. Antes de escribir los checks, Claude Code lanzó una sonda contra `node-html-parser` para comprobar en la práctica qué detecta `valid()`, qué selectores soporta y qué incluye `textContent`. Leyó la documentación de Next 16 sobre `outputFileTracingIncludes`. Bucle lint → typecheck → test → build hasta verde.
- **Decisiones**:
  - Web semilla «Horno Alba» (panadería ficticia): 3 páginas con la misma navegación, CSS con variables y un JS mínimo. Es pequeña a propósito para gastar poco contexto del LLM, y deliberadamente no tiene página de contacto, testimonios ni menú hamburguesa, que son las peticiones de ejemplo de la UI.
  - La semilla se lee del disco y se incluye en la traza de `/api/runs` con `outputFileTracingIncludes`. Se descartó incrustarla en un módulo TS generado por ser más frágil de mantener.
  - `text_contains` mira el texto visible (sin `<script>` ni `<style>`) para que no pase por un atributo o un comentario.
  - `link_exists` resuelve rutas relativas, anclas y query strings.
  - Los checks globales se aplican a toda la web, no solo a lo tocado, para detectar regresiones (p. ej. Develop borra un archivo que otra página enlaza).
  - Un selector no válido o una ruta peligrosa hacen fallar el check con una explicación que llega a Develop; nunca lanzan una excepción.
  - Un test garantiza que la semilla pasa todos los checks globales.
- **Correcciones**: la sonda mostró que `textContent` incluye el código de `<script>` y `<style>` y pega bloques sin espacio. Se cambió a quitar esos nodos y usar `structuredText`. Los tests pasaron a la primera.

## Fase 3 — Capa LLM, los 3 agentes y el engine
- **Petición a Claude Code**: wrapper LLM (Gemini/mock), Orquestador, Develop y Testing, `engine.ts`, `npm run demo:cli` y una llamada mínima a Gemini para validar `LLM_MODEL`.
- **Cómo se usó**: skill `motor-agentes`. Claude Code leyó los tipos de `@google/genai` 3.6 antes de escribir el adaptador y descubrió que Gemini 3 exige reenviar el `thoughtSignature` en conversaciones con function calling. Escribió primero el script de verificación del modelo (`npm run llm:check`). Bucle test → CLI → lint → typecheck → build hasta verde. Probó el engine de punta a punta con la CLI, primero en memoria y después contra Supabase.
- **Decisiones**:
  - Un solo `LLMProvider` (`callWithTools`) y `callStructured` para las salidas con zod (herramienta forzada y un reintento devolviendo el error al modelo).
  - Cuota gratuita:
    - mínimo 4,5 s entre llamadas;
    - backoff ante 429/5xx que nunca espera más allá del presupuesto del paso (48 s);
    - si no cabe, `LLMUnavailableError`: el run se pausa (no pasa a error) y `advanceRun` devuelve `paused`.
  - Develop recibe el contenido de la web en el prompt (~12 KB), así escribe en el primer turno y termina en el segundo: 2 peticiones en lugar de 4-6.
  - El check del plan se pide en formato plano, no como unión discriminada, para modelos pequeños. `normalizePlan` descarta checks incompletos o con rutas peligrosas.
  - `attempts` se incrementa al empezar Develop, para que la UI muestre «intento 2/3» mientras trabaja. Un intento interrumpido por falta de cuota se repite sin contar doble.
  - Fallbacks sin LLM: si Testing devuelve dos veces una salida no válida, se decide con los checks deterministas; si falla el resumen, se genera uno sin LLM.
  - Mock de demo: entiende las peticiones de ejemplo y falla a propósito el primer intento de enlazar la navegación, para que se vea el ciclo Develop → Testing → cambios pedidos. Sirve de repuesto real si se agota la cuota.
  - `RunStore` inyectable: tests y `--memory` sin BD; Supabase en la app.
- **Correcciones**:
  - Un test del pacer destapó que la primera llamada esperaba sin motivo (`last = 0`); corregido.
  - La CLI mostró mensajes poco útiles («Cambios pedidos: Checks deterministas fallidos:» y un «✓ ✓» duplicado). Ahora la timeline muestra el primer criterio que falla y los iconos los pone la UI según el tipo de evento.
  - **Verificación de Gemini pendiente**: `gemini-3.1-flash-lite` existe (aparece en el listado de modelos y no da 404), pero durante toda la fase devolvió `503 high demand`, igual que `gemini-3.5-flash-lite`. `gemini-2.5-flash-lite` da 404 («no disponible para usuarios nuevos»). La clave funciona (no hay 401/403). El motor trata ese 503 como pausa reanudable, cubierto por tests.

## Fase 4 — API, lock, protección de cuota y vista previa
- **Petición a Claude Code**: rutas de la API, lock, protección de cuota y vista previa. Antes, volver a verificar Gemini.
- **Cómo se usó**: skills `entrega` y `base-de-datos`. Claude Code leyó la documentación de Next 16 sobre Route Handlers con `cacheComponents` y `maxDuration`. Lo verificó todo contra el build de producción (`next start` con `LLM_PROVIDER=mock`), recorriendo la API con curl: creación, pasos, 409 del lock, vista del run, lista, vista previa y casos de error.
- **Gemini, por fin verificado**: `gemini-3.1-flash-lite` seguía en 503, pero `gemini-3.5-flash` respondió con function calling en 1,4 s. Con él se hizo un **run real de punta a punta** desde la CLI contra Supabase: plan de 3 tareas, Develop escribiendo 5 archivos, Testing aprobando y una pausa reanudable ante un 503 que se reanudó con `--run`.
- **Decisiones**:
  - La lógica de servidor va en `src/lib/server/` con `server-only`; las reglas de cuota son puras y tienen tests.
  - Los `GET` llaman a `connection()` para ser dinámicos de forma explícita.
  - `GET /api/runs/[id]` devuelve los archivos sin contenido (el polling cada 2 s no arrastra el código), y el contenido sale de `/api/runs/[id]/files`.
  - Vista previa: 308 a `index.html` cuando no hay ruta (los enlaces relativos necesitan `/preview/<id>/`), CSP y `nosniff`. Un `POST` responde «formulario recibido (vista previa)» para que los formularios de la web generada no den error.
  - El build confirma que la web semilla entra en la traza de `/api/runs` (`.nft.json`), así que funcionará en Vercel.
- **Correcciones** (gracias al run real con Gemini):
  - El Orquestador generó un `selector_exists` con selector `form` sobre `css/styles.css`, imposible de cumplir. Ahora el prompt lo prohíbe y `normalizePlan` lo convierte en `text_contains` (y descarta `link_exists` desde archivos que no son HTML). Hay un test nuevo.
  - Latencia de 20-40 s por llamada, peligrosa con un paso de 60 s: `thinkingLevel: LOW` la bajó a unos 10 s, con fallback automático si el modelo no lo admite.
  - El SDK avisaba por consola al leer `res.text` en respuestas con llamadas a funciones; ahora el texto se extrae a mano de las partes.
  - En la prueba con curl, los acentos llegaban mal: era la terminal de Windows, no la app (comprobado enviando un cuerpo UTF-8 desde archivo). Se borró el run de prueba con texto roto.

## Fase 5 — UI completa, Realtime y driver de pasos
- **Petición a Claude Code**: la UI completa (inicio y panel del run), Realtime con polling de respaldo y el driver de pasos.
- **Cómo se usó**: skill `panel-ui`. Con `cacheComponents`, la página del run lee `params` dentro de `<Suspense>` (Partial Prerender). **Verificación en un navegador real**: con la skill `run`, Claude Code instaló `playwright-core` en el scratchpad (fuera del proyecto), lo conectó al Chrome del sistema en modo headless y condujo el build de producción con `LLM_PROVIDER=mock`: lanzó un run desde la UI, esperó a que terminara y comprobó automáticamente Realtime, la vista previa, el drawer y el móvil, además de revisar las capturas.
- **Decisiones**:
  - Un color por agente, definido una sola vez en `src/lib/ui/meta.ts` con clases completas (Tailwind no detecta clases construidas dinámicamente).
  - Iconos SVG en línea, sin librerías.
  - El estado de cada agente se deriva de `runs.current_agent` y de los últimos eventos de ese agente.
  - Las tarjetas del kanban se animan al montarse de nuevo con `key = id:status`.
  - Drawer con el historial de informes: veredicto por criterio, checks deterministas y feedback.
  - La vista previa se recarga cuando se completa una tarea; los archivos tocados por Develop van marcados.
  - El driver empieza en pausa si el run se quedó sin LLM y se pausa solo cuando llega `quotaExhausted`.
- **Correcciones** (todas detectadas en la prueba con navegador):
  - **Eventos perdidos al arrancar**: la timeline en directo mostraba 2 de los 4 eventos del primer paso. Un script aparte demostró que Realtime entrega el 100 % (10/10 eventos y todos los cambios de `tasks` y `runs`), así que era una carrera: el driver daba el primer paso mientras el canal se unía. Ahora el driver espera a la conexión en vivo y resincroniza 1 s después de `SUBSCRIBED`. Verificado de nuevo en el navegador: todos los eventos aparecen.
  - **Desbordamiento horizontal en móvil**: el grid sin `grid-cols-1` dejaba que el visor de código ensanchara la página. Ahora hay `grid-cols-1` y `min-w-0`, y se comprobó que `scrollWidth` vale 390 en un viewport de 390.
  - **Kanban inútil en móvil**: 6 columnas vacías de más de 1.000 px de alto. Ahora es una lista vertical con solo las columnas que tienen tareas.
