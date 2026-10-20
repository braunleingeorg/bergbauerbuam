-- Bergbauerbuam – Datenbank
-- Einmal komplett im Supabase SQL Editor ausführen (Run).

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#f2b632',
  emoji text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists evenings (
  id uuid primary key default gen_random_uuid(),
  title text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists drinks (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid references evenings(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);

create table if not exists chugs (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid references evenings(id) on delete set null,
  player_id uuid not null references players(id) on delete cascade,
  kind text not null,
  ms integer not null check (ms > 0),
  created_at timestamptz not null default now()
);

create table if not exists departures (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid not null references evenings(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  entered_by uuid references players(id) on delete set null,
  left_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (evening_id, player_id)
);

create table if not exists pukes (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid references evenings(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid not null references evenings(id) on delete cascade,
  category text not null,
  voter_id uuid not null references players(id) on delete cascade,
  target_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (evening_id, category, voter_id)
);

-- Zugriff: Jeder mit dem Link darf lesen und eintragen (keine Accounts nötig)
do $$
declare t text;
begin
  foreach t in array array['players','evenings','drinks','chugs','departures','pukes','votes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "crew_all" on %I', t);
    execute format('create policy "crew_all" on %I for all to anon, authenticated using (true) with check (true)', t);
    execute format('grant select, insert, update, delete on %I to anon, authenticated', t);
  end loop;
end $$;

-- Live-Updates auf allen Handys
do $$
declare t text;
begin
  foreach t in array array['players','evenings','drinks','chugs','departures','pukes','votes'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
