-- Bergbauerbuam – Update 2: Admin, PIN-Login, Profilbilder, Löschrechte
-- Komplett im Supabase SQL Editor einfügen und Run.

create extension if not exists pgcrypto with schema extensions;

alter table players add column if not exists avatar text;
alter table players add column if not exists pin_hash text;
alter table players add column if not exists is_admin boolean not null default false;
alter table players add column if not exists claimed boolean generated always as (pin_hash is not null) stored;

update players set is_admin = true where lower(trim(name)) = 'georg';

-- Spieler: lesen ja (ohne PIN), ändern nur über die Funktionen unten
revoke all on players from anon, authenticated;
grant select (id, name, color, emoji, active, created_at, avatar, is_admin, claimed) on players to anon, authenticated;

-- Löschen nur noch über bbb_delete (Admin darf alles, andere nur frische Einträge)
revoke delete on evenings, drinks, chugs, departures, pukes, votes from anon, authenticated;
revoke update on drinks, chugs, departures, pukes from anon, authenticated;

create or replace function bbb_check(p_player uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  select pin_hash into h from players where id = p_player;
  return h is not null and h = crypt(coalesce(p_pin, ''), h);
end $$;

create or replace function bbb_is_admin(p_player uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  return bbb_check(p_player, p_pin) and exists (select 1 from players where id = p_player and is_admin);
end $$;

create or replace function bbb_claim(p_player uuid, p_pin text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare h text;
begin
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'Die PIN muss aus 4 Ziffern bestehen'; end if;
  select pin_hash into h from players where id = p_player and active;
  if not found then return false; end if;
  if h is null then
    update players set pin_hash = crypt(p_pin, gen_salt('bf')) where id = p_player;
    return true;
  end if;
  return h = crypt(p_pin, h);
end $$;

create or replace function bbb_change_pin(p_player uuid, p_pin text, p_new text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not bbb_check(p_player, p_pin) then raise exception 'Alte PIN stimmt nicht'; end if;
  if p_new is null or p_new !~ '^[0-9]{4}$' then raise exception 'Die PIN muss aus 4 Ziffern bestehen'; end if;
  update players set pin_hash = crypt(p_new, gen_salt('bf')) where id = p_player;
end $$;

create or replace function bbb_reset_pin(p_player uuid, p_pin text, p_target uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not bbb_is_admin(p_player, p_pin) then raise exception 'Nur der Admin darf PINs zurücksetzen'; end if;
  update players set pin_hash = null where id = p_target;
end $$;

create or replace function bbb_add_player(p_player uuid, p_pin text, p_name text, p_color text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  if not bbb_is_admin(p_player, p_pin) then raise exception 'Nur der Admin darf neue Leute hinzufügen'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name fehlt'; end if;
  insert into players (name, color) values (left(trim(p_name), 20), coalesce(p_color, '#f2b632')) returning id into new_id;
  return new_id;
end $$;

create or replace function bbb_update_player(p_player uuid, p_pin text, p_target uuid, p_name text, p_color text, p_emoji text, p_avatar text, p_active boolean)
returns void
language plpgsql security definer set search_path = public, extensions as $$
declare adm boolean;
begin
  if not bbb_check(p_player, p_pin) then raise exception 'Bitte neu anmelden'; end if;
  adm := bbb_is_admin(p_player, p_pin);
  if p_target <> p_player and not adm then raise exception 'Du kannst nur dein eigenes Profil ändern'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name fehlt'; end if;
  if p_avatar is not null and length(p_avatar) > 300000 then raise exception 'Bild ist zu groß'; end if;
  update players set
    name = left(trim(p_name), 20),
    color = coalesce(p_color, color),
    emoji = nullif(trim(coalesce(p_emoji, '')), ''),
    avatar = p_avatar,
    active = case when adm then coalesce(p_active, active) else active end
  where id = p_target;
end $$;

create or replace function bbb_delete(p_player uuid, p_pin text, p_table text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare adm boolean; created timestamptz; voter uuid;
begin
  if not bbb_check(p_player, p_pin) then raise exception 'Bitte neu anmelden'; end if;
  if p_table not in ('evenings', 'drinks', 'chugs', 'departures', 'pukes', 'votes') then raise exception 'Ungültige Tabelle'; end if;
  adm := bbb_is_admin(p_player, p_pin);
  if not adm then
    if p_table = 'evenings' then raise exception 'Nur der Admin darf Abende löschen'; end if;
    if p_table = 'votes' then
      select voter_id into voter from votes where id = p_id;
      if voter is distinct from p_player then raise exception 'Du kannst nur deine eigene Stimme ändern'; end if;
    elsif p_table <> 'departures' then
      execute format('select created_at from %I where id = $1', p_table) into created using p_id;
      if created < now() - interval '10 minutes' then raise exception 'Ältere Einträge kann nur der Admin löschen'; end if;
    end if;
  end if;
  execute format('delete from %I where id = $1', p_table) using p_id;
end $$;

grant execute on function bbb_check(uuid, text) to anon, authenticated;
revoke execute on function bbb_is_admin(uuid, text) from public, anon, authenticated;
grant execute on function bbb_claim(uuid, text) to anon, authenticated;
grant execute on function bbb_change_pin(uuid, text, text) to anon, authenticated;
grant execute on function bbb_reset_pin(uuid, text, uuid) to anon, authenticated;
grant execute on function bbb_add_player(uuid, text, text, text) to anon, authenticated;
grant execute on function bbb_update_player(uuid, text, uuid, text, text, text, text, boolean) to anon, authenticated;
grant execute on function bbb_delete(uuid, text, text, uuid) to anon, authenticated;

