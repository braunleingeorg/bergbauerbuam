-- Bergbauerbuam – Datenbank
-- Teil 1 und Teil 2 nacheinander im Supabase SQL Editor ausführen (Run).

-- ===== Teil 1: Tabellen und Zugriff =====
create table if not exists players (id uuid primary key default gen_random_uuid(), name text not null, color text not null default '#f2b632', emoji text, active boolean not null default true, created_at timestamptz not null default now());
create table if not exists evenings (id uuid primary key default gen_random_uuid(), title text, started_at timestamptz not null default now(), ended_at timestamptz, created_at timestamptz not null default now());
create table if not exists drinks (id uuid primary key default gen_random_uuid(), evening_id uuid references evenings(id) on delete cascade, player_id uuid not null references players(id) on delete cascade, kind text not null, created_at timestamptz not null default now());
create table if not exists chugs (id uuid primary key default gen_random_uuid(), evening_id uuid references evenings(id) on delete set null, player_id uuid not null references players(id) on delete cascade, kind text not null, ms integer not null check (ms > 0), created_at timestamptz not null default now());
create table if not exists departures (id uuid primary key default gen_random_uuid(), evening_id uuid not null references evenings(id) on delete cascade, player_id uuid not null references players(id) on delete cascade, entered_by uuid references players(id) on delete set null, left_at timestamptz not null default now(), created_at timestamptz not null default now(), unique (evening_id, player_id));
create table if not exists pukes (id uuid primary key default gen_random_uuid(), evening_id uuid references evenings(id) on delete cascade, player_id uuid not null references players(id) on delete cascade, created_at timestamptz not null default now());
create table if not exists votes (id uuid primary key default gen_random_uuid(), evening_id uuid not null references evenings(id) on delete cascade, category text not null, voter_id uuid not null references players(id) on delete cascade, target_id uuid not null references players(id) on delete cascade, created_at timestamptz not null default now(), unique (evening_id, category, voter_id));

alter table players enable row level security;
alter table evenings enable row level security;
alter table drinks enable row level security;
alter table chugs enable row level security;
alter table departures enable row level security;
alter table pukes enable row level security;
alter table votes enable row level security;

drop policy if exists crew_all on players;
drop policy if exists crew_all on evenings;
drop policy if exists crew_all on drinks;
drop policy if exists crew_all on chugs;
drop policy if exists crew_all on departures;
drop policy if exists crew_all on pukes;
drop policy if exists crew_all on votes;

create policy crew_all on players for all to anon, authenticated using (true) with check (true);
create policy crew_all on evenings for all to anon, authenticated using (true) with check (true);
create policy crew_all on drinks for all to anon, authenticated using (true) with check (true);
create policy crew_all on chugs for all to anon, authenticated using (true) with check (true);
create policy crew_all on departures for all to anon, authenticated using (true) with check (true);
create policy crew_all on pukes for all to anon, authenticated using (true) with check (true);
create policy crew_all on votes for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on players, evenings, drinks, chugs, departures, pukes, votes to anon, authenticated;

-- ===== Teil 2: Live-Updates (nur einmal ausführen) =====
alter publication supabase_realtime add table players, evenings, drinks, chugs, departures, pukes, votes;
