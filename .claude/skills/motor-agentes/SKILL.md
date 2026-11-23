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
  ├ 'pending' | 'changes_requested' → DEVELOP hace un intento → 'testing'
  ├ 'testing' → TESTING evalúa
  │     ├ todo OK → 'done'
  │     └ fallos  → attempts++ y guarda test_report
  │                 ├ attempts < 3  → 'changes_requested' (Develop recibe el feedback)
  │                 └ attempts >= 3 → 'failed'
  └ no quedan tasks → ORQUESTADOR redacta el resumen → 'completed' | 'completed_with_errors'

Excepción no recuperable → run 'error' + evento 'error'.
Cuota del LLM agotada (429 tras los reintentos) → evento 'error' con un texto claro;
el run NO pasa a 'error': se queda en su estado y se puede reanudar más tarde.
```

Límites: 1–6 tasks por run, 3 intentos por task y 6 turnos de herramientas por paso de Develop.

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
- Entrada: la task, sus criterios, el último `feedback` de Testing (si existe) y el listado de archivos.
- Herramientas (`tools.ts`): `list_files`, `read_file(path)`, `write_file(path, content)`, `delete_file(path)`, `finish(summary)`.
- Cada llamada a una herramienta genera un evento `action` legible («Escribiendo contact.html»).
- Debe enlazar las páginas nuevas desde la navegación y respetar el estilo de la web semilla.
- Validación de rutas en `workspace.ts`: solo rutas relativas, sin `..`; extensiones `.html .css .js .json .svg .md .txt`; máximo 100 KB por archivo.

## Testing — `testing.ts` + `checks.ts`
1. **Deterministas** (`checks.ts`, funciones puras con tests): los `check` de cada criterio + checks globales (HTML parseable, enlaces internos que existen, CSS/JS referenciados que existen).
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
- `gemini.ts` (por defecto): SDK `@google/genai`, function calling. Modelo en `LLM_MODEL`; copiar el ID exacto desde Google AI Studio, porque los modelos cambian a menudo.
- `mock.ts`: respuestas guionizadas y deterministas, para tests y para `LLM_PROVIDER=mock` (la demo funciona aunque no haya cuota).
- `index.ts`: elige el proveedor con `LLM_PROVIDER` (`gemini` | `mock`). No hay más proveedores: si se agota la cuota de Gemini, se usa `mock`.
- Comunes: reintentos con backoff exponencial ante 429/5xx (máx. 3, respetando `retry-after`), timeout de 45 s, validación zod de los argumentos (si fallan, se reintenta una vez devolviendo el error al modelo) y registro del uso en el `payload` del evento.
- Los planes gratuitos tienen pocas peticiones por minuto: no lanzar llamadas en paralelo.

## Prompts — `prompts.ts`
En español, cortos y con rol, formato y límites explícitos. Cada prompt termina pidiendo usar la herramienta correspondiente. Nada de cadena de pensamiento larga, que gasta cuota.

## Tests mínimos (Vitest)
- `checks.ts`: cada tipo de check, en positivo y en negativo.
- `workspace.ts`: rechaza rutas peligrosas.
- `engine.ts` con el proveedor mock: un run completo con una tarea que falla una vez y luego pasa, y una tarea que agota los 3 intentos.

## CLI
`npm run demo:cli "Añade una página de contacto"` ejecuta `advanceRun` en bucle contra Supabase e imprime los eventos. Sirve para probar el motor sin UI.
