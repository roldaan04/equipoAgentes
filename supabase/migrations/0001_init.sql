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
