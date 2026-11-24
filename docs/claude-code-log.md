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

## Fase 5 (continuación) — Pruebas reales con Gemini y estabilización
- **Petición a Claude Code**: el programador probó la app en el navegador con Gemini real, los runs fallaban o se quedaban parados, y pidió averiguar por qué y cómo evitarlo para poder entregarla.
- **Cómo se usó**: Claude Code no se fio de las explicaciones intuitivas y fue midiendo.
  - Consultó la base de datos en solo lectura (sin mostrar claves) para ver los eventos, las pausas y los archivos generados de cada run, y leyó los logs del servidor y las capturas del panel de límites de Google AI Studio que aportó el programador.
  - Escribió scripts temporales (ya borrados, no están en el repositorio) que hacían llamadas reales a Gemini cambiando **una sola variable cada vez** (tamaño de entrada, tamaño de salida, herramientas o texto, streaming, modelo). En total, unas 100 llamadas de la cuota gratuita en todo el proceso.
  - Consultó la documentación oficial de límites y precios de Gemini, Groq, OpenRouter y Cerebras.
- **Modelo final: `gemini-3.5-flash-lite`** (`LLM_PROVIDER=gemini`, con `mock` como repuesto de demostración).
  - Es de los dos únicos modelos del plan gratuito con **500 peticiones al día y 15 por minuto**. Los Flash grandes (`gemini-3.5-flash` y `3.6-flash`) tienen solo **20 al día y 5 por minuto**: se agotaron a la primera tanda de pruebas.
  - Es el más rápido. En una tanda que **alterna los dos modelos llamada a llamada** (para que la hora no influya), la mediana de una llamada de Develop fue ~3,6 s frente a 9,6-14,6 s de `gemini-3.1-flash-lite`, y el peor caso 4 s frente a 60 s. Esa velocidad deja margen para reintentos dentro del paso de 48 s.
  - Resultado con él: un run de «página de contacto» completo en ~22 s, 4 peticiones, un intento y 13 de 13 checks deterministas correctos.
  - Otros proveedores gratuitos se compararon y se descartaron: OpenRouter (50 peticiones al día sin pagar), Groq (8.000 tokens por minuto, unos 4 runs al día) y Cerebras (exige método de pago verificado y el crédito caduca). Se mantiene la decisión de Gemini más `mock`.
- **Errores encontrados y cómo se resolvieron**:
  - **«Se ha agotado la cuota» (429) con cuota aparentemente libre.** El proyecto asumía ~500 peticiones al día, cierto solo para los modelos Lite; el modelo en uso tenía 20 al día y 5 por minuto. El error trae `retryAfterSeconds` de ~48.500 s: la cuota diaria se renueva a medianoche (hora del Pacífico, ~9:00 en España). Solución: pasar a Flash-Lite.
  - **Llamadas de 36 a 52 s (y 503).** El ajuste `thinkingLevel: LOW` de la Fase 4 ayudaba a `gemini-3.5-flash`, pero empeora a los Lite. Medido con el prompt real del Orquestador: 36-52 s con él, 5-10 s sin él. Solución: `wantsThinkingLevel()` no lo envía a modelos «lite», con test. **Esto corrige lo que dice la entrada de la Fase 4**, que solo valía para los Flash grandes.
  - **`Gemini 400: Manually set deadline 6s is too short. Minimum allowed deadline is 10s`.** Tras varios reintentos quedaban ~6 s del paso y se pedía ese plazo a Gemini; al ser un 400 no reintentable, la app mataba el run como «error no recuperable». Solución: `httpTimeoutMs()`; si quedan menos de 10 s no se hace la llamada y se pausa con suavidad («continuará en el siguiente paso»), con test que reproduce el caso real.
  - **503 «This model is currently experiencing high demand».** Es saturación del plan gratuito de Google y **no depende de nuestro código**. Se descartaron causas propias con los experimentos:
    - *El tamaño del prompt*: la primera hipótesis («más de ~10.000 caracteres da 503») se refutó, porque un prompt de 6.364 caracteres también fallaba.
    - *El modelo*: la primera tanda (un modelo detrás del otro) sugería 92 % de éxito frente a 54 %, pero era un efecto de la hora. Alternando los modelos, **ambos fallan ~42 %**. Los fallos llegan en ráfagas de ~2 seguidas y la tasa varió entre ~8 % y ~42 % en media hora.
    - *Entrada grande o pequeña*: misma velocidad (3,63 s frente a 3,56 s). Sí influye el tamaño de la **salida** en la latencia (escribir un CSS entero: ~3,6 s; una llamada mínima: ~0,9 s), pero no en la tasa de fallos.
    - Ni el streaming ni quitar las herramientas mejoraron nada.
  - **Cada 503 exigía pulsar Reanudar** (el run de pruebas con `gemini-3.1-flash-lite` necesitó dos pausas manuales). Solución: `decideAfterStep()` (regla pura, 7 tests) y el driver espera 20 s con cuenta atrás visible y reanuda solo, hasta 3 veces seguidas sin ningún paso completado entre medias. La cuota agotada (429) **no** se reanuda sola, porque puede ser la diaria y reintentar gastaría peticiones.
  - **Optimizaciones que se mantienen** (no se presentan como la cura del 503): Develop recibe solo los archivos relevantes para la tarea (`prioritizeFiles`, presupuesto de 8.000 caracteres) y termina al escribir sin errores en vez de gastar otra petición para llamar a `finish`. Un run de 2 tareas cuesta 6 peticiones y ~16.800 tokens.
- **Límites de protección**: durante las pruebas el programador se topó con el límite por visitante (3 runs por hora), que es el comportamiento esperado y muestra su mensaje claro. Para seguir probando se subieron temporalmente en `.env.local`; **hay que devolverlos a 5 y 3 antes de desplegar**.
- **Sin resolver / pendiente**:
  - Un formulario quedó 13 minutos en «Lanzando…»: el servidor había respondido bien (`POST /api/runs` 201 y `GET /runs/<id>` en 37 ms), pero la navegación en el cliente no terminó. No se ha vuelto a reproducir y **la causa sigue sin determinar**.
  - Los 503 de Google persisten a ratos; la app los gestiona (pausa, aviso, reanudación automática), pero no se pueden evitar.
  - La reanudación automática está verificada con tests de la regla de decisión, pero **no se ha visto en el navegador**: en el run final no hubo ningún 503.
  - Propuestos y sin implementar: pasar a `mock` automáticamente si Gemini falla o se agota, alternar entre dos modelos Lite al reintentar, tope diario de peticiones al LLM, proteger `/step` (cualquiera puede avanzar un run ajeno), y subir los límites de runs para que no bloqueen a varios entrevistadores seguidos.
- **Lección de proceso**: la primera comparación entre modelos parecía concluyente y estaba confundida con la hora; se detectó y se repitió alternando los modelos antes de decidir. Las pruebas guiaron cada arreglo: ninguna causa se dio por buena sin una medición.

## Fase 6 — Pulido: estados de error, documentación al día y verificación en navegador
- **Petición a Claude Code**: ponerse al día con los cambios hechos tras la Fase 5 (modelo `gemini-3.5-flash-lite`, `wantsThinkingLevel`, `httpTimeoutMs`, Develop sin `finish`, reanudación automática ante 503), actualizar la documentación que los contradecía y pulir estados vacíos, errores y responsive.
- **Cómo se usó**: Claude Code leyó el log, `git log` y los diffs del último commit antes de tocar nada, y contrastó cada afirmación del programador con el código. Skills `panel-ui`, `motor-agentes` y `entrega`; documentación de Next 16 incluida (`error.js`: la prop es `retry`, no `reset`). Verificación con Chrome headless (playwright-core en el scratchpad) contra el build de producción con `LLM_PROVIDER=mock`, simulando respuestas de `/step` con `page.route`.
- **Documentación corregida** (contradecía el código):
  - `motor-agentes`: Develop recibe solo los archivos relevantes (`prioritizeFiles`, 8.000 caracteres, no 40.000) y termina tras un turno de escrituras correctas sin `finish`; `thinkingLevel` solo a modelos no «lite»; `httpTimeoutMs` y el mínimo de 10 s; qué hace la UI con cada `paused.reason`.
  - `panel-ui`: el driver ya no solo se pausa con `quotaExhausted` (503 → reanudación automática con cuenta atrás, 429 → pausa manual, `timeout` → sigue); ruta real de la vista previa (`[[...path]]`); firma de `useRunDriver`; páginas de error.
  - `entrega`: tabla de cuota por modelo (Flash-Lite 500/día y 15/min; Flash grandes 20/día y 5/min), cuándo se renueva y recordatorio de devolver los límites de runs a 5 y 3 antes de desplegar.
  - `.env.example` y CLAUDE.md: recomiendan `gemini-3.5-flash-lite` y avisan de los 20/día de los Flash grandes. `npm run llm:check` también lo avisa.
  - Comentario de `limits.ts`: decía que con ~11.000 caracteres siempre da 503, una hipótesis que el propio log refuta.
- **Pulido**:
  - `src/app/not-found.tsx` y `src/app/error.tsx` en español (antes salían las páginas por defecto de Next, en inglés). El error solo muestra el `digest`.
  - `LaunchForm`: si `router.push` no ha navegado a los 5 s, navegación completa. Es la red de seguridad para el «Lanzando…» colgado de la Fase 5, cuya causa sigue sin determinar.
  - `RecentRuns`: error legible con botón Reintentar.
  - Prompt de Develop: `finish` «en el mismo turno que las escrituras», coherente con que el bucle termina tras escribir.
- **Corrección inesperada: `npm test` fallaba siempre** (8 de 8 suites con «Cannot read properties of undefined (reading 'config')»), mientras `npx vitest run` pasaba. Claude Code aisló la causa con un script que lanza Vitest con el directorio de trabajo `c:\…` frente a `C:\…`: npm 11 ejecuta los scripts con la unidad en minúscula (como abre el proyecto VS Code) y Vitest 5 carga entonces sus módulos dos veces. Fijar `root` o hacer `chdir` en `vitest.config.mts` llega tarde, así que `npm test` pasa ahora por `scripts/vitest.mjs`, que normaliza la unidad del directorio y del binario antes de lanzar Vitest.
- **Verificado en el navegador** (13/13):
  - 404 en español; un id de run no válido muestra «Run no encontrado».
  - Runs recientes: un error 500 simulado se ve, y Reintentar recupera la lista.
  - Tras pulsar Lanzar, navega al panel en ~1,1 s.
  - **Reanudación automática ante un 503 simulado** (pendiente desde la Fase 5): banner con cuenta atrás (20 → 18 s, «intento 1 de 3»), reanuda sin pulsar nada y el run termina.
  - **Cuota agotada (429) simulada**: se pausa, no da ningún paso en 4 s, y con Reanudar el run termina.
  - Móvil (390 px): sin desbordamiento en el inicio, el panel y la 404. La vista previa carga en móvil (enlaces Inicio, Carta y Nosotros visibles).
  - Consola sin errores.
- **Sigue pendiente**: la causa raíz del «Lanzando…» colgado (ahora hay red de seguridad), proteger `/step` frente a terceros y el resto de propuestas de la Fase 5 (pasar a mock automáticamente, tope diario de peticiones).

## Fase 7 — Entrega: README, arquitectura, checklist de despliegue y verificación final
- **Petición a Claude Code**: cerrar la fase 7 y confirmar que todo está terminado.
- **Cómo se usó**: skill `entrega` (estructura del README y checklist). Antes de escribir la documentación, Claude Code comprobó que lo que iba a afirmar era cierto:
  - **Clon limpio** del repositorio en el scratchpad (solo lo commiteado, sin `.env.local`): `npm ci`, lint, typecheck, 111 tests y build en verde. Es lo que verá Vercel.
  - **Run real con Gemini** y el modelo de la entrega (`LLM_PROVIDER=gemini LLM_MODEL=gemini-3.5-flash-lite npm run demo:cli`, sobrescribiendo por variable de entorno sin leer `.env.local`). Llegó un 503 real de Google en el primer Develop, y al reanudar el run siguió donde estaba. Plan de 2 tareas: Testing **rechazó el intento 1 de la segunda tarea por un check determinista** (faltaba el enlace en `nosotros.html`), Develop lo corrigió y el run terminó `completed` en 7 pasos. Es el run de las capturas del README.
  - **Capturas** del inicio, el panel y el drawer de informes con Chrome headless contra el build de producción. La primera captura del panel salió con las tarjetas a medio animar y el iframe en blanco (efecto de la captura de página completa); se repitió con un viewport alto y esperando a la animación.
  - Cada afirmación de los documentos se contrastó con el código: las cascadas de las FK para el SQL de limpieza, los nombres de los tests del engine y el coste en peticiones medido en el run real.
- **Entregables**:
  - `README.md`: qué es, captura, diagramas mermaid (flujo y estados), stack, decisiones, cómo se usó Claude Code, ejecución en local y limitaciones.
  - `docs/architecture.md`: mapa del código, modelo de datos, secuencia de un paso, agentes, capa LLM, tiempo real, seguridad y límites.

## Corrección tras el despliegue — «Lanzando…» al volver a inicio
- **Petición a Claude Code**: el programador probó la demo en producción y, al volver a la página principal desde un run terminado, el botón se quedaba en «Lanzando…» hasta pulsar F5. El resto funcionaba bien.
- **Cómo se usó**: Claude Code no se fio de la hipótesis anterior (la navegación no termina) y reprodujo el fallo antes de tocar nada, con Chrome headless contra el build de producción y el mock. La captura del programador ya daba la pista: el formulario conservaba el texto escrito, así que el componente no se había vuelto a montar.
- **Causa**: con `cacheComponents`, Next 16 no desmonta la página al navegar: la oculta con `<Activity>` y conserva su estado de React y del DOM. `LaunchForm` ponía `submitting = true` y, si el POST salía bien, solo llamaba a `router.push` sin apagarlo. Al volver (con «atrás» o con «← Inicio») reaparecía la misma página con el botón bloqueado. Reproducido con los dos recorridos.
- **Esto explica el «Lanzando…» de 13 minutos** que en la Fase 5 se dio por no resuelto y para el que en la Fase 6 se añadió una navegación de respaldo: no era un fallo de navegación, así que esa red de seguridad no habría arreglado nada. Se mantiene, pero ahora solo actúa si la navegación realmente se queda colgada.
- **Arreglo**: `useTransition`. «Lanzando…» dura mientras el POST está en curso (`creating`) o la navegación está pendiente (`navigating`), y se apaga solo al terminar. La navegación de respaldo se cancela cuando `navigating` pasa a false. La skill `panel-ui` recoge la regla.
- **Verificación**: en el navegador, con el `POST /api/runs` interceptado para devolver un run ya terminado y no gastar cuota, en los dos recorridos (botón atrás y enlace «← Inicio»): el botón vuelve a «Lanzar equipo» y se puede lanzar otro run desde esa misma página. Se esperaron 8 s para confirmar que la navegación de respaldo no vuelve a disparar. Lint, typecheck, 111 tests y build en verde.
- **Dos cosas que se vieron por el camino**:
  - Los runs de prueba contra el servidor local cuentan en el límite por hora de la demo pública, porque ambos usan la misma tabla `run_quota`. Las pruebas posteriores se hicieron sin crear runs.
  - Ante el límite, el formulario muestra el aviso y el botón vuelve a «Lanzar equipo» (comprobado).
