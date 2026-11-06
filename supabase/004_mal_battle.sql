-- Bergbauerbuam – Update 4: Mal-Battle
create table if not exists draw_rounds (id uuid primary key default gen_random_uuid(), evening_id uuid references evenings(id) on delete set null, created_by uuid references players(id) on delete set null, prompt text not null, category text not null default 'bier', duration int not null default 30 check (duration between 10 and 120), started_at timestamptz not null default now(), created_at timestamptz not null default now());
create table if not exists drawings (id uuid primary key default gen_random_uuid(), round_id uuid not null references draw_rounds(id) on delete cascade, player_id uuid not null references players(id) on delete cascade, image text not null check (length(image) < 400000), created_at timestamptz not null default now(), unique (round_id, player_id));
create table if not exists draw_votes (id uuid primary key default gen_random_uuid(), round_id uuid not null references draw_rounds(id) on delete cascade, voter_id uuid not null references players(id) on delete cascade, drawing_id uuid not null references drawings(id) on delete cascade, category text not null check (category in ('best', 'worst')), created_at timestamptz not null default now(), unique (round_id, voter_id, category));

alter table draw_rounds enable row level security;
alter table drawings enable row level security;
alter table draw_votes enable row level security;
drop policy if exists crew_all on draw_rounds;
drop policy if exists crew_all on drawings;
drop policy if exists crew_all on draw_votes;
create policy crew_all on draw_rounds for all to anon, authenticated using (true) with check (true);
create policy crew_all on drawings for all to anon, authenticated using (true) with check (true);
create policy crew_all on draw_votes for all to anon, authenticated using (true) with check (true);
grant select, insert on draw_rounds, drawings, draw_votes to anon, authenticated;
grant update (drawing_id) on draw_votes to anon, authenticated;
grant update (image) on drawings to anon, authenticated;

alter publication supabase_realtime add table draw_rounds, drawings, draw_votes;

create or replace function bbb_now() returns timestamptz language sql stable as $$ select now() $$;
grant execute on function bbb_now() to anon, authenticated;

create or replace function bbb_delete(p_player uuid, p_pin text, p_table text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare adm boolean; created timestamptz; owner uuid;
begin
  if not bbb_check(p_player, p_pin) then raise exception 'Bitte neu anmelden'; end if;
  if p_table not in ('evenings', 'drinks', 'chugs', 'departures', 'pukes', 'votes', 'media', 'messages', 'draw_rounds', 'drawings') then raise exception 'Ungültige Tabelle'; end if;
  adm := bbb_is_admin(p_player, p_pin);
  if not adm then
    if p_table in ('evenings', 'draw_rounds') then raise exception 'Das darf nur der Admin löschen'; end if;
    if p_table = 'votes' then
      select voter_id into owner from votes where id = p_id;
      if owner is distinct from p_player then raise exception 'Du kannst nur deine eigene Stimme ändern'; end if;
    elsif p_table in ('media', 'messages', 'drawings') then
      execute format('select player_id from %I where id = $1', p_table) into owner using p_id;
      if owner is distinct from p_player then raise exception 'Du kannst nur deine eigenen Beiträge löschen'; end if;
    elsif p_table <> 'departures' then
      execute format('select created_at from %I where id = $1', p_table) into created using p_id;
      if created < now() - interval '10 minutes' then raise exception 'Ältere Einträge kann nur der Admin löschen'; end if;
    end if;
  end if;
  execute format('delete from %I where id = $1', p_table) using p_id;
end $$;
