create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_name text not null default '',
  status text not null check (status in ('نجحت', 'فشلت', 'ألغيت')),
  details text not null default '',
  actor_name text not null default '',
  actor_role text not null default '',
  created_at timestamptz not null default now()
);

alter table if exists public.activity_logs disable row level security;

create index if not exists activity_logs_created_at_idx on public.activity_logs (created_at desc);
