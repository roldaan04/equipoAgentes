# Documentación del desarrollo del equipo de agentes con Claude Code

**Autor:** Javier Roldán Gallego

---

## Equipo de agentes

### 1. Introducción y primeros pasos con Claude Code

Creación de un proyecto en Claude Desktop con el contexto y los requisitos del proyecto. Con ello, Claude nos crea el `CLAUDE.md` y las skills necesarias para integrarlas en una carpeta en Visual Studio Code, a la cual estará conectado nuestro Claude Code. Claude Code tendrá todo el contexto e instrucciones para trabajar adecuadamente y tal y como queremos para el proyecto específico.

### 2. Creación de Supabase, repositorio en GitHub y claves `.env`

Para la base de datos se ha usado Supabase con su plan gratuito. Una vez creado el proyecto, Claude Code ha preparado el archivo `supabase/migrations/0001_init.sql`, que contiene las tablas del sistema (ejecuciones, tareas, informes de testing, eventos de los agentes y archivos de trabajo), los permisos de lectura y la activación del tiempo real. Este archivo se ejecuta manualmente en el SQL Editor de Supabase.

He creado un proyecto en AI Studio de Google con una API key para usar sus modelos gratuitamente, y un proyecto en GitHub de cara a subir el proyecto en varios commits al repositorio y, finalmente, poder desplegarlo en Vercel desde GitHub.

He añadido las claves de Supabase, `API_KEY`, etc. al `.env`.

### 3. Fases del proyecto

He realizado un prompt inicial, junto con todo el contexto que ya tenía el proyecto, para inicializar un plan por fases para que Claude Code vaya desarrollando el proyecto mientras yo observo, entiendo y verifico que vaya todo correctamente.

### 4. Commit y pruebas por fases

Cada vez que se realiza un commit a GitHub (lo realizo yo), se prueba la aplicación hasta donde llevamos.

#### Prueba de run demo CLI

```text
PS C:\Users\javir\Desktop\SpeedParadigm> npm run demo:cli -- "Añade una página de contacto" --mock --memory

> agent-team@0.1.0 demo:cli
> tsx --env-file=.env.local scripts/demo-cli.ts Añade una página de contacto --mock --memory

Run 627d2271-91f4-4518-9b65-e87f0b4ff1d4 · LLM: mock (mock-demo) · almacén: memoria

18:03:07 Sistema ▶ Run creado. Se ha copiado la web semilla (5 archivos) al workspace.
18:03:07 Orquestador ▶ Analizando la petición y planificando las tareas
18:03:07 Orquestador … Leyendo la petición y los 5 archivos de la web
18:03:07 Orquestador ✓ Plan listo con 2 tareas: Crearé una página de contacto con formulario y la enlazaré desde la navegación de todas las páginas.
18:03:08 Develop ▶ Trabajando en «Crear la página de contacto» (intento 1/3)
18:03:08 Develop · Creando contacto.html
18:03:08 Develop ✓ He completado «Crear la página de contacto».
18:03:09 Testing ▶ Revisando «Crear la página de contacto» (intento 1/3)
18:03:09 Testing ✓ «Crear la página de contacto» supera las pruebas
```

#### Prueba de la aplicación con el LLM configurado, API e interfaz `.tsx`

```bash
npm run dev   # localhost:3000
```

Una vez construida la interfaz, se realizó una batería de pruebas manuales en local. El objetivo era comprobar que el panel muestra correctamente qué hace cada agente y en qué estado está cada tarea, y que el sistema se comporta bien ante errores.

| Prueba | Qué se comprueba |
|---|---|
| **A. Camino feliz** | Se lanza una petición («Añade una página de contacto con formulario») y se sigue el run: se ilumina el agente activo, las tareas pasan por Pendiente, En curso, En pruebas y Completada, la línea de tiempo se llena sola y aparece el resumen final. |
| **B. Inspección del resultado** | Panel de detalle de cada tarea (intentos, veredicto por criterio, checks automáticos, feedback), vista previa de la web con el enlace «Contacto» en todas las páginas, envío del formulario y visor de código. |
| **C. Tiempo real** | Dos pestañas con el mismo run se actualizan a la vez (el bloqueo de pasos hace que se turnen). Pausar y Reanudar funcionan. |
| **D. Errores** | Petición demasiado corta (botón desactivado), petición que no es de la web (termina con 0 tareas y una explicación), run o vista previa inexistentes (mensajes claros) y límite de runs por hora (error 429). |

### 5. Errores y soluciones

Al probar la aplicación con Gemini real aparecieron varios fallos. Los resolví con Claude Code midiendo cada causa en vez de suponerla. Iba haciendo pruebas en `localhost:3000` con el LLM conectado e iba viendo con Claude Code cómo solucionar los problemas, ya que fallaba y no se completaban adecuadamente las peticiones.

- **Cuota agotada.** El modelo que usaba (Gemini 3.5/3.6 Flash) tiene en el plan gratuito solo 20 peticiones al día y 5 por minuto, y se agotó en las primeras pruebas. *Solución:* cambiar a `gemini-3.5-flash-lite`, que ofrece 500 al día y 15 por minuto y además es el más rápido. Es el modelo final de la entrega.

- **Llamadas muy lentas (36-52 s).** Un ajuste de nuestro código (`thinkingLevel`) ayudaba a los modelos grandes pero empeoraba a los Lite. *Solución:* no enviarlo a los modelos «lite». Pasaron a 5-10 s.

- **Run que moría por un error de plazos.** Cuando quedaban menos de 10 s en un paso, Gemini rechazaba la llamada y la app daba el run por perdido. *Solución:* si queda poco tiempo, se pausa con suavidad y se continúa en el paso siguiente.

- **Errores 503 de Google («high demand»).** Son saturación del plan gratuito y no dependen de nosotros; llegan en ráfagas cortas. *Solución:* reanudación automática: la app espera 20 s con cuenta atrás visible y sigue sola, hasta 3 veces seguidas.

### 6. Final

Una vez que los errores se solucionaron, Claude terminó la aplicación correctamente y completó su documentación.
