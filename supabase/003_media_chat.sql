-- Bergbauerbuam – Update 3: Album (Fotos/Videos), Rekord-Videos, Chat
-- Komplett im Supabase SQL Editor einfügen und Run.

create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid references evenings(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  chug_id uuid references chugs(id) on delete set null,
  kind text not null default 'photo',
  path text not null,
  caption text,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  evening_id uuid references evenings(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  body text,
  media_id uuid references media(id) on delete set null,
  reactions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table media enable row level security;
alter table messages enable row level security;
drop policy if exists crew_all on media;
drop policy if exists crew_all on messages;
create policy crew_all on media for all to anon, authenticated using (true) with check (true);
create policy crew_all on messages for all to anon, authenticated using (true) with check (true);
grant select, insert on media, messages to anon, authenticated;
grant update (reactions) on messages to anon, authenticated;
grant update (caption) on media to anon, authenticated;

alter publication supabase_realtime add table media, messages;

-- Speicher für Fotos und Videos (max. 50 MB pro Datei)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists bbb_media_read on storage.objects;
drop policy if exists bbb_media_insert on storage.objects;
drop policy if exists bbb_media_delete on storage.objects;
create policy bbb_media_read on storage.objects for select to anon, authenticated using (bucket_id = 'media');
create policy bbb_media_insert on storage.objects for insert to anon, authenticated with check (bucket_id = 'media');
create policy bbb_media_delete on storage.objects for delete to anon, authenticated using (bucket_id = 'media');

-- Löschen: jetzt auch Fotos und Chat-Nachrichten
create or replace function bbb_delete(p_player uuid, p_pin text, p_table text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare adm boolean; created timestamptz; owner uuid;
begin
  if not bbb_check(p_player, p_pin) then raise exception 'Bitte neu anmelden'; end if;
  if p_table not in ('evenings', 'drinks', 'chugs', 'departures', 'pukes', 'votes', 'media', 'messages') then raise exception 'Ungültige Tabelle'; end if;
  adm := bbb_is_admin(p_player, p_pin);
  if not adm then
    if p_table = 'evenings' then raise exception 'Nur der Admin darf Abende löschen'; end if;
    if p_table = 'votes' then
      select voter_id into owner from votes where id = p_id;
      if owner is distinct from p_player then raise exception 'Du kannst nur deine eigene Stimme ändern'; end if;
    elsif p_table in ('media', 'messages') then
      execute format('select player_id from %I where id = $1', p_table) into owner using p_id;
      if owner is distinct from p_player then raise exception 'Du kannst nur deine eigenen Beiträge löschen'; end if;
    elsif p_table <> 'departures' then
      execute format('select created_at from %I where id = $1', p_table) into created using p_id;
      if created < now() - interval '10 minutes' then raise exception 'Ältere Einträge kann nur der Admin löschen'; end if;
    end if;
  end if;
  execute format('delete from %I where id = $1', p_table) using p_id;
end $$;
