-- 0002_run_quota: saca el hash de la IP de `runs` (que tiene lectura pública y
-- va por Realtime) a una tabla privada, mantiene `updated_at` con un trigger y
-- concede los privilegios de la Data API.

-- 0) Privilegios. Este proyecto NO concede privilegios automáticos a los roles
--    de la API sobre tablas creadas por SQL (sin esto, hasta la clave secreta
--    recibe "permission denied"). El RLS sigue decidiendo qué filas se ven.
grant usage on schema public to anon, authenticated, service_role;
grant select on table runs, tasks, test_reports, agent_events, files to anon, authenticated;
grant select, insert, update, delete on table runs, tasks, test_reports, agent_events, files to service_role;
grant usage, select on all sequences in schema public to service_role;

-- 1) Tabla privada para la protección de cuota.
--    RLS activado y SIN políticas: solo la clave secreta (service_role) puede
--    leerla o escribirla. Ni la clave publishable ni Realtime la ven.
create table run_quota (
  run_id uuid primary key references runs(id) on delete cascade,
  client_ip_hash text not null,
  created_at timestamptz not null default now()
);

create index on run_quota (created_at desc);
create index on run_quota (client_ip_hash, created_at desc);

alter table run_quota enable row level security;

-- Por si el proyecto concede privilegios por defecto a los roles públicos.
revoke all on table run_quota from anon, authenticated;
grant select, insert, update, delete on table run_quota to service_role;

-- 2) Mover los hashes que ya existan (si hay runs de prueba) y quitar la columna.
insert into run_quota (run_id, client_ip_hash, created_at)
select id, client_ip_hash, created_at from runs where client_ip_hash is not null;

alter table runs drop column client_ip_hash;

-- 3) updated_at automático en cada UPDATE.
create or replace function set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger runs_set_updated_at before update on runs
  for each row execute function set_updated_at();
create trigger tasks_set_updated_at before update on tasks
  for each row execute function set_updated_at();
create trigger files_set_updated_at before update on files
  for each row execute function set_updated_at();
