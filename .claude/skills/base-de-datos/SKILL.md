---
name: base-de-datos
description: Esquema de Supabase (runs, tasks, test_reports, agent_events, files), RLS, Realtime, clientes server/browser y reglas de migraciones. Úsala al tocar SQL, tipos de BD o src/lib/supabase/.
---

# Base de datos (Supabase, plan Free)

## Reglas
- Las migraciones van en `supabase/migrations/NNNN_nombre.sql`. **Claude Code las escribe y el programador las ejecuta** en el SQL Editor de Supabase. Al crear una, avisa con la ruta exacta.
- Nunca se edita una migración ya ejecutada: si hay que cambiar algo, se crea una nueva.
- Lectura pública (es una demo); **todas las escrituras van desde el servidor con la clave secreta**.

## Migración inicial — `0001_init.sql`
```sql
create extension if not exists "pgcrypto";

create table runs (
  id uuid primary key default gen_random_uuid(),
  request text not null check (char_length(request) between 5 and 1000),
  status text not null default 'queued'
    check (status in ('queued','running','completed','completed_with_errors','error')),
  current_agent text check (current_agent in ('orchestrator','develop','testing')),
  current_action text,
  plan_summary text,
  final_summary text,
  locked_until timestamptz,
  client_ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  position int not null,
  title text not null,
  description text not null,
  acceptance_criteria jsonb not null default '[]',
  status text not null default 'pending'
    check (status in ('pending','in_progress','testing','changes_requested','done','failed')),
  assignee text not null default 'develop',
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, position)
);

create table test_reports (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  run_id uuid not null references runs(id) on delete cascade,
  attempt int not null,
  passed boolean not null,
  deterministic_checks jsonb not null default '[]',
  results jsonb not null default '[]',
  feedback text,
  created_at timestamptz not null default now()
);

create table agent_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references runs(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  agent text not null check (agent in ('orchestrator','develop','testing','system')),
  type text not null check (type in ('status','thinking','action','result','error')),
  message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table files (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs(id) on delete cascade,
  path text not null,
  content text not null,
  updated_by text,                 -- 'seed' | 'develop'
  updated_at timestamptz not null default now(),
  unique (run_id, path)
);

create index on tasks (run_id, position);
create index on agent_events (run_id, id);
create index on test_reports (task_id, attempt);
create index on runs (created_at desc);

alter table runs enable row level security;
alter table tasks enable row level security;
alter table test_reports enable row level security;
alter table agent_events enable row level security;
alter table files enable row level security;

create policy "public read" on runs for select using (true);
create policy "public read" on tasks for select using (true);
create policy "public read" on test_reports for select using (true);
create policy "public read" on agent_events for select using (true);
create policy "public read" on files for select using (true);

alter publication supabase_realtime add table runs, tasks, agent_events, test_reports;
```

Notas:
- Como la lectura es pública, en la API usar siempre listas de columnas explícitas (`RUN_COLUMNS`, etc. en `types.ts`), nunca `select *`.

## Migración `0002_run_quota.sql` (cambia la 0001)
- **Privilegios**: este proyecto de Supabase NO concede privilegios automáticos a los roles de la API (`anon`, `authenticated`, `service_role`) sobre las tablas creadas por SQL. Sin `GRANT`, hasta la clave secreta recibe `42501 permission denied`. Regla: **toda tabla nueva lleva sus `GRANT` en la misma migración** (`select` a `anon, authenticated` si es pública; `select, insert, update, delete` a `service_role`; secuencias a `service_role`).
- **`client_ip_hash` sale de `runs`** a la tabla privada `run_quota (run_id, client_ip_hash, created_at)`, con RLS y sin políticas: solo la clave secreta la lee. Así no se expone por la lectura pública ni por Realtime. Guarda un hash SHA-256 de la IP con sal, nunca la IP en claro.
- **`updated_at`** lo mantiene un trigger (`set_updated_at`) en `runs`, `tasks` y `files`: el código no lo toca.
- `npm run db:check` comprueba la conexión, los privilegios, la lectura pública y que la 0002 esté aplicada, sin imprimir claves.

## Lock del paso
Tomarlo con un UPDATE condicional y comprobar que devuelve fila:
```sql
update runs set locked_until = now() + interval '90 seconds'
where id = $1 and (locked_until is null or locked_until < now())
returning id;
```
Liberarlo (`locked_until = null`) en un `finally`. Si no devuelve fila → la API responde `409`.

## Clientes — `src/lib/supabase/`
- `admin.ts`: `createAdminClient()` con `SUPABASE_SECRET_KEY`, `persistSession: false`. Todas las escrituras van por aquí. **Sin `server-only`**, para que la CLI y los scripts (tsx) puedan usarlo.
- `server.ts`: `import 'server-only'` y reexporta `admin.ts` como `createServerClient`. La app de Next importa siempre desde aquí.
- `browser.ts`: `getBrowserClient()` con `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Solo lectura y Realtime.
- `types.ts`: tipos escritos a mano según el esquema (`Run`, `Task`, `TestReport`, `AgentEvent`, `WorkspaceFile`, `RunQuota`, uniones de status), el tipo `Database` para supabase-js y las listas de columnas públicas.

## Free tier
Supabase pausa los proyectos gratuitos tras unos días sin actividad. Si la app devuelve errores de conexión, lo primero es comprobar en el dashboard que el proyecto no esté pausado.
