---
name: motor-agentes
description: Diseño del motor de agentes (Orquestador, Develop, Testing), máquina de estados, herramientas, checks deterministas y wrapper LLM gratuito (Gemini/mock). Úsala al crear o modificar cualquier cosa en src/lib/agents/ o src/lib/llm/.
---

# Motor de agentes

Todo vive en `src/lib/agents/` y `src/lib/llm/`. Sin dependencias de React ni de Next. Cada agente recibe contexto y devuelve un resultado validado con zod; **solo el engine escribe en la BD**.

## Máquina de estados — `engine.ts` → `advanceRun(runId)`

Un paso = una acción de un agente. Antes de cada paso, el engine marca `runs.current_agent` y `runs.current_action` y escribe un evento `status`.

```
run 'queued'
  └► ORQUESTADOR planifica → crea tasks 'pending' → run 'running'

run 'running' → primera task (por position) que no esté 'done' ni 'failed':
  ├ 'pending' | 'changes_requested' → attempts++ → 'in_progress' → DEVELOP hace el intento → 'testing'
  ├ 'in_progress' (paso anterior interrumpido) → DEVELOP repite el MISMO intento (sin attempts++)
  ├ 'testing' → TESTING evalúa y guarda test_report (attempt = attempts)
  │     ├ todo OK → 'done'
  │     └ fallos  ├ attempts < 3  → 'changes_requested' (Develop recibe el feedback)
  │               └ attempts >= 3 → 'failed'
  └ no quedan tasks → ORQUESTADOR redacta el resumen → 'completed' | 'completed_with_errors'

Excepción no recuperable → run 'error' + evento 'error'.
LLM no disponible (LLMUnavailableError: 429 o 5xx tras los reintentos) → evento 'error'
con un texto claro; el run NO pasa a 'error': se queda en su estado y advanceRun
devuelve `paused: { reason }`. La UI decide con `decideAfterStep` (skill panel-ui):
  reason 'overloaded' (503) → reanuda sola tras 20 s (máx. 3 seguidas)
  reason 'quota' (429)      → pausa; hay que pulsar Reanudar
  reason 'timeout'          → no queda tiempo en el paso; sigue en el siguiente
```

- `attempts` cuenta los intentos **empezados** (se incrementa al empezar Develop), así la UI muestra «intento 2/3» mientras trabaja.
- Presupuesto de tiempo por paso: `STEP_BUDGET_MS` (48 s, la función tiene `maxDuration = 60`). Develop no empieza un turno si quedan menos de 14 s: entrega lo que tiene a Testing. Los reintentos y el ritmo entre llamadas nunca esperan más allá de la hora límite.
- Si Testing devuelve dos veces una salida no válida, se decide solo con los checks deterministas (evento `error` visible). Si el resumen final falla, se usa uno generado sin LLM.
- `stepWithLock(runId, deps)` toma el lock, avanza un paso y lo libera (null → 409).

Límites (`limits.ts`): 1–6 tasks por run, 3 intentos por task y 6 turnos de herramientas por paso de Develop.

## Orquestador — `orchestrator.ts`
- Entrada: la petición y el listado de archivos (ruta + primeras 15 líneas).
- Salida (función forzada `create_plan`):
```ts
{ summary: string,
  tasks: Array<{
    title: string,
    description: string,
    acceptance_criteria: Array<{
      id: string,                 // "c1", "c2"…
      description: string,
      check?:
        | { type: 'file_exists', path: string }
        | { type: 'selector_exists', path: string, selector: string }
        | { type: 'text_contains', path: string, text: string }
        | { type: 'link_exists', from: string, href: string }
    }> }> }
```
- Si la petición no consiste en modificar la web, devuelve 0 tareas con una explicación y el run termina limpio.
- Al final, `summarizeRun()` resume qué se hizo y qué falló.

## Develop — `develop.ts`
- Entrada: la task, sus criterios, el último `feedback` de Testing (si existe) y **el contenido de los archivos relevantes**: `prioritizeFiles` pone primero los que nombra el texto de la tarea (título, descripción y checks), luego `css/styles.css` y después el resto, de menor a mayor; `filesBlock` los mete hasta `PROMPT_FILES_BUDGET` (8.000 caracteres) y lista los que no caben para que los lea con `read_file`. Así escribe en el primer turno sin gastar peticiones en leer.
- Herramientas (`tools.ts`): `list_files`, `read_file(path)`, `write_file(path, content)`, `delete_file(path)`, `finish(summary)`.
- **Develop termina tras el primer turno con escrituras correctas**, aunque no llame a `finish`: esa segunda petición solo serviría para cerrar, arrastra todo lo escrito y era la que más fallaba en el plan gratuito. El resumen lo genera el código («He modificado X para cumplir…»); si el modelo llama a `finish` en el mismo turno, se usa el suyo. Si alguna escritura falla (ruta no válida, demasiado grande), el error vuelve al modelo y sigue el bucle. Testing revisa el resultado y, si falta algo, lo pide en el siguiente intento.
- Cada llamada a una herramienta genera un evento `action` legible («Escribiendo contact.html»).
- Debe enlazar las páginas nuevas desde la navegación y respetar el estilo de la web semilla.
- Validación de rutas en `workspace.ts`: solo rutas relativas, sin `..`; extensiones `.html .css .js .json .svg .md .txt`; máximo 100 KB por archivo.

## Testing — `testing.ts` + `checks.ts`
1. **Deterministas** (`checks.ts`, funciones puras con tests): los `check` de cada criterio + checks globales sobre toda la web (existe `index.html`, HTML bien formado, y enlaces, CSS, JS e imágenes internos que existen).
   - `text_contains` busca en el texto **visible** del HTML (sin `<script>` ni `<style>`), sin distinguir mayúsculas y con los espacios normalizados.
   - `link_exists` resuelve rutas relativas, anclas y query strings (`./contacto.html#form` cuenta como `contacto.html`).
   - Un selector no válido o una ruta peligrosa hacen fallar el check con una explicación; nunca lanzan una excepción.
   - La web semilla vive en `src/seed/site/` y la carga `src/seed/index.ts`. Un test garantiza que pasa todos los checks globales.
2. **LLM** (función forzada `submit_report`) con los archivos tocados, los criterios y el resultado de los checks:
```ts
{ passed: boolean,
  results: Array<{ criterion_id: string, passed: boolean, reason: string }>,
  feedback_for_develop: string }
```
Regla: `passed` final = LLM `passed` **Y** todos los checks deterministas OK.

## Wrapper LLM — `src/lib/llm/`
Interfaz única, para que los agentes no sepan qué proveedor hay detrás:
```ts
interface LLMProvider {
  callWithTools(input: {
    system: string;
    messages: Msg[];
    tools: ToolDef[];          // JSON Schema generado desde zod
    forceTool?: string;
  }): Promise<{ toolCalls: ToolCall[]; text?: string; usage?: Usage }>;
}
```
- `gemini.ts` (por defecto): SDK `@google/genai`, function calling. Modelo en `LLM_MODEL`; copiar el ID exacto desde Google AI Studio, porque los modelos cambian a menudo. Modelo de la entrega: `gemini-3.5-flash-lite` (cuotas por modelo en la skill `entrega`).
  - `thinkingLevel: LOW` **solo a modelos que no son «lite»** (`wantsThinkingLevel`): baja la latencia de los Flash grandes (20-40 s → ~10 s), pero a los Flash-Lite los empeora (36-52 s con él, 5-10 s sin él, medido con el prompt real del Orquestador). Si un modelo lo rechaza con 400, se desactiva y se repite la llamada.
  - `httpTimeoutMs(deadline)`: el plazo HTTP es lo que queda del paso, con tope de 45 s. Gemini rechaza con 400 los plazos menores de 10 s, así que si queda menos no se llama: se lanza `LLMUnavailableError("timeout")` y el run sigue en el paso siguiente (no es un error del run).
- `mock.ts`: respuestas guionizadas y deterministas, para tests y para `LLM_PROVIDER=mock` (la demo funciona aunque no haya cuota).
- `index.ts`: elige el proveedor con `LLM_PROVIDER` (`gemini` | `mock`). No hay más proveedores: si se agota la cuota de Gemini, se usa `mock`.
- Comunes: reintentos con backoff exponencial ante 429/5xx (máx. 3, respetando `retry-after`), timeout de 45 s, validación zod de los argumentos (si fallan, se reintenta una vez devolviendo el error al modelo) y registro del uso en el `payload` del evento.
  - `retry.ts`: `withRetry` (si la espera no cabe en el paso o supera 20 s, corta con `LLMUnavailableError`) y `createPacer` (mínimo 4,5 s entre llamadas a Gemini).
  - `structured.ts`: `callStructured` (herramienta forzada + zod + un reintento) y `toolFromZod` (JSON Schema con `z.toJSONSchema`).
  - El check del plan se pide al LLM en formato **plano** (`type`, `path?`, `selector?`…), más fácil para modelos pequeños que una unión discriminada. `normalizePlan` lo convierte y descarta los incompletos o con rutas peligrosas.
  - **Gemini 3** devuelve `thoughtSignature` en las llamadas a funciones: el mensaje `assistant` guarda el contenido original en `raw` y se reenvía intacto en el siguiente turno.
  - `CallInput.meta`: datos estructurados del agente que llama. Gemini los ignora; el mock los usa para responder con coherencia.
  - Mock de demo (`createMockProvider`): entiende las peticiones de ejemplo (contacto, testimonios, hamburguesa; el resto añade un aviso) y falla a propósito el primer intento de enlazar Contacto en la navegación, para que se vea el ciclo de cambios. Para tests, `createScriptedProvider`.
- Los planes gratuitos tienen pocas peticiones por minuto: no lanzar llamadas en paralelo.

## Prompts — `prompts.ts`
En español, cortos y con rol, formato y límites explícitos. Cada prompt termina pidiendo usar la herramienta correspondiente. Nada de cadena de pensamiento larga, que gasta cuota.

## Tests mínimos (Vitest)
- `checks.ts`: cada tipo de check, en positivo y en negativo.
- `workspace.ts`: rechaza rutas peligrosas.
- `engine.ts` con el proveedor mock: un run completo con una tarea que falla una vez y luego pasa, y una tarea que agota los 3 intentos.

## CLI
`npm run demo:cli -- "Añade una página de contacto" [--mock] [--memory] [--run <id>]` ejecuta `stepWithLock` en bucle contra Supabase e imprime los eventos. Sirve para probar el motor sin UI.
- `--mock`: sin gastar cuota.
- `--memory`: sin Supabase.
- `--run <id>`: reanuda un run en pausa.

`npm run llm:check` verifica `LLM_MODEL` con una sola llamada (function calling forzado), lista los modelos Flash si el modelo no es válido y avisa si no es un «lite» (20 peticiones al día).

Almacén: `store.ts` define la interfaz `RunStore`, con `store-supabase.ts` (cliente inyectado) y `store-memory.ts` (tests y `--memory`).
